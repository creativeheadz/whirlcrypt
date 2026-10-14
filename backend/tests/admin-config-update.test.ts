import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildRetentionUpdate } from '../src/config/retentionUpdate';
import type { RetentionConfig } from '../src/types';

const current: RetentionConfig = {
  defaultRetentionHours: 24,
  maxRetentionHours: 168,
  cleanupIntervalMinutes: 60,
  maxFileSize: 104857600,
};

describe('buildRetentionUpdate', () => {
  it('accepts a full valid body', () => {
    assert.deepEqual(buildRetentionUpdate(
      { defaultRetentionHours: 12, maxRetentionHours: 72, maxFileSize: 52428800 },
      current
    ), {
      ok: true,
      updates: { maxRetentionHours: 72, defaultRetentionHours: 12, maxFileSize: 52428800 },
    });
  });

  it('accepts partial bodies and numeric strings', () => {
    assert.deepEqual(buildRetentionUpdate({ maxFileSize: '209715200' }, current), {
      ok: true,
      updates: { maxFileSize: 209715200 },
    });
  });

  it('rejects default above the effective max (including a raised max in the same body)', () => {
    const over = buildRetentionUpdate({ defaultRetentionHours: 200 }, current);
    assert.equal(over.ok, false);
    const raised = buildRetentionUpdate({ defaultRetentionHours: 200, maxRetentionHours: 500 }, current);
    assert.deepEqual(raised, { ok: true, updates: { maxRetentionHours: 500, defaultRetentionHours: 200 } });
  });

  it('rejects out-of-range and non-integer values', () => {
    for (const body of [
      { maxRetentionHours: 9000 },
      { maxFileSize: 20 * 1024 * 1024 * 1024 },
      { maxFileSize: 0 },
      { maxFileSize: -1 },
      { defaultRetentionHours: 1.5 },
      { maxFileSize: 'huge' },
      { maxFileSize: Number.NaN },
    ]) {
      const result = buildRetentionUpdate(body, current);
      assert.equal(result.ok, false, JSON.stringify(body));
    }
  });

  it('rejects empty and malformed bodies', () => {
    for (const body of [{}, { unknown: 1 }, null, undefined, 'x', [1]]) {
      const result = buildRetentionUpdate(body, current);
      assert.equal(result.ok, false, JSON.stringify(body));
    }
  });
});
