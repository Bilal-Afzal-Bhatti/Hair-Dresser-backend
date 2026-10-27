import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { AppException, ErrorCode } from '../common/errors/error-codes';
import { I18nService } from '../i18n/i18n.service';
import { PrismaService } from '../prisma/prisma.service';
import { SalonQueryDto, SalonSort } from './dto/salon-query.dto';
import { distanceKm, distanceSql, roundKm } from './geo.util';
import { minutesToHHmm, zonedParts } from '../common/utils/time.util';

const ORDER_BY: Record<SalonSort, string> = {
  distance: 'distance_km ASC NULLS LAST, avg_rating DESC',
  rating: 'avg_rating DESC, review_count DESC',
  popular: 'review_count DESC, avg_rating DESC',
};

/** Escapes LIKE wildcards in user input. */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
  ) {}

  // ───────────── Categories ─────────────

  async listCategories(lang: string) {
    const rows = await this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map((c) => ({
      id: c.id,
      key: c.key,
      name: this.i18n.pick(c.name, lang),
      icon: c.icon,
      imageUrl: c.imageUrl,
    }));
  }

  // ───────────── Salon search ─────────────

  async searchSalons(query: SalonQueryDto, lang: string, userId?: string) {
    const hasLocation = query.lat != null && query.lng != null;
    const sort: SalonSort = query.sort ?? (hasLocation ? 'distance' : 'rating');
    const limit = query.limit ?? 20;
    const page = query.page ?? 1;

    const where: Prisma.Sql[] = [Prisma.sql`s.status = 'ACTIVE'`, Prisma.sql`s.deleted_at IS NULL`];
    if (query.q?.trim()) {
      const pattern = `%${likeEscape(query.q.trim())}%`;
      where.push(Prisma.sql`(s.name ILIKE ${pattern} OR s.city ILIKE ${pattern})`);
    }
    if (query.categoryIds?.length) {
      where.push(Prisma.sql`EXISTS (SELECT 1 FROM salon_categories sc
        WHERE sc.salon_id = s.id AND sc.category_id IN (${Prisma.join(query.categoryIds)}))`);
    }
    if (query.minRating != null) where.push(Prisma.sql`s.avg_rating >= ${query.minRating}::float8`);
     if (query.homeService) where.push(Prisma.sql`s.offers_home_service = true`);
    if (query.country) where.push(Prisma.sql`s.country = ${query.country}`);
    const outer: Prisma.Sql[] = [Prisma.sql`TRUE`];
    if (hasLocation && query.minDistanceKm != null) outer.push(Prisma.sql`distance_km >= ${query.minDistanceKm}::float8`);
    if (hasLocation && query.maxDistanceKm != null) outer.push(Prisma.sql`distance_km <= ${query.maxDistanceKm}::float8`);

    const distance = hasLocation ? distanceSql(query.lat!, query.lng!) : Prisma.sql`NULL::float8`;

    const rows = await this.prisma.$queryRaw<{ id: string; distance_km: number | null; total: number }[]>`
      WITH filtered AS (
        SELECT s.id, s.avg_rating, s.review_count, ${distance} AS distance_km
        FROM salons s
        WHERE ${Prisma.join(where, ' AND ')}
      )
      SELECT id, distance_km, (count(*) OVER ())::int AS total
      FROM filtered
      WHERE ${Prisma.join(outer, ' AND ')}
      ORDER BY ${Prisma.raw(ORDER_BY[sort])}, id
      LIMIT ${limit} OFFSET ${(page - 1) * limit}`;

    const total = rows[0]?.total ?? 0;
    const items = await this.loadSalonCards(rows, lang, userId);
    return { items, page, limit, total, hasMore: page * limit < total };
  }

  /** Loads the card data for an ordered list of salon ids, keeping the order. */
  private async loadSalonCards(rows: { id: string; distance_km: number | null }[], lang: string, userId?: string) {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const salons = await this.prisma.salon.findMany({
      where: { id: { in: ids } },
      include: {
        categories: { include: { category: true }, orderBy: { category: { sortOrder: 'asc' } } },
        favorites: userId ? { where: { userId }, select: { userId: true } } : false,
      },
    });
    const byId = new Map(salons.map((s) => [s.id, s]));
    return rows
      .map((r) => {
        const s = byId.get(r.id);
        if (!s) return null;
        return {
          id: s.id,
          name: s.name,
          coverImageUrl: s.coverImageUrl,
          addressLine: s.addressLine,
          city: s.city,
          latitude: s.latitude,
          longitude: s.longitude,
          distanceKm: roundKm(r.distance_km),
          rating: s.avgRating,
          reviewCount: s.reviewCount,
          priceFromCents: s.priceFromCents,
          currency: s.currency,
          offersHomeService: s.offersHomeService,
          categories: s.categories.map(({ category: c }) => ({
            id: c.id,
            key: c.key,
            name: this.i18n.pick(c.name, lang),
          })),
          isFavorite: Array.isArray((s as any).favorites) && (s as any).favorites.length > 0,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }

  // ───────────── Salon detail ─────────────

  async getSalon(id: string, lang: string, userId?: string, lat?: number, lng?: number) {
    const s = await this.prisma.salon.findFirst({
      where: { id, status: 'ACTIVE', deletedAt: null },
      include: {
        categories: { include: { category: true } },
        images: { orderBy: { sortOrder: 'asc' } },
        services: { where: { isActive: true, deletedAt: null }, orderBy: { sortOrder: 'asc' } },
        favorites: userId ? { where: { userId }, select: { userId: true } } : false,
        openingHours: { orderBy: [{ weekday: 'asc' }, { openMinute: 'asc' }] },
        specialists: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!s) throw new AppException(ErrorCode.SALON_NOT_FOUND, HttpStatus.NOT_FOUND, 'Salon not found');

    // "Open" badge on the cover photo
    const now = zonedParts(new Date(), s.timezone);
    const nowMinute = now.hour * 60 + now.minute;
    const isOpenNow = s.openingHours.some(
      (h) => h.weekday === now.weekday && h.openMinute <= nowMinute && nowMinute < h.closeMinute,
    );

    return {
      id: s.id,
      name: s.name,
      description: this.i18n.pick(s.description, lang),
      coverImageUrl: s.coverImageUrl,
      images: s.images.map((i) => i.url),
      addressLine: s.addressLine,
      city: s.city,
      country: s.country,
      latitude: s.latitude,
      longitude: s.longitude,
      distanceKm: lat != null && lng != null ? roundKm(distanceKm(lat, lng, s.latitude, s.longitude)) : null,
      phone: s.phone,
      website: s.website,
      rating: s.avgRating,
      reviewCount: s.reviewCount,
      currency: s.currency,
      offersHomeService: s.offersHomeService,
      isFavorite: Array.isArray((s as any).favorites) && (s as any).favorites.length > 0,
      categories: s.categories.map(({ category: c }) => ({ id: c.id, key: c.key, name: this.i18n.pick(c.name, lang) })),
      services: s.services.map((sv) => ({
        id: sv.id,
        categoryId: sv.categoryId,
        name: this.i18n.pick(sv.name, lang),
        description: sv.description ? this.i18n.pick(sv.description, lang) : null,
        durationMinutes: sv.durationMinutes,
        priceCents: sv.priceCents,
        availableAtHome: sv.availableAtHome,
      })),
      timezone: s.timezone,
      isOpenNow,
      /** 7 entries, Monday first. Empty ranges = closed that day. */
      openingHours: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
        weekday,
        ranges: s.openingHours
          .filter((h) => h.weekday === weekday)
          .map((h) => ({ open: minutesToHHmm(h.openMinute), close: minutesToHHmm(h.closeMinute) })),
      })),
      specialists: s.specialists.map((sp) => ({
        id: sp.id,
        name: sp.name,
        title: this.i18n.pick(sp.title, lang),
        avatarUrl: sp.avatarUrl,
      })),
    };
  }

  // ───────────── Reviews tab ─────────────

  async listReviews(salonId: string, page: number, limit: number) {
    const where = { salonId };
    const [total, rows] = await Promise.all([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({
        where,
        include: { user: { select: { name: true, avatarUrl: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        tags: r.tags,
        createdAt: r.createdAt,
        user: { name: r.user.name, avatarUrl: r.user.avatarUrl },
      })),
      page,
      limit,
      total,
      hasMore: page * limit < total,
    };
  }

  // ───────────── Favourites ─────────────

  async setFavorite(userId: string, salonId: string, favorite: boolean) {
    const exists = await this.prisma.salon.count({ where: { id: salonId, deletedAt: null } });
    if (!exists) throw new AppException(ErrorCode.SALON_NOT_FOUND, HttpStatus.NOT_FOUND, 'Salon not found');
    if (favorite) {
      await this.prisma.favorite.upsert({
        where: { userId_salonId: { userId, salonId } },
        update: {},
        create: { userId, salonId },
      });
    } else {
      await this.prisma.favorite.deleteMany({ where: { userId, salonId } });
    }
    return { salonId, isFavorite: favorite };
  }

  // ───────────── Offers ─────────────

    /** [country] e.g. "PK": only offers from salons in the user's country. */
  async listActiveOffers(lang: string, lat?: number, lng?: number, take = 10, country?: string) {
    const now = new Date();
    const offers = await this.prisma.offer.findMany({
      where: {
        isActive: true,
        startsAt: { lte: now },
        endsAt: { gte: now },
        salon: { status: 'ACTIVE', deletedAt: null, ...(country ? { country } : {}) },
      },
      include: { salon: true },
      orderBy: [{ discountPercent: 'desc' }, { endsAt: 'asc' }],
      take,
    });
    return offers.map((o) => ({
      id: o.id,
      title: this.i18n.pick(o.title, lang),
      discountPercent: o.discountPercent,
      imageUrl: o.imageUrl ?? o.salon.coverImageUrl,
      endsAt: o.endsAt,
      salon: {
        id: o.salon.id,
        name: o.salon.name,
        city: o.salon.city,
        rating: o.salon.avgRating,
        reviewCount: o.salon.reviewCount,
        distanceKm:
          lat != null && lng != null ? roundKm(distanceKm(lat, lng, o.salon.latitude, o.salon.longitude)) : null,
      },
    }));
  }

  // ───────────── Home (one call for the whole screen) ─────────────

  /** [country] = the user's country: only salons there are shown. */
  async getHome(lang: string, lat?: number, lng?: number, userId?: string, country?: string) {
    const hasLocation = lat != null && lng != null;
    const [categories, offers, nearby] = await Promise.all([
      this.listCategories(lang),
      this.listActiveOffers(lang, lat, lng, 10, country),
      this.searchSalons(
        Object.assign(new SalonQueryDto(), {
          lat,
          lng,
          country,
          sort: 'popular',
          limit: 10,
          page: 1,
          maxDistanceKm: hasLocation ? 15 : undefined,
        }),
        lang,
        userId,
      ),
    ]);

    // Nothing within 15 km (e.g. the user is in another city): the most popular in the same country instead.
    let popular = nearby.items;
    if (!popular.length && hasLocation) {
      popular = (
        await this.searchSalons(
          Object.assign(new SalonQueryDto(), { lat, lng, country, sort: 'popular', limit: 10, page: 1 }),
          lang,
          userId,
        )
      ).items;
    }

    return { categories, popularNearby: popular, bestOffers: offers };
  }
}
