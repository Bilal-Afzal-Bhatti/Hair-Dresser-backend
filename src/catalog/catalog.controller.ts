import { Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Lang } from '../common/decorators/lang.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CatalogService } from './catalog.service';
import { LocationQueryDto, PageQueryDto, SalonQueryDto } from './dto/salon-query.dto';

@ApiTags('home')
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  /** Everything the Home screen needs in one request. */
  @Public()
  @Get('home')
  home(@Query() q: LocationQueryDto, @Lang() lang: string, @CurrentUser() user?: AuthUser) {
       return this.catalog.getHome(lang, q.lat, q.lng, user?.id, q.country);
  }

  @Public()
  @Get('categories')
  categories(@Lang() lang: string) {
    return this.catalog.listCategories(lang);
  }

  /** Search bar + filter sheet. */
  @Public()
  @Get('salons')
  salons(@Query() q: SalonQueryDto, @Lang() lang: string, @CurrentUser() user?: AuthUser) {
    return this.catalog.searchSalons(q, lang, user?.id);
  }

  @Public()
  @Get('salons/:id')
  salon(
    @Param('id') id: string,
    @Query() q: LocationQueryDto,
    @Lang() lang: string,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.catalog.getSalon(id, lang, user?.id, q.lat, q.lng);
  }

  /** Reviews tab of the salon detail screen. */
  @Public()
  @Get('salons/:id/reviews')
  reviews(@Param('id') id: string, @Query() q: PageQueryDto) {
    return this.catalog.listReviews(id, q.page, q.limit);
  }

  @Public()
  @Get('offers')
  offers(@Query() q: LocationQueryDto, @Lang() lang: string) {
     return this.catalog.listActiveOffers(lang, q.lat, q.lng, 30, q.country);
  }

  @ApiBearerAuth()
  @Post('salons/:id/favorite')
  @HttpCode(200)
  addFavorite(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.catalog.setFavorite(user.id, id, true);
  }

  @ApiBearerAuth()
  @Delete('salons/:id/favorite')
  removeFavorite(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.catalog.setFavorite(user.id, id, false);
  }
}
