import { HttpStatus, Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { BookingStatus, Prisma } from '../generated/prisma/client';
import { AppException, ErrorCode } from '../common/errors/error-codes';
import { zonedDateString } from '../common/utils/time.util';
import { I18nService } from '../i18n/i18n.service';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityService, BLOCKING_STATUSES } from './availability.service';
import { bookingInclude, toBookingResponse } from './booking.mapper';
import { BookingSettings } from './booking-settings';
import { BookingListQueryDto, BookingRequestDto, CreateReviewDto } from './dto/booking.dto';
import { PricingService } from './pricing.service';

const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

/** Allowed status changes from the salon side. */
const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  CONFIRMED: ['WAITING', 'IN_PROGRESS', 'NO_SHOW', 'CANCELLED'],
  WAITING: ['IN_PROGRESS', 'NO_SHOW', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly pricing: PricingService,
    private readonly settings: BookingSettings,
    private readonly i18n: I18nService,
  ) {}

  // ───────────── Quote ("Your appointment" screen, coupon check) ─────────────

  async quote(userId: string, dto: BookingRequestDto, lang: string) {
    const { salon, services, slot, start, end } = await this.resolveRequest(dto, lang);
    const price = await this.pricing.price({ userId, salonId: salon.id, services, couponCode: dto.couponCode });
    return {
      salonId: salon.id,
      startAt: start,
      endAt: end,
      durationMinutes: Math.round((end.getTime() - start.getTime()) / 60_000),
      slotAvailable: slot.available,
      services: services.map((s) => ({
        id: s.id,
        name: this.i18n.pick(s.name, lang),
        priceCents: s.priceCents,
        durationMinutes: s.durationMinutes,
      })),
      subtotalCents: price.subtotalCents,
      serviceFeeCents: price.serviceFeeCents,
      discountCents: price.discountCents,
      totalCents: price.totalCents,
      currency: salon.currency,
      couponCode: price.coupon?.code ?? null,
      paymentMethod: 'PAY_AT_SALON',
    };
  }

  // ───────────── Create ─────────────

  async create(userId: string, dto: BookingRequestDto, lang: string) {
    const booking = await this.prisma.$transaction(
      async (tx) => {
        // One booking at a time per salon: the second request waits here, then sees the first one.
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${dto.salonId}))`;

        const { salon, services, slot, start, end } = await this.resolveRequest(dto, lang, tx);
        if (!slot.available) {
          throw new AppException(ErrorCode.SLOT_UNAVAILABLE, HttpStatus.CONFLICT, 'This time is no longer available');
        }
        const specialistId = dto.specialistId ?? slot.specialistIds[0];

        // Belt and braces: re-check this specialist inside the lock.
        const clash = await tx.booking.count({
          where: { specialistId, status: { in: BLOCKING_STATUSES }, startAt: { lt: end }, endAt: { gt: start } },
        });
        if (clash) {
          throw new AppException(ErrorCode.SLOT_UNAVAILABLE, HttpStatus.CONFLICT, 'This time is no longer available');
        }

        const price = await this.pricing.price({
          userId,
          salonId: salon.id,
          services,
          couponCode: dto.couponCode,
          db: tx,
        });

        return tx.booking.create({
          data: {
            reference: this.newReference(),
            customerId: userId,
            salonId: salon.id,
            specialistId,
            startAt: start,
            endAt: end,
            subtotalCents: price.subtotalCents,
            serviceFeeCents: price.serviceFeeCents,
            discountCents: price.discountCents,
            totalCents: price.totalCents,
            currency: salon.currency,
            couponId: price.coupon?.id,
            couponCode: price.coupon?.code,
            notes: dto.notes,
            services: {
              create: services.map((s) => ({
                serviceId: s.id,
                name: s.name as Prisma.InputJsonValue,
                priceCents: s.priceCents,
                durationMinutes: s.durationMinutes,
              })),
            },
          },
          include: bookingInclude,
        });
      },
      { timeout: 15_000 },
    );
    return toBookingResponse(booking, this.i18n, lang);
  }

  // ───────────── Customer: list / detail / cancel / review ─────────────

  async list(userId: string, query: BookingListQueryDto, lang: string) {
    const recentlyCompleted = new Date(Date.now() - this.settings.keepCompletedInActiveHours * 3_600_000);
    const where: Prisma.BookingWhereInput =
      query.scope === 'active'
        ? {
            customerId: userId,
            OR: [
              { status: { in: BLOCKING_STATUSES } },
              // Just finished and not rated yet: stays in "Active" with the rate button
              { status: 'COMPLETED', review: { is: null }, completedAt: { gte: recentlyCompleted } },
            ],
          }
        : {
            customerId: userId,
            status: { in: ['COMPLETED', 'CANCELLED', 'NO_SHOW'] },
          };

    const [total, rows] = await Promise.all([
      this.prisma.booking.count({ where }),
      this.prisma.booking.findMany({
        where,
        include: bookingInclude,
        orderBy: { startAt: query.scope === 'active' ? 'asc' : 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return {
      items: rows.map((b) => toBookingResponse(b, this.i18n, lang)),
      page: query.page,
      limit: query.limit,
      total,
      hasMore: query.page * query.limit < total,
    };
  }

  async get(userId: string, id: string, lang: string) {
    return toBookingResponse(await this.findOwn(userId, id), this.i18n, lang);
  }

  async cancel(userId: string, id: string, reason: string | undefined, lang: string) {
    const booking = await this.findOwn(userId, id);
    if (booking.status !== 'CONFIRMED') {
      throw new AppException(ErrorCode.BOOKING_NOT_CANCELLABLE, HttpStatus.CONFLICT, 'This booking can no longer be cancelled');
    }
    // Conditional update: if the salon changed the status meanwhile, nothing is updated.
    const res = await this.prisma.booking.updateMany({
      where: { id, status: 'CONFIRMED' },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason },
    });
    if (!res.count) {
      throw new AppException(ErrorCode.BOOKING_NOT_CANCELLABLE, HttpStatus.CONFLICT, 'This booking can no longer be cancelled');
    }
    return this.get(userId, id, lang);
  }

  async review(userId: string, id: string, dto: CreateReviewDto, lang: string) {
    const booking = await this.findOwn(userId, id);
    if (booking.status !== 'COMPLETED') {
      throw new AppException(ErrorCode.REVIEW_NOT_ALLOWED, HttpStatus.CONFLICT, 'You can rate a visit once it is finished');
    }
    if (booking.review) {
      throw new AppException(ErrorCode.REVIEW_ALREADY_EXISTS, HttpStatus.CONFLICT, 'Already rated');
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.review.create({
          data: {
            bookingId: booking.id,
            userId,
            salonId: booking.salonId,
            specialistId: booking.specialistId,
            rating: dto.rating,
            comment: dto.comment?.trim() || null,
            tags: dto.tags ?? [],
          },
        });
        await this.refreshSalonRating(tx, booking.salonId);
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new AppException(ErrorCode.REVIEW_ALREADY_EXISTS, HttpStatus.CONFLICT, 'Already rated');
      }
      throw e;
    }
    return this.get(userId, id, lang);
  }

  // ───────────── Salon side ─────────────

  async listForSalonOwner(user: { id: string; role: string }, date: string | undefined, lang: string) {
    const salons = await this.prisma.salon.findMany({
      where: user.role === 'ADMIN' ? { deletedAt: null } : { ownerId: user.id, deletedAt: null },
      select: { id: true, timezone: true },
    });
    if (!salons.length) return { items: [] };

    const tz = salons[0].timezone;
    const day = date ?? zonedDateString(new Date(), tz);
    const from = new Date(`${day}T00:00:00Z`);
    from.setUTCHours(from.getUTCHours() - 14); // covers every timezone offset
    const to = new Date(from.getTime() + 52 * 3_600_000);

    const rows = await this.prisma.booking.findMany({
      where: { salonId: { in: salons.map((s) => s.id) }, startAt: { gte: from, lt: to } },
      include: { ...bookingInclude, customer: { select: { name: true, phoneCountryCode: true, phone: true } } },
      orderBy: { startAt: 'asc' },
    });
    return {
      items: rows
        .filter((b) => zonedDateString(b.startAt, b.salon.timezone) === day)
        .map((b) => ({
          ...toBookingResponse(b, this.i18n, lang),
          customer: { name: b.customer.name, phone: `${b.customer.phoneCountryCode} ${b.customer.phone}` },
        })),
    };
  }

  async updateStatusAsSalon(
    user: { id: string; role: string },
    id: string,
    status: BookingStatus,
    reason: string | undefined,
    lang: string,
  ) {
    const booking = await this.prisma.booking.findUnique({ where: { id }, include: { salon: true } });
    if (!booking || (user.role !== 'ADMIN' && booking.salon.ownerId !== user.id)) {
      throw new AppException(ErrorCode.BOOKING_NOT_FOUND, HttpStatus.NOT_FOUND, 'Booking not found');
    }
    if (!TRANSITIONS[booking.status].includes(status)) {
      throw new AppException(ErrorCode.INVALID_STATUS_CHANGE, HttpStatus.CONFLICT, `Cannot go from ${booking.status} to ${status}`);
    }

    const now = new Date();
    const data: Prisma.BookingUpdateManyMutationInput = { status };
    if (status === 'WAITING') data.checkedInAt = now;
    if (status === 'IN_PROGRESS') {
      data.startedAt = now;
      // Keep the planned duration from the moment work actually starts.
      const duration = booking.endAt.getTime() - booking.startAt.getTime();
      if (now > booking.startAt) data.endAt = new Date(now.getTime() + duration);
    }
    if (status === 'COMPLETED') data.completedAt = now;
    if (status === 'CANCELLED') {
      data.cancelledAt = now;
      data.cancelReason = reason ?? 'Cancelled by the salon';
    }

    const res = await this.prisma.booking.updateMany({ where: { id, status: booking.status }, data });
    if (!res.count) {
      throw new AppException(ErrorCode.INVALID_STATUS_CHANGE, HttpStatus.CONFLICT, 'Status changed meanwhile, reload');
    }
    const updated = await this.prisma.booking.findUniqueOrThrow({ where: { id }, include: bookingInclude });
    return toBookingResponse(updated, this.i18n, lang);
  }

  // ───────────── Helpers ─────────────

  /** Checks salon, services, specialist and that startAt is one of the salon's slots. */
  private async resolveRequest(dto: BookingRequestDto, lang: string, db?: Prisma.TransactionClient) {
    const client: Prisma.TransactionClient = db ?? this.prisma;
    const salon = await client.salon.findFirst({ where: { id: dto.salonId, status: 'ACTIVE', deletedAt: null } });
    if (!salon) throw new AppException(ErrorCode.SALON_NOT_FOUND, HttpStatus.NOT_FOUND, 'Salon not found');

    const services = await this.availability.loadServices(salon.id, dto.serviceIds, client);
    const start = new Date(dto.startAt);
    const day = await this.availability.forDay({
      salonId: salon.id,
      date: zonedDateString(start, salon.timezone),
      serviceIds: dto.serviceIds,
      specialistId: dto.specialistId,
      lang,
      db: client,
    });
    const slot = day.slots.find((s) => s.startAt === start.toISOString());
    if (!slot) {
      throw new AppException(ErrorCode.SLOT_UNAVAILABLE, HttpStatus.CONFLICT, 'This time is not bookable');
    }
    return { salon, services, slot, start, end: new Date(slot.endAt) };
  }

  private async findOwn(userId: string, id: string) {
    const booking = await this.prisma.booking.findFirst({ where: { id, customerId: userId }, include: bookingInclude });
    if (!booking) throw new AppException(ErrorCode.BOOKING_NOT_FOUND, HttpStatus.NOT_FOUND, 'Booking not found');
    return booking;
  }

  /** Average and count from real reviews, stored on the salon so lists stay fast. */
  private async refreshSalonRating(tx: Prisma.TransactionClient, salonId: string) {
    const agg = await tx.review.aggregate({ where: { salonId }, _avg: { rating: true }, _count: { _all: true } });
    await tx.salon.update({
      where: { id: salonId },
      data: {
        avgRating: Math.round((agg._avg.rating ?? 0) * 10) / 10,
        reviewCount: agg._count._all,
      },
    });
  }

  private newReference() {
    let code = '';
    for (let i = 0; i < 6; i++) code += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
    return `CC-${code}`;
  }
}
