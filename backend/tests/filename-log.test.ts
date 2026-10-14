import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeForLog } from '../src/utils/filename';

describe('sanitizeForLog', () => {
  it('leaves ordinary filenames untouched', () => {
    assert.equal(sanitizeForLog('invoice Q3 (final).pdf'), 'invoice Q3 (final).pdf');
  });

  it('strips CR and LF so log lines cannot be forged', () => {
    assert.equal(
      sanitizeForLog('a.bin\r\nOct 14 00:00:00 fake[1]: forged line'),
      'a.binOct 14 00:00:00 fake[1]: forged line'
    );
  });

  it('strips other control characters but keeps printable unicode', () => {
    assert.equal(sanitizeForLog('caf\u00e9\u0007-\u001b[31m.txt'), 'caf\u00e9-[31m.txt');
  });

  it('caps runaway length', () => {
    const long = 'x'.repeat(500);
    assert.equal(sanitizeForLog(long).length, 200);
  });

  it('tolerates non-string input', () => {
    assert.equal(sanitizeForLog(undefined as unknown as string), '');
    assert.equal(sanitizeForLog(null as unknown as string), '');
  });
});
