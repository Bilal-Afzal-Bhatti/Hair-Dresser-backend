import { Injectable, Logger } from '@nestjs/common';

export interface PlaceName {
  /** Short label for the app header, e.g. "F-7, Islamabad" */
  label: string | null;
  city: string | null;
  country: string | null;
  /** ISO code, e.g. "PK". The app sends it back so only salons in that country are shown. */
  countryCode: string | null;
}

const EMPTY: PlaceName = { label: null, city: null, country: null, countryCode: null };
/**
 * Coordinates → place name, using OpenStreetMap Nominatim (free, no API key).
 * Nominatim rules: a real User-Agent, at most 1 request per second, cache results.
 */
@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);
  private readonly cache = new Map<string, PlaceName>();
  private queue: Promise<unknown> = Promise.resolve();
  private lastCall = 0;

  async reverse(lat: number, lng: number, lang: string): Promise<PlaceName> {
    // ~100 m precision is plenty for a "where am I" label and keeps the cache small
    const key = `${lat.toFixed(3)},${lng.toFixed(3)},${lang}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const result = await this.throttled(() => this.fetchPlace(lat, lng, lang));
    if (this.cache.size > 5000) this.cache.clear();
    if (result.label) this.cache.set(key, result);
    return result;
  }

  /** One request at a time, at least 1.1 s apart. */
  private throttled<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const wait = this.lastCall + 1100 - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.lastCall = Date.now();
      return task();
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async fetchPlace(lat: number, lng: number, lang: string): Promise<PlaceName> {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&lat=${lat}&lon=${lng}`;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'MT-Hairdresser/0.1 (salon booking app)', 'Accept-Language': lang },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return EMPTY;
      const body = (await res.json()) as { address?: Record<string, string> };
      const a = body.address ?? {};
      const area = a.suburb ?? a.neighbourhood ?? a.quarter ?? a.city_district;
      const city = a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? a.state ?? null;
           const country = a.country ?? null;
      const countryCode = /^[a-z]{2}$/i.test(a.country_code ?? '') ? a.country_code.toUpperCase() : null;
      const label = [area, city].filter(Boolean).join(', ') || country;
      return { label: label ?? null, city, country, countryCode };
    
    } catch (e) {
      this.logger.warn(`Reverse geocoding failed: ${(e as Error).message}`);
      return EMPTY;
    }
  }
}