import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { LocalStorageProvider } from '../src/storage/providers/LocalStorageProvider';
import { resolveWithinBase } from '../src/utils/storagePath';

describe('resolveWithinBase', () => {
  const base = join(tmpdir(), 'whirlcrypt-base');
  it('resolves ordinary relative paths', () => {
    assert.equal(resolveWithinBase(base, join('ab', 'cd', 'file.bin')), join(base, 'ab', 'cd', 'file.bin'));
  });
  it('refuses parent-directory escape', () => {
    assert.equal(resolveWithinBase(base, '../../etc/hostname'), null);
    assert.equal(resolveWithinBase(base, 'ab/../../..'), null);
  });
  it('refuses absolute paths and empties', () => {
    assert.equal(resolveWithinBase(base, '/etc/hostname'), null);
    assert.equal(resolveWithinBase(base, ''), null);
  });
});

describe('LocalStorageProvider containment', () => {
  const root = join(tmpdir(), `whirlcrypt-contain-${process.pid}`);
  const basePath = join(root, 'store');
  const canary = join(root, 'canary.txt');
  let provider: LocalStorageProvider;

  before(async () => {
    await fs.mkdir(basePath, { recursive: true });
    await fs.writeFile(canary, 'outside-store');
    provider = new LocalStorageProvider();
    await provider.initialize({ path: basePath });
  });

  after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('round-trips a stored file (control)', async () => {
    const stored = await provider.store(Buffer.from('data'), 'a.bin', { fileId: 'id-1' });
    const back = await provider.retrieve(stored);
    assert.equal(back.toString(), 'data');
  });

  it('refuses to retrieve outside the store', async () => {
    await assert.rejects(() => provider.retrieve('../canary.txt'));
    assert.equal(await fs.readFile(canary, 'utf-8'), 'outside-store');
  });

  it('refuses to delete outside the store', async () => {
    await assert.rejects(() => provider.delete('../canary.txt'));
    assert.equal(await fs.readFile(canary, 'utf-8'), 'outside-store');
  });

  it('reports escaped paths as missing, not errors', async () => {
    assert.equal(await provider.exists('../canary.txt'), false);
    const stats = await provider.getStats('../canary.txt');
    assert.equal(stats.exists, false);
    assert.equal(await provider.getMetadata('../canary.txt'), null);
    assert.deepEqual(await provider.listFiles('..'), []);
  });
});
