import type { SqliteStore } from '../sqliteStore';

/**
 * Kept for existing startup/config-change hooks.
 * Server API routing now uses the public production domain with an env override.
 */
export function refreshEndpointsTestMode(_store: SqliteStore): void {}

/**
 * Server API base URL — switches based on testMode.
 * Used for auth exchange/refresh, models, proxy, etc.
 */
export const getServerApiBaseUrl = (): string => {
  const override = process.env.WESIGHT_API_BASE_URL?.trim();
  if (override) {
    return override.replace(/\/+$/, '');
  }
  return 'https://api.wesight.ai';
};
