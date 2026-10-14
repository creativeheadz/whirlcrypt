import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LIMITS,
  FALLBACK_MAX_FILE_SIZE,
  FALLBACK_DEFAULT_RETENTION_HOURS,
  FALLBACK_MAX_RETENTION_HOURS,
  resolveServerLimits,
} from '../src/utils/limits';

describe('resolveServerLimits', () => {
  it('accepts a valid server payload', () => {
    assert.deepEqual(
      resolveServerLimits({ maxFileSize: 52428800, defaultRetentionHours: 12, maxRetentionHours: 72 }),
      { maxFileSize: 52428800, defaultRetentionHours: 12, maxRetentionHours: 72 }
    );
  });

  it('falls back per-field on invalid values', () => {
    assert.deepEqual(resolveServerLimits({}), DEFAULT_LIMITS);
    assert.deepEqual(resolveServerLimits(null), DEFAULT_LIMITS);
    assert.deepEqual(resolveServerLimits(undefined), DEFAULT_LIMITS);
    assert.deepEqual(resolveServerLimits('nope'), DEFAULT_LIMITS);
    assert.deepEqual(
      resolveServerLimits({ maxFileSize: -5, defaultRetentionHours: 0, maxRetentionHours: Number.NaN }),
      DEFAULT_LIMITS
    );
    assert.deepEqual(
      resolveServerLimits({ maxFileSize: '104857600', defaultRetentionHours: 12, maxRetentionHours: 72 }),
      { maxFileSize: FALLBACK_MAX_FILE_SIZE, defaultRetentionHours: 12, maxRetentionHours: 72 }
    );
  });

  it('floors fractional values to at least 1', () => {
    assert.deepEqual(
      resolveServerLimits({ maxFileSize: 100.9, defaultRetentionHours: 0.5, maxRetentionHours: 72.7 }),
      { maxFileSize: 100, defaultRetentionHours: 1, maxRetentionHours: 72 }
    );
  });

  it('fallbacks mirror the documented backend defaults', () => {
    assert.equal(FALLBACK_MAX_FILE_SIZE, 104857600);
    assert.equal(FALLBACK_DEFAULT_RETENTION_HOURS, 24);
    assert.equal(FALLBACK_MAX_RETENTION_HOURS, 168);
  });
});
