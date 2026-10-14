import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AttackLogger } from '../src/services/AttackLogger';
import { quotePostgresIdent, quotePostgresLiteral } from '../src/database/connection';

function fakePool(rows: Array<Record<string, unknown>> = [{ count: '3' }]) {
  const captured: { text: string; values: unknown[] }[] = [];
  const pool = {
    query: async (text: string, values: unknown[] = []) => {
      captured.push({ text, values });
      return { rows };
    },
  };
  return { pool: pool as never, captured };
}

describe('AttackLogger interval parameterization', () => {
  it('passes minutesBack as a bound value, not interpolated SQL', async () => {
    const { pool, captured } = fakePool();
    const logger = new AttackLogger(pool);
    const count = await logger.getRecentAttempts('10.0.0.1', 5);
    assert.equal(count, 3);
    assert.equal(captured.length, 1);
    assert.ok(captured[0].text.includes('$2'), 'expected $2 placeholder in SQL');
    assert.ok(!captured[0].text.includes('5 minutes'), 'value must not be interpolated');
    assert.deepEqual(captured[0].values, ['10.0.0.1', 5]);
  });

  it('passes hours as a bound value, not interpolated SQL', async () => {
    const { pool, captured } = fakePool([{ hour: new Date(0), count: '7' }]);
    const logger = new AttackLogger(pool);
    const rows = await logger.getAttacksByTime(24);
    assert.equal(rows.length, 1);
    assert.equal(captured.length, 1);
    assert.ok(captured[0].text.includes('$1'), 'expected $1 placeholder in SQL');
    assert.ok(!captured[0].text.includes('24 hours'), 'value must not be interpolated');
    assert.deepEqual(captured[0].values, [24]);
  });

  it('rejects a hostile hours value instead of interpolating it', async () => {
    const { pool, captured } = fakePool();
    const logger = new AttackLogger(pool);
    await assert.rejects(() => logger.getAttacksByTime("1' OR '1'='1" as unknown as number));
    assert.equal(captured.length, 0);
  });
});

describe('bootstrap SQL quoting', () => {
  it('quotes identifiers and rejects quote-breaking names', () => {
    assert.equal(quotePostgresIdent('whirlcrypt_dev'), '"whirlcrypt_dev"');
    assert.throws(() => quotePostgresIdent('a"; DROP TABLE files; --'), /unsafe/);
  });

  it('escapes single quotes in literals', () => {
    assert.equal(quotePostgresLiteral("o'clock"), "'o''clock'");
  });
});
