import { Module } from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { BookingSettings } from './booking-settings';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { PricingService } from './pricing.service';

@Module({
  controllers: [BookingsController],
  providers: [BookingSettings, AvailabilityService, PricingService, BookingsService],
})
export class BookingsModule {}
