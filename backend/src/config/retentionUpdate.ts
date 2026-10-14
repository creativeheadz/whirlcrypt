import { RetentionConfig } from '../types';

/** Absolute sanity ceilings. maxFileSize above the reverse proxy's body
 * limit additionally has no effect - see the note returned with updates. */
export const MAX_RETENTION_HOURS_LIMIT = 8760; // 1 year
export const MAX_FILE_SIZE_LIMIT = 10 * 1024 * 1024 * 1024; // 10 GiB

export interface RetentionUpdate {
  defaultRetentionHours?: number;
  maxRetentionHours?: number;
  maxFileSize?: number;
}

export type RetentionUpdateResult =
  | { ok: true; updates: RetentionUpdate }
  | { ok: false; error: string };

function asPositiveInt(value: unknown, field: string): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return n;
}

/**
 * Validate an admin PUT /api/admin/config body against the live config.
 * Pure: returns the updates to apply, or the 400 message. Never throws for
 * validation failures (unexpected throwables stay exceptional).
 */
export function buildRetentionUpdate(body: unknown, current: RetentionConfig): RetentionUpdateResult {
  try {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return { ok: false, error: 'Request body must be an object' };
    }
    const input = body as Record<string, unknown>;
    const updates: RetentionUpdate = {};

    if (input.maxRetentionHours !== undefined) {
      const v = asPositiveInt(input.maxRetentionHours, 'maxRetentionHours');
      if (v > MAX_RETENTION_HOURS_LIMIT) {
        return { ok: false, error: `maxRetentionHours must not exceed ${MAX_RETENTION_HOURS_LIMIT} hours (1 year)` };
      }
      updates.maxRetentionHours = v;
    }

    if (input.defaultRetentionHours !== undefined) {
      const v = asPositiveInt(input.defaultRetentionHours, 'defaultRetentionHours');
      const max = updates.maxRetentionHours ?? current.maxRetentionHours;
      if (v > max) {
        return { ok: false, error: `defaultRetentionHours must not exceed maxRetentionHours (${max})` };
      }
      updates.defaultRetentionHours = v;
    }

    if (input.maxFileSize !== undefined) {
      const v = asPositiveInt(input.maxFileSize, 'maxFileSize');
      if (v > MAX_FILE_SIZE_LIMIT) {
        return { ok: false, error: 'maxFileSize must not exceed 10737418240 bytes (10 GiB)' };
      }
      updates.maxFileSize = v;
    }

    if (Object.keys(updates).length === 0) {
      return { ok: false, error: 'No valid fields to update' };
    }
    return { ok: true, updates };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid request body' };
  }
}
