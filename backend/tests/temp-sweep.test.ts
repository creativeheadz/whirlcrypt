import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { sweepStaleTempFiles } from '../src/utils/tempSweep';

describe('sweepStaleTempFiles', () => {
  const root = join(tmpdir(), `whirlcrypt-sweep-${process.pid}`);
  const tmpDir = join(root, 'uploads', '.tmp');

  const old = new Date(Date.now() - 25 * 3600 * 1000);
  const fresh = new Date();

  beforeEach(async () => {
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.writeFile(join(tmpDir, 'incoming-abc123'), 'stale-upload');
    await fs.utimes(join(tmpDir, 'incoming-abc123'), old, old);
    await fs.writeFile(join(tmpDir, 'incoming-fresh9'), 'in-flight');
    await fs.utimes(join(tmpDir, 'incoming-fresh9'), fresh, fresh);
    await fs.writeFile(join(tmpDir, 'keep-me.txt'), 'not-an-upload-temp');
    await fs.utimes(join(tmpDir, 'keep-me.txt'), old, old);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('removes only stale incoming-* temps', async () => {
    const removed = await sweepStaleTempFiles(join(root, 'uploads'), 24);
    assert.equal(removed, 1);
    const left = (await fs.readdir(tmpDir)).sort();
    assert.deepEqual(left, ['incoming-fresh9', 'keep-me.txt']);
  });

  it('honors a custom max age', async () => {
    const removed = await sweepStaleTempFiles(join(root, 'uploads'), 48);
    assert.equal(removed, 0);
  });

  it('returns 0 when the temp dir is missing', async () => {
    assert.equal(await sweepStaleTempFiles(join(root, 'nope'), 24), 0);
  });
});
