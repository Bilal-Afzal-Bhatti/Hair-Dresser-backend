import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const SALON_SORTS = ['distance', 'rating', 'popular'] as const;
export type SalonSort = (typeof SALON_SORTS)[number];

/** Location the app sends with Home and search requests. */
/** Location the app sends with Home and search requests. */
export class LocationQueryDto {
  @ApiPropertyOptional({ example: 48.8566 })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional({ example: 2.3522 })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  @ApiPropertyOptional({ example: 'PK', description: "ISO country code of the user's location; only salons in that country" })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z]{2}$/)
  country?: string;
}
/** Search + filter sheet: category chips, star rating, distance range. */
export class SalonQueryDto extends LocationQueryDto {
  @ApiPropertyOptional({ description: 'Text search on salon name or city' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @ApiPropertyOptional({ description: 'Comma-separated category ids', example: 'ckx1,ckx2' })
  @IsOptional()
  @Transform(({ value }) =>
    Array.isArray(value) ? value : String(value).split(',').map((v) => v.trim()).filter(Boolean),
  )
  @IsArray()
  @IsString({ each: true })
  categoryIds?: string[];

  @ApiPropertyOptional({ minimum: 0, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5)
  minRating?: number;

  @ApiPropertyOptional({ description: 'Needs lat/lng' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minDistanceKm?: number;

  @ApiPropertyOptional({ description: 'Needs lat/lng' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(500)
  maxDistanceKm?: number;

  @ApiPropertyOptional({ description: 'Only salons that come to your home' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  homeService?: boolean;

  @ApiPropertyOptional({ enum: SALON_SORTS })
  @IsOptional()
  @IsIn(SALON_SORTS)
  sort?: SalonSort;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(50)
  limit: number = 20;
}

export class PageQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(50)
  limit: number = 20;
}
