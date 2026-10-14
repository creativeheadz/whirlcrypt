import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { getPublicConfig } from '../src/routes/config';
import { config } from '../src/config/config';

describe('getPublicConfig', () => {
  it('returns the live configured limits', () => {
    let payload: unknown;
    const res = {
      json: (body: unknown) => {
        payload = body;
      },
    } as unknown as Response;

    getPublicConfig({} as Request, res);

    assert.deepEqual(payload, {
      maxFileSize: config.retention.maxFileSize,
      defaultRetentionHours: config.retention.defaultRetentionHours,
      maxRetentionHours: config.retention.maxRetentionHours,
    });
  });
});
