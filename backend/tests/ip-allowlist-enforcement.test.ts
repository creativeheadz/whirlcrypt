import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Request } from 'express';
import { isAllowedForIp } from '../src/routes/download';
import { FileManager } from '../src/storage/fileManager';
import type { FileMetadata } from '../src/types';

const req = (ip?: string) => ({ ip } as unknown as Request);
const meta = (allowedIps?: string[]) =>
  ({ id: 'x', allowedIps } as unknown as FileMetadata);

describe('download IP allowlist gate', () => {
  it('allows everything when no list is stored', () => {
    assert.equal(isAllowedForIp(req('203.0.113.9'), meta(undefined)), true);
    assert.equal(isAllowedForIp(req('203.0.113.9'), meta([])), true);
  });

  it('allows listed IPs and CIDRs, denies the rest', () => {
    const m = meta(['203.0.113.7', '198.51.100.0/24']);
    assert.equal(isAllowedForIp(req('203.0.113.7'), m), true);
    assert.equal(isAllowedForIp(req('198.51.100.200'), m), true);
    assert.equal(isAllowedForIp(req('198.51.101.1'), m), false);
    assert.equal(isAllowedForIp(req('10.0.0.1'), m), false);
  });

  it('fails closed on missing or garbage client IPs', () => {
    const m = meta(['203.0.113.7']);
    assert.equal(isAllowedForIp(req(undefined), m), false);
    assert.equal(isAllowedForIp(req(''), m), false);
    assert.equal(isAllowedForIp(req('not-an-ip'), m), false);
  });
});

describe('legacy FileManager allowedIps roundtrip', () => {
  const root = join(tmpdir(), `whirlcrypt-ip-test-${process.pid}`);
  const uploadDir = join(root, 'uploads');
  let fm: FileManager;

  before(async () => {
    await fs.mkdir(uploadDir, { recursive: true });
    fm = new FileManager(uploadDir);
  });

  after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('persists the list in metadata', async () => {
    const stored = await fm.storeFile(
      Buffer.from('ciphertext'), 'a.bin', 'application/octet-stream',
      undefined, ['203.0.113.7/32']
    );
    assert.deepEqual(stored.allowedIps, ['203.0.113.7/32']);
    const back = await fm.getMetadata(stored.id);
    assert.ok(back);
    assert.deepEqual(back.allowedIps, ['203.0.113.7/32']);
  });

  it('omits the field when no list was given', async () => {
    const stored = await fm.storeFile(Buffer.from('x'), 'b.bin', 'application/octet-stream');
    assert.equal(stored.allowedIps, undefined);
    const back = await fm.getMetadata(stored.id);
    assert.ok(back);
    assert.equal(back.allowedIps, undefined);
  });
});
