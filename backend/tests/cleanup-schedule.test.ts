import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import cron from 'node-cron';
import { buildCleanupCron } from '../src/jobs/cleanupSchedule';

describe('buildCleanupCron', () => {
  const cases: Array<[number, string]> = [
    [60, '0 */1 * * *'],
    [30, '*/30 * * * *'],
    [15, '*/15 * * * *'],
    [120, '0 */2 * * *'],
    [1440, '0 * * * *'], // 24h: no exact hourly step, falls back to hourly
    [45, '0 * * * *'], // not a divisor of 60: hourly fallback
    [90, '0 * * * *'], // not a multiple of 60: hourly fallback
    [0, '0 * * * *'],
    [-5, '0 * * * *'],
    [Number.NaN, '0 * * * *'],
  ];

  for (const [minutes, expected] of cases) {
    it(`maps ${minutes} minutes to "${expected}"`, () => {
      assert.equal(buildCleanupCron(minutes), expected);
    });
  }

  it('only ever produces expressions node-cron accepts', () => {
    for (let m = -10; m <= 3000; m++) {
      assert.equal(cron.validate(buildCleanupCron(m)), true, `minutes=${m}`);
    }
    for (const m of [Number.NaN, Number.POSITIVE_INFINITY, 1.5, 59, 61, 1439, 1441]) {
      assert.equal(cron.validate(buildCleanupCron(m)), true, `minutes=${m}`);
    }
  });
});
