import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude } from 'class-validator';
import { Lang } from '../common/decorators/lang.decorator';
import { Public } from '../common/decorators/public.decorator';
import { GeoService } from './geo.service';

class ReverseQueryDto {
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @Type(() => Number)
  @IsLongitude()
  lng: number;
}

@ApiTags('geo')
@Controller('geo')
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  /** Place name for the Home header ("F-7, Islamabad"), in the app language. */
  @Public()
  @Get('reverse')
  reverse(@Query() q: ReverseQueryDto, @Lang() lang: string) {
    return this.geo.reverse(q.lat, q.lng, lang);
  }
}