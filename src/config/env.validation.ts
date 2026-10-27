/**
 * Validates environment variables at boot so a missing value fails fast with a clear message.
 */
const required = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_RESET_SECRET'] as const;

export function validateEnv(config: Record<string, unknown>) {
  const missing = required.filter((key) => !config[key]);
  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}. Copy .env.example to .env.`);
  }
  if (config.NODE_ENV === 'production') {
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_RESET_SECRET']) {
      if (String(config[key]).startsWith('change-me')) {
        throw new Error(`${key} must be set to a strong random value in production.`);
      }
    }
  }
  return config;
}

/** Typed accessor for numeric settings with defaults. */
export function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
