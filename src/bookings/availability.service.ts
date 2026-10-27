import { HttpStatus, Injectable } from '@nestjs/common';
import { BookingStatus, Prisma } from '../generated/prisma/client';
import { AppException, ErrorCode } from '../common/errors/error-codes';
import {
  addDays,
  isValidDateString,
  minutesToHHmm,
  weekdayOf,
  zonedDateString,
  zonedToUtc,
} from '../common/utils/time.util';
import { I18nService } from '../i18n/i18n.service';
import { PrismaService } from '../prisma/prisma.service';
import { BookingSettings } from './booking-settings';

/** Statuses that occupy a specialist's time. */
export const BLOCKING_STATUSES: BookingStatus[] = ['CONFIRMED', 'WAITING', 'IN_PROGRESS'];

// PrismaService works here too: it is a superset of a transaction client.
type Db = Prisma.TransactionClient;

export interface Slot {
  /** "08:30" in the salon timezone */
  time: string;
  startAt: string; // ISO UTC
  endAt: string;
  available: boolean;
  /** Specialists free for the whole slot */
  specialistIds: string[];
}

/**
 * Time slots are calculated, never stored:
 * opening hours of that weekday, cut into steps, minus the specialists' existing bookings.
 */
@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: BookingSettings,
    private readonly i18n: I18nService,
  ) {}

  async forDay(params: {
    salonId: string;
    date: string;
    serviceIds?: string[];
    specialistId?: string;
    lang: string;
    db?: Db;
  }) {
    const db = params.db ?? this.prisma;
    const salon = await db.salon.findFirst({
      where: { id: params.salonId, status: 'ACTIVE', deletedAt: null },
      include: {
        openingHours: true,
        specialists: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!salon) throw new AppException(ErrorCode.SALON_NOT_FOUND, HttpStatus.NOT_FOUND, 'Salon not found');

    const tz = salon.timezone;
    this.assertDateInRange(params.date, tz);

    const services = params.serviceIds?.length ? await this.loadServices(salon.id, params.serviceIds, db) : [];
    const durationMinutes = services.length
      ? services.reduce((sum, s) => sum + s.durationMinutes, 0)
      : this.settings.defaultDurationMinutes;

    let specialists = salon.specialists;
    if (params.specialistId) {
      specialists = specialists.filter((s) => s.id === params.specialistId);
      if (!specialists.length) {
        throw new AppException(ErrorCode.SPECIALIST_NOT_FOUND, HttpStatus.NOT_FOUND, 'Specialist not found');
      }
    }

    const ranges = salon.openingHours
      .filter((h) => h.weekday === weekdayOf(params.date))
      .sort((a, b) => a.openMinute - b.openMinute);

    const dayStart = zonedToUtc(params.date, 0, tz);
    const dayEnd = zonedToUtc(addDays(params.date, 1), 0, tz);
    const busy = specialists.length
      ? await db.booking.findMany({
          where: {
            specialistId: { in: specialists.map((s) => s.id) },
            status: { in: BLOCKING_STATUSES },
            startAt: { lt: dayEnd },
            endAt: { gt: dayStart },
          },
          select: { specialistId: true, startAt: true, endAt: true },
        })
      : [];

    const earliest = Date.now() + this.settings.minLeadMinutes * 60_000;
    const step = this.settings.slotStepMinutes;
    const slots: Slot[] = [];

    for (const range of ranges) {
      for (let m = range.openMinute; m + durationMinutes <= range.closeMinute; m += step) {
        const start = zonedToUtc(params.date, m, tz);
        const end = new Date(start.getTime() + durationMinutes * 60_000);
        const free =
          start.getTime() < earliest
            ? []
            : specialists
                .filter(
                  (sp) =>
                    !busy.some(
                      (b) => b.specialistId === sp.id && b.startAt < end && b.endAt > start,
                    ),
                )
                .map((sp) => sp.id);
        slots.push({
          time: minutesToHHmm(m),
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          available: free.length > 0,
          specialistIds: free,
        });
      }
    }

    return {
      date: params.date,
      timezone: tz,
      isOpen: ranges.length > 0,
      durationMinutes,
      specialists: specialists.map((s) => ({
        id: s.id,
        name: s.name,
        title: this.i18n.pick(s.title, params.lang),
        avatarUrl: s.avatarUrl,
      })),
      slots,
    };
  }

  /** Active services of this salon, in the order requested. Throws if any id is wrong. */
  async loadServices(salonId: string, serviceIds: string[], db: Db = this.prisma) {
    const rows = await db.service.findMany({
      where: { id: { in: serviceIds }, salonId, isActive: true, deletedAt: null },
    });
    if (rows.length !== new Set(serviceIds).size) {
      throw new AppException(ErrorCode.SERVICE_NOT_FOUND, HttpStatus.BAD_REQUEST, 'One or more services are not available');
    }
    const byId = new Map(rows.map((r) => [r.id, r]));
    return serviceIds.map((id) => byId.get(id)!);
  }

  private assertDateInRange(date: string, tz: string) {
    if (!isValidDateString(date)) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Invalid date');
    }
    const today = zonedDateString(new Date(), tz);
    const last = addDays(today, this.settings.maxDaysAhead);
    if (date < today || date > last) {
      throw new AppException(ErrorCode.DATE_OUT_OF_RANGE, HttpStatus.BAD_REQUEST, 'Date out of range', {
        minDate: today,
        maxDate: last,
      });
    }
  }
}
