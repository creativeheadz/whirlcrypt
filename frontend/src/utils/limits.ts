/**
 * Server upload limits for the uploader. The backend owns the real values
 * (GET /api/config); these fallbacks mirror its defaults and apply only when
 * the endpoint is unreachable. Failing toward the smaller documented default
 * means the worst case is rejecting an upload the server would take, never
 * encrypting gigabytes the server will refuse.
 */
export const FALLBACK_MAX_FILE_SIZE = 104857600; // 100 MB
export const FALLBACK_DEFAULT_RETENTION_HOURS = 24;
export const FALLBACK_MAX_RETENTION_HOURS = 168; // 7 days

export interface ServerLimits {
  maxFileSize: number;
  defaultRetentionHours: number;
  maxRetentionHours: number;
}

export const DEFAULT_LIMITS: ServerLimits = {
  maxFileSize: FALLBACK_MAX_FILE_SIZE,
  defaultRetentionHours: FALLBACK_DEFAULT_RETENTION_HOURS,
  maxRetentionHours: FALLBACK_MAX_RETENTION_HOURS,
};

function positiveInt(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.max(1, Math.floor(value));
}

/** Validate raw /api/config data; any invalid field falls back, never throws. */
export function resolveServerLimits(data: unknown): ServerLimits {
  const d = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  return {
    maxFileSize: positiveInt(d.maxFileSize, FALLBACK_MAX_FILE_SIZE),
    defaultRetentionHours: positiveInt(d.defaultRetentionHours, FALLBACK_DEFAULT_RETENTION_HOURS),
    maxRetentionHours: positiveInt(d.maxRetentionHours, FALLBACK_MAX_RETENTION_HOURS),
  };
}
