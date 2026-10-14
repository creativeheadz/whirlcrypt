import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { copyTextToClipboard } from '../src/utils/clipboard';

describe('copyTextToClipboard', () => {
  it('uses the async clipboard API when available', async () => {
    let written = '';
    const ok = await copyTextToClipboard('abc', {
      clipboard: { writeText: async (t: string) => void (written = t) },
      fallback: () => assert.fail('fallback must not run'),
    });
    assert.equal(ok, true);
    assert.equal(written, 'abc');
  });

  it('falls back to execCommand when the clipboard API throws', async () => {
    let fallbackText = '';
    const ok = await copyTextToClipboard('abc', {
      clipboard: { writeText: async () => { throw new Error('denied'); } },
      fallback: (t: string) => { fallbackText = t; return true; },
    });
    assert.equal(ok, true);
    assert.equal(fallbackText, 'abc');
  });

  it('falls back when there is no clipboard API (plain http)', async () => {
    const ok = await copyTextToClipboard('abc', {
      clipboard: undefined,
      fallback: () => true,
    });
    assert.equal(ok, true);
  });

  it('reports failure when both paths fail', async () => {
    const ok = await copyTextToClipboard('abc', {
      clipboard: { writeText: async () => { throw new Error('denied'); } },
      fallback: () => false,
    });
    assert.equal(ok, false);
  });
});
