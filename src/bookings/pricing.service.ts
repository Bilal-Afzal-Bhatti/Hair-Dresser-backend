import { HttpStatus, Injectable } from '@nestjs/common';
import { Coupon, Prisma, Service } from '../generated/prisma/client';
import { AppException, ErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../prisma/prisma.service';
import { BookingSettings } from './booking-settings';

// PrismaService works here too: it is a superset of a transaction client.
type Db = Prisma.TransactionClient;

export interface PriceBreakdown {
  subtotalCents: number;
  serviceFeeCents: number;
  discountCents: number;
  totalCents: number;
  coupon: Coupon | null;
}

/** Summary on the "Your appointment" screen: services + service fee − coupon. */
@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: BookingSettings,
  ) {}

  async price(params: {
    userId: string;
    salonId: string;
    services: Service[];
    couponCode?: string;
    db?: Db;
  }): Promise<PriceBreakdown> {
    const subtotalCents = params.services.reduce((sum, s) => sum + s.priceCents, 0);
    const serviceFeeCents = this.settings.serviceFeeCents;

    let coupon: Coupon | null = null;
    let discountCents = 0;
    if (params.couponCode) {
      coupon = await this.validateCoupon(params.userId, params.salonId, params.couponCode, subtotalCents, params.db);
      discountCents = coupon.percentOff
        ? Math.round((subtotalCents * coupon.percentOff) / 100)
        : (coupon.amountOffCents ?? 0);
      discountCents = Math.min(discountCents, subtotalCents);
    }

    return {
      subtotalCents,
      serviceFeeCents,
      discountCents,
      totalCents: subtotalCents + serviceFeeCents - discountCents,
      coupon,
    };
  }

  private async validateCoupon(userId: string, salonId: string, code: string, subtotalCents: number, db: Db = this.prisma) {
    const coupon = await db.coupon.findUnique({ where: { code: code.toUpperCase() } });
    if (!coupon || !coupon.isActive || (coupon.salonId && coupon.salonId !== salonId)) {
      throw new AppException(ErrorCode.COUPON_INVALID, HttpStatus.BAD_REQUEST, 'Invalid coupon');
    }
    const now = new Date();
    if ((coupon.startsAt && coupon.startsAt > now) || (coupon.endsAt && coupon.endsAt < now)) {
      throw new AppException(ErrorCode.COUPON_EXPIRED, HttpStatus.BAD_REQUEST, 'Coupon expired');
    }
    if (subtotalCents < coupon.minSubtotalCents) {
      throw new AppException(ErrorCode.COUPON_MIN_NOT_MET, HttpStatus.BAD_REQUEST, 'Order too small for this coupon', {
        minSubtotalCents: coupon.minSubtotalCents,
      });
    }
    const used = await db.booking.count({
      where: { customerId: userId, couponId: coupon.id, status: { not: 'CANCELLED' } },
    });
    if (used >= coupon.maxUsesPerUser) {
      throw new AppException(ErrorCode.COUPON_ALREADY_USED, HttpStatus.BAD_REQUEST, 'Coupon already used');
    }
    return coupon;
  }
}
