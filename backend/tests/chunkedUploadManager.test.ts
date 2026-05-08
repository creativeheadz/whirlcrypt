import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { ChunkedUploadManager } from '../src/services/ChunkedUploadManager';

const TEST_TEMP_DIR = join(__dirname, '.test-temp-uploads');

describe('ChunkedUploadManager', () => {
  let manager: ChunkedUploadManager;

  beforeEach(async () => {
    manager = new ChunkedUploadManager(TEST_TEMP_DIR);
    // Wait for temp dir to be created
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(async () => {
    manager.shutdown();
    try {
      await fs.rm(TEST_TEMP_DIR, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('should initialize an upload and return an uploadId', async () => {
    const result = await manager.initUpload('test.txt', 1000, 1, 24);
    expect(result.uploadId).toBeDefined();
    expect(result.chunkSize).toBe(10485760);
  });

  it('should store and track chunks', async () => {
    const { uploadId } = await manager.initUpload('test.txt', 10, 2, 24);

    await manager.storeChunk(uploadId, 0, Buffer.from('hello'));
    expect(manager.isUploadComplete(uploadId)).toBe(false);

    await manager.storeChunk(uploadId, 1, Buffer.from('world'));
    expect(manager.isUploadComplete(uploadId)).toBe(true);
  });

  it('should handle duplicate chunk uploads idempotently', async () => {
    const { uploadId } = await manager.initUpload('test.txt', 5, 1, 24);

    await manager.storeChunk(uploadId, 0, Buffer.from('hello'));
    // Second upload of same chunk should not throw
    await manager.storeChunk(uploadId, 0, Buffer.from('hello'));
    expect(manager.isUploadComplete(uploadId)).toBe(true);
  });

  it('should reject invalid chunk indices', async () => {
    const { uploadId } = await manager.initUpload('test.txt', 5, 1, 24);

    await expect(manager.storeChunk(uploadId, -1, Buffer.from('x'))).rejects.toThrow('Invalid chunk index');
    await expect(manager.storeChunk(uploadId, 1, Buffer.from('x'))).rejects.toThrow('Invalid chunk index');
  });

  it('should assemble chunks into a file on disk', async () => {
    const data1 = Buffer.from('Hello, ');
    const data2 = Buffer.from('World!');
    const totalSize = data1.length + data2.length;

    const { uploadId } = await manager.initUpload('test.txt', totalSize, 2, 24);

    await manager.storeChunk(uploadId, 0, data1);
    await manager.storeChunk(uploadId, 1, data2);

    const assembledPath = await manager.assembleChunks(uploadId);
    expect(assembledPath).toContain('assembled');

    const assembledData = await fs.readFile(assembledPath);
    expect(assembledData.toString()).toBe('Hello, World!');
    expect(assembledData.length).toBe(totalSize);
  });

  it('should throw when assembling incomplete upload', async () => {
    const { uploadId } = await manager.initUpload('test.txt', 10, 2, 24);
    await manager.storeChunk(uploadId, 0, Buffer.from('hello'));

    await expect(manager.assembleChunks(uploadId)).rejects.toThrow('Upload incomplete');
  });

  it('should throw when assembling unknown upload', async () => {
    await expect(manager.assembleChunks('nonexistent-id')).rejects.toThrow('Upload not found');
  });

  it('should cancel and clean up an upload', async () => {
    const { uploadId } = await manager.initUpload('test.txt', 5, 1, 24);
    await manager.storeChunk(uploadId, 0, Buffer.from('hello'));

    await manager.cancelUpload(uploadId);

    expect(manager.getUpload(uploadId)).toBeUndefined();
  });

  it('should provide upload stats', async () => {
    await manager.initUpload('a.txt', 100, 10, 24);
    await manager.initUpload('b.txt', 200, 20, 24);

    const stats = manager.getStats();
    expect(stats.activeUploads).toBe(2);
    expect(stats.uploads).toHaveLength(2);
  });
});
