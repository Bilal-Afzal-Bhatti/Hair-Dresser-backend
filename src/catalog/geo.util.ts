import { Prisma } from '../generated/prisma/client';

const EARTH_RADIUS_KM = 6371;

/**
 * SQL expression for the great-circle distance (km) between a point and a salon row aliased `s`.
 * Plain SQL (haversine via spherical law of cosines), no extension needed.
 * When traffic grows, swap for PostGIS ST_DistanceSphere + a GiST index in this one place.
 */
export function distanceSql(lat: number, lng: number): Prisma.Sql {
  return Prisma.sql`(${EARTH_RADIUS_KM}::float8 * acos(least(1.0, greatest(-1.0,
    cos(radians(${lat}::float8)) * cos(radians(s.latitude)) * cos(radians(s.longitude) - radians(${lng}::float8))
    + sin(radians(${lat}::float8)) * sin(radians(s.latitude))))))`;
}

/** Same formula in JS, for small lists already loaded in memory. */
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const v =
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos((lng2 - lng1) * rad) +
    Math.sin(lat1 * rad) * Math.sin(lat2 * rad);
  return EARTH_RADIUS_KM * Math.acos(Math.min(1, Math.max(-1, v)));
}

export function roundKm(km: number | null | undefined): number | null {
  return km == null ? null : Math.round(km * 10) / 10;
}
