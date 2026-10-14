import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeDownloadFilename } from '../src/utils/filename';

describe('sanitizeDownloadFilename', () => {
  it('leaves ordinary filenames untouched', () => {
    assert.equal(sanitizeDownloadFilename('quarterly report (final).pdf'), 'quarterly report (final).pdf');
  });

  it('strips path separators and reserved characters', () => {
    assert.equal(sanitizeDownloadFilename('../../etc/cron.d/x'), '.._.._etc_cron.d_x');
    assert.equal(sanitizeDownloadFilename('a<b>c:d"e/f\\g|h?i*j'), 'a_b_c_d_e_f_g_h_i_j');
  });

  it('strips control characters and bidi overrides', () => {
    assert.equal(sanitizeDownloadFilename('invoice.pdf\u202Eexe'), 'invoice.pdfexe');
    assert.equal(sanitizeDownloadFilename('a\u0000b\nd'), 'abd');
  });

  it('trims trailing dots and spaces (Windows-unfriendly)', () => {
    assert.equal(sanitizeDownloadFilename('notes.txt...   '), 'notes.txt');
  });

  it('caps length while preserving the extension', () => {
    const name = 'n'.repeat(300) + '.pdf';
    const out = sanitizeDownloadFilename(name);
    assert.ok(out.length <= 200);
    assert.ok(out.endsWith('.pdf'));
  });

  it('falls back when nothing usable remains', () => {
    assert.equal(sanitizeDownloadFilename('///'), '___');
    assert.equal(sanitizeDownloadFilename(''), 'download');
    assert.equal(sanitizeDownloadFilename('...', 'file-123'), 'file-123');
  });
});
