import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { downloadProgressPercent, mapUploadError } from '../src/utils/transfer';

describe('downloadProgressPercent', () => {
  it('scales received bytes against the announced total', () => {
    assert.equal(downloadProgressPercent(0, 1000), 0);
    assert.equal(downloadProgressPercent(500, 1000), 50);
    assert.equal(downloadProgressPercent(1000, 1000), 99);
  });

  it('never shows 100 before completion, even on overrun', () => {
    assert.equal(downloadProgressPercent(1200, 1000), 99);
  });

  it('returns null when the total is unknown or unusable', () => {
    assert.equal(downloadProgressPercent(500, null), null);
    assert.equal(downloadProgressPercent(500, 0), null);
    assert.equal(downloadProgressPercent(500, -3), null);
  });
});

describe('mapUploadError', () => {
  it('explains rate limiting in plain words', () => {
    assert.equal(
      mapUploadError(429, 'Too many requests'),
      'Too many uploads from your address. Wait a few minutes and try again.'
    );
  });

  it('explains oversize uploads', () => {
    assert.equal(
      mapUploadError(413, null),
      'File too large for the server. Try a smaller file or a shorter retention.'
    );
  });

  it('prefers the server message for validation failures', () => {
    assert.equal(mapUploadError(400, 'Invalid IP address or CIDR range: "x"'), 'Invalid IP address or CIDR range: "x"');
  });

  it('falls back to the status when nothing else is known', () => {
    assert.equal(mapUploadError(500, null), 'Upload failed (HTTP 500).');
    assert.equal(mapUploadError(503, 'overloaded'), 'overloaded');
  });
});
