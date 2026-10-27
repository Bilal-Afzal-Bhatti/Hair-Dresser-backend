import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const csv = ({ value }: { value: unknown }) =>
  Array.isArray(value) ? value : String(value).split(',').map((v) => v.trim()).filter(Boolean);

const upperTrim = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : undefined;

/** GET /salons/:id/availability */
export class AvailabilityQueryDto {
  @ApiProperty({ example: '2026-10-27', description: 'Day in the salon timezone' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date: string;

  @ApiPropertyOptional({ description: 'Comma-separated service ids; their durations are added up' })
  @IsOptional()
  @Transform(csv)
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  serviceIds?: string[];

  @ApiPropertyOptional({ description: 'Only this specialist; omit for "any available"' })
  @IsOptional()
  @IsString()
  specialistId?: string;
}

/** Body of POST /bookings/quote and POST /bookings */
export class BookingRequestDto {
  @ApiProperty()
  @IsString()
  salonId: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsString({ each: true })
  serviceIds: string[];

  @ApiPropertyOptional({ description: 'Omit to let the salon pick any free specialist' })
  @IsOptional()
  @IsString()
  specialistId?: string;

  @ApiProperty({ example: '2026-10-27T08:00:00.000Z', description: 'startAt of a slot from /availability' })
  @IsISO8601({ strict: true })
  startAt: string;

  @ApiPropertyOptional({ example: 'CASA10' })
  @IsOptional()
  @Transform(upperTrim)
  @IsString()
  @MaxLength(32)
  couponCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class BookingListQueryDto {
  @ApiPropertyOptional({ enum: ['active', 'history'], default: 'active' })
  @IsOptional()
  @IsIn(['active', 'history'])
  scope: 'active' | 'history' = 'active';

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;
}

export class CancelBookingDto {
  @ApiPropertyOptional({ example: 'Change of plans' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

/** Tag keys the app shows as chips on the rating screen. */
export const REVIEW_TAGS = [
  'overall_good',
  'good_service',
  'satisfying',
  'comfortable',
  'recommend',
  'good_price',
  'great_result',
] as const;

export class CreateReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  @ApiPropertyOptional({ enum: REVIEW_TAGS, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(REVIEW_TAGS, { each: true })
  tags?: string[];
}

/** Salon side: move a booking along Booked → Waiting → In progress → Done. */
export class UpdateBookingStatusDto {
  @ApiProperty({ enum: ['WAITING', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW', 'CANCELLED'] })
  @IsIn(['WAITING', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW', 'CANCELLED'])
  status: 'WAITING' | 'IN_PROGRESS' | 'COMPLETED' | 'NO_SHOW' | 'CANCELLED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class ManageBookingsQueryDto {
  @ApiPropertyOptional({ example: '2026-10-27', description: 'Day in the salon timezone; default today' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;
}
