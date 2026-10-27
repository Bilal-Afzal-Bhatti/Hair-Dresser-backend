import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Lang } from '../common/decorators/lang.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AvailabilityService } from './availability.service';
import { BookingsService } from './bookings.service';
import {
  AvailabilityQueryDto,
  BookingListQueryDto,
  BookingRequestDto,
  CancelBookingDto,
  CreateReviewDto,
  ManageBookingsQueryDto,
  UpdateBookingStatusDto,
} from './dto/booking.dto';

@ApiTags('bookings')
@Controller()
export class BookingsController {
  constructor(
    private readonly bookings: BookingsService,
    private readonly availability: AvailabilityService,
  ) {}

  /** Time slots for the Book appointment screen and the salon's Schedule tab. */
  @Public()
  @Get('salons/:id/availability')
  slots(@Param('id') salonId: string, @Query() q: AvailabilityQueryDto, @Lang() lang: string) {
    return this.availability.forDay({ salonId, date: q.date, serviceIds: q.serviceIds, specialistId: q.specialistId, lang });
  }

  /** Price breakdown + coupon check, without booking anything. */
  @ApiBearerAuth()
  @Post('bookings/quote')
  @HttpCode(200)
  quote(@CurrentUser() user: AuthUser, @Body() dto: BookingRequestDto, @Lang() lang: string) {
    return this.bookings.quote(user.id, dto, lang);
  }

  @ApiBearerAuth()
  @Post('bookings')
  create(@CurrentUser() user: AuthUser, @Body() dto: BookingRequestDto, @Lang() lang: string) {
    return this.bookings.create(user.id, dto, lang);
  }

  /** Bookings tab: ?scope=active (default) or ?scope=history */
  @ApiBearerAuth()
  @Get('bookings')
  list(@CurrentUser() user: AuthUser, @Query() q: BookingListQueryDto, @Lang() lang: string) {
    return this.bookings.list(user.id, q, lang);
  }

  @ApiBearerAuth()
  @Get('bookings/:id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string, @Lang() lang: string) {
    return this.bookings.get(user.id, id, lang);
  }

  @ApiBearerAuth()
  @Post('bookings/:id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CancelBookingDto, @Lang() lang: string) {
    return this.bookings.cancel(user.id, id, dto.reason, lang);
  }

  @ApiBearerAuth()
  @Post('bookings/:id/review')
  review(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateReviewDto, @Lang() lang: string) {
    return this.bookings.review(user.id, id, dto, lang);
  }

  // ───────── Salon side (owner or admin) until the salon app exists ─────────

  @ApiTags('salon-manage')
  @ApiBearerAuth()
  @Get('manage/bookings')
  manageList(@CurrentUser() user: AuthUser, @Query() q: ManageBookingsQueryDto, @Lang() lang: string) {
    return this.bookings.listForSalonOwner(user, q.date, lang);
  }

  @ApiTags('salon-manage')
  @ApiBearerAuth()
  @Patch('manage/bookings/:id/status')
  manageStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateBookingStatusDto,
    @Lang() lang: string,
  ) {
    return this.bookings.updateStatusAsSalon(user, id, dto.status, dto.reason, lang);
  }
}
