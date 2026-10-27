import { Prisma } from '../generated/prisma/client';
import { zonedDateString, zonedTimeString } from '../common/utils/time.util';
import { I18nService } from '../i18n/i18n.service';

/** Everything a booking card / detail / receipt needs, loaded in one query. */
export const bookingInclude = {
  salon: true,
  specialist: true,
  services: true,
  review: true,
} satisfies Prisma.BookingInclude;

export type BookingWithRelations = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

export function toBookingResponse(b: BookingWithRelations, i18n: I18nService, lang: string) {
  const tz = b.salon.timezone;
  const now = Date.now();
  const minutes = (ms: number) => Math.max(0, Math.round(ms / 60_000));

  return {
    id: b.id,
    reference: b.reference,
    status: b.status,
    startAt: b.startAt,
    endAt: b.endAt,
    // Already in the salon's timezone, so the app shows the salon's wall-clock time.
    localDate: zonedDateString(b.startAt, tz),
    localTime: zonedTimeString(b.startAt, tz),
    localEndTime: zonedTimeString(b.endAt, tz),
    timezone: tz,
    durationMinutes: minutes(b.endAt.getTime() - b.startAt.getTime()),
    /** "Estimated time" on the Waiting step */
    minutesUntilStart: b.status === 'CONFIRMED' || b.status === 'WAITING' ? minutes(b.startAt.getTime() - now) : null,
    /** Countdown on the In progress step */
    minutesRemaining: b.status === 'IN_PROGRESS' ? minutes(b.endAt.getTime() - now) : null,
    location: b.location,
    paymentMethod: b.paymentMethod,
    salon: {
      id: b.salon.id,
      name: b.salon.name,
      coverImageUrl: b.salon.coverImageUrl,
      addressLine: b.salon.addressLine,
      city: b.salon.city,
      latitude: b.salon.latitude,
      longitude: b.salon.longitude,
      phone: b.salon.phone,
      rating: b.salon.avgRating,
      reviewCount: b.salon.reviewCount,
    },
    specialist: b.specialist
      ? {
          id: b.specialist.id,
          name: b.specialist.name,
          title: i18n.pick(b.specialist.title, lang),
          avatarUrl: b.specialist.avatarUrl,
        }
      : null,
    services: b.services.map((s) => ({
      id: s.serviceId,
      name: i18n.pick(s.name, lang),
      priceCents: s.priceCents,
      durationMinutes: s.durationMinutes,
    })),
    subtotalCents: b.subtotalCents,
    serviceFeeCents: b.serviceFeeCents,
    discountCents: b.discountCents,
    totalCents: b.totalCents,
    currency: b.currency,
    couponCode: b.couponCode,
    notes: b.notes,
    cancelReason: b.cancelReason,
    canCancel: b.status === 'CONFIRMED',
    canReview: b.status === 'COMPLETED' && !b.review,
    review: b.review ? { rating: b.review.rating, comment: b.review.comment, tags: b.review.tags } : null,
    createdAt: b.createdAt,
  };
}
