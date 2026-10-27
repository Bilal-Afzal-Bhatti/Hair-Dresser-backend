import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

type Dict = Record<string, unknown>;

/**
 * Server-side translations (emails, push notifications).
 *
 * Languages are discovered from src/i18n/locales/*.json at boot:
 * adding a language = adding one file (e.g. es.json). Nothing else changes.
 *
 * Each file has a "_meta": { "name": "Deutsch" } entry with the language's own name.
 */
@Injectable()
export class I18nService implements OnModuleInit {
  private readonly logger = new Logger(I18nService.name);
  private readonly dictionaries = new Map<string, Dict>();
  readonly defaultLanguage: string;

  constructor(config: ConfigService) {
    this.defaultLanguage = config.get<string>('DEFAULT_LANGUAGE') ?? 'en';
  }

  onModuleInit() {
    const dir = join(__dirname, 'locales');
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const code = file.replace(/\.json$/, '');
      this.dictionaries.set(code, JSON.parse(readFileSync(join(dir, file), 'utf8')));
    }
    if (!this.dictionaries.has(this.defaultLanguage)) {
      throw new Error(`Default language file "${this.defaultLanguage}.json" not found in ${dir}`);
    }
    this.logger.log(`Languages loaded: ${this.supportedLanguages.join(', ')}`);
  }

  get supportedLanguages(): string[] {
    return [...this.dictionaries.keys()];
  }

  /** List for the app's Settings screen: [{ code: "de", name: "Deutsch" }, ...] */
  listLanguages() {
    return this.supportedLanguages.map((code) => ({
      code,
      name: (this.dictionaries.get(code)?._meta as Dict | undefined)?.name ?? code,
    }));
  }

  isSupported(code: string | undefined | null): code is string {
    return !!code && this.dictionaries.has(code);
  }

  /** Picks the first supported language from an Accept-Language header, else the default. */
  resolve(acceptLanguage: string | undefined): string {
    if (acceptLanguage) {
      const candidates = acceptLanguage
        .split(',')
        .map((part) => part.split(';')[0].trim().toLowerCase())
        .flatMap((tag) => [tag, tag.split('-')[0]]);
      const match = candidates.find((c) => this.dictionaries.has(c));
      if (match) return match;
    }
    return this.defaultLanguage;
  }

  /** t('en', 'email.verify.subject', { code: '1234' }) - falls back to the default language, then to the key. */
  t(lang: string, key: string, args: Record<string, string | number> = {}): string {
    const raw =
      this.lookup(this.dictionaries.get(lang), key) ??
      this.lookup(this.dictionaries.get(this.defaultLanguage), key) ??
      key;
    return raw.replace(/\{(\w+)\}/g, (_, name) => (name in args ? String(args[name]) : `{${name}}`));
  }

  /**
   * Picks the right language from a translatable JSON column:
   * { en: "Beard trim", fr: "Taille de barbe" } -> value for lang, then default language, then any value.
   */
  pick(value: unknown, lang: string): string {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    const obj = value as Record<string, string>;
    return obj[lang] ?? obj[this.defaultLanguage] ?? Object.values(obj)[0] ?? '';
  }

  private lookup(dict: Dict | undefined, key: string): string | undefined {
    const value = key.split('.').reduce<unknown>((node, part) => (node as Dict | undefined)?.[part], dict);
    return typeof value === 'string' ? value : undefined;
  }
}
