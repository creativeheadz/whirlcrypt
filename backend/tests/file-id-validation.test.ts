import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FileManager } from '../src/storage/fileManager';

describe('FileManager id validation', () => {
  const root = join(tmpdir(), `whirlcrypt-id-test-${process.pid}`);
  const uploadDir = join(root, 'uploads');
  const canary = join(root, 'canary.txt');
  let fm: FileManager;

  before(async () => {
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(canary, 'outside-upload-dir');
    fm = new FileManager(uploadDir);
  });

  after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('round-trips a stored file by its id (control)', async () => {
    const meta = await fm.storeFile(Buffer.from('ciphertext'), 'a.bin', 'application/octet-stream');
    const back = await fm.getMetadata(meta.id);
    assert.ok(back);
    assert.equal(back.filename, 'a.bin');
    const data = await fm.getFileData(meta.id);
    assert.ok(data);
    assert.equal(data.toString(), 'ciphertext');
  });

  it('refuses to read outside the upload dir', async () => {
    for (const evil of ['../canary.txt', '..', '/etc/hostname', 'a/b', '', '.meta', 'x.meta', 'a b', '.', '..\\win']) {
      assert.equal(await fm.getFileData(evil), null, `getFileData(${JSON.stringify(evil)})`);
      assert.equal(await fm.getMetadata(evil), null, `getMetadata(${JSON.stringify(evil)})`);
    }
    assert.equal(await fm.getFileData(null as unknown as string), null);
    assert.equal(await fm.getMetadata(undefined as unknown as string), null);
  });

  it('refuses to delete or write outside the upload dir', async () => {
    await fm.deleteFile('../canary.txt');
    await fm.incrementDownloadCount('../canary.txt');
    assert.equal(await fs.readFile(canary, 'utf-8'), 'outside-upload-dir');
    const rootFiles = await fs.readdir(root);
    assert.deepEqual(rootFiles.sort(), ['canary.txt', 'uploads']);
  });
});
