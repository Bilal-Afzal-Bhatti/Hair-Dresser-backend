import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Booking rules from .env, with safe defaults so an older .env keeps working. */
@Injectable()
export class BookingSettings {
  readonly serviceFeeCents: number;
  readonly slotStepMinutes: number;
  readonly minLeadMinutes: number;
  readonly maxDaysAhead: number;
  /** Duration used for the salon "Schedule" tab when no service is chosen yet. */
  readonly defaultDurationMinutes = 30;
  /** Finished bookings stay in the "Active" tab this long, so the customer can rate them. */
  readonly keepCompletedInActiveHours = 48;

  constructor(config: ConfigService) {
    this.serviceFeeCents = int(config.get('SERVICE_FEE_CENTS'), 200, 0);
    this.slotStepMinutes = int(config.get('SLOT_STEP_MINUTES'), 30, 5);
    this.minLeadMinutes = int(config.get('BOOKING_MIN_LEAD_MINUTES'), 30, 0);
    this.maxDaysAhead = int(config.get('BOOKING_MAX_DAYS_AHEAD'), 60, 1);
  }
}

function int(value: unknown, fallback: number, min: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= min ? n : fallback;
}
