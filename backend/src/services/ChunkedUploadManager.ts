import { promises as fs, createWriteStream, createReadStream } from 'fs';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';

interface ChunkedUpload {
  uploadId: string;
  filename: string;
  totalSize: number;
  totalChunks: number;
  retentionHours: number;
  receivedChunks: Set<number>;
  createdAt: Date;
  uploaderIP?: string;
  userAgent?: string;
}

export class ChunkedUploadManager {
  private uploads: Map<string, ChunkedUpload> = new Map();
  private tempDir: string;
  private cleanupInterval: NodeJS.Timeout;

  constructor(tempDir: string = './uploads/temp') {
    this.tempDir = tempDir;

    // Initialize temp directory
    this.initTempDir();

    // Cleanup stale uploads every 30 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleUploads();
    }, 30 * 60 * 1000);
  }

  private async initTempDir() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      logger.error({ err: error }, 'Failed to create temp directory');
    }
  }

  /**
   * Initialize a new chunked upload
   */
  private static readonly MAX_CONCURRENT_UPLOADS_PER_IP = 5;

  async initUpload(
    filename: string,
    totalSize: number,
    totalChunks: number,
    retentionHours: number,
    uploaderIP?: string,
    userAgent?: string
  ): Promise<{ uploadId: string; chunkSize: number }> {
    // Enforce per-IP concurrent upload limit
    if (uploaderIP) {
      let activeForIP = 0;
      for (const upload of this.uploads.values()) {
        if (upload.uploaderIP === uploaderIP) activeForIP++;
      }
      if (activeForIP >= ChunkedUploadManager.MAX_CONCURRENT_UPLOADS_PER_IP) {
        throw new Error(`Too many concurrent uploads. Maximum ${ChunkedUploadManager.MAX_CONCURRENT_UPLOADS_PER_IP} active uploads per client.`);
      }
    }

    const uploadId = uuidv4();

    // Create upload directory
    const uploadDir = join(this.tempDir, uploadId);
    await fs.mkdir(uploadDir, { recursive: true });

    // Store upload metadata
    this.uploads.set(uploadId, {
      uploadId,
      filename,
      totalSize,
      totalChunks,
      retentionHours,
      receivedChunks: new Set(),
      createdAt: new Date(),
      uploaderIP,
      userAgent
    });

    logger.info(`Initialized chunked upload: ${uploadId} (${totalChunks} chunks, ${totalSize} bytes)`);

    return {
      uploadId,
      chunkSize: 10485760 // 10MB
    };
  }

  /**
   * Store a chunk
   */
  async storeChunk(
    uploadId: string,
    chunkIndex: number,
    chunkData: Buffer
  ): Promise<void> {
    const upload = this.uploads.get(uploadId);
    if (!upload) {
      throw new Error('Upload not found or expired');
    }

    // Validate chunk index
    if (chunkIndex < 0 || chunkIndex >= upload.totalChunks) {
      throw new Error(`Invalid chunk index: ${chunkIndex}`);
    }

    // Check if chunk already received (idempotent)
    if (upload.receivedChunks.has(chunkIndex)) {
      logger.info(`Chunk ${chunkIndex} already received for upload ${uploadId}`);
      return;
    }

    // Write chunk to disk
    const chunkPath = join(this.tempDir, uploadId, `chunk-${chunkIndex}`);
    await fs.writeFile(chunkPath, chunkData);

    // Mark as received
    upload.receivedChunks.add(chunkIndex);

    logger.info(`Received chunk ${chunkIndex + 1}/${upload.totalChunks} for upload ${uploadId}`);
  }

  /**
   * Check if all chunks have been received
   */
  isUploadComplete(uploadId: string): boolean {
    const upload = this.uploads.get(uploadId);
    if (!upload) return false;

    return upload.receivedChunks.size === upload.totalChunks;
  }

  /**
   * Assemble chunks into a single file on disk (streaming, no memory limit).
   * Returns the path to the assembled file.
   */
  async assembleChunks(uploadId: string): Promise<string> {
    const upload = this.uploads.get(uploadId);
    if (!upload) {
      throw new Error('Upload not found or expired');
    }

    if (!this.isUploadComplete(uploadId)) {
      throw new Error(
        `Upload incomplete: ${upload.receivedChunks.size}/${upload.totalChunks} chunks received`
      );
    }

    logger.info(`Assembling ${upload.totalChunks} chunks for upload ${uploadId}`);

    const assembledPath = join(this.tempDir, uploadId, 'assembled');
    const writeStream = createWriteStream(assembledPath);

    let writtenBytes = 0;

    for (let i = 0; i < upload.totalChunks; i++) {
      const chunkPath = join(this.tempDir, uploadId, `chunk-${i}`);
      const readStream = createReadStream(chunkPath);
      await pipeline(readStream, writeStream, { end: false });
      const stat = await fs.stat(chunkPath);
      writtenBytes += stat.size;
    }

    writeStream.end();
    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    logger.info(`Assembled file: ${writtenBytes} bytes (expected ${upload.totalSize})`);

    if (writtenBytes !== upload.totalSize) {
      // Clean up the assembled file on size mismatch
      await fs.unlink(assembledPath).catch(() => {});
      throw new Error(
        `File size mismatch: assembled ${writtenBytes} bytes but expected ${upload.totalSize} bytes`
      );
    }

    return assembledPath;
  }

  /**
   * Get upload metadata
   */
  getUpload(uploadId: string): ChunkedUpload | undefined {
    return this.uploads.get(uploadId);
  }

  /**
   * Clean up upload (delete chunks and metadata)
   */
  async cleanupUpload(uploadId: string): Promise<void> {
    const upload = this.uploads.get(uploadId);
    if (!upload) return;

    try {
      // Delete upload directory and all chunks
      const uploadDir = join(this.tempDir, uploadId);
      await fs.rm(uploadDir, { recursive: true, force: true });

      // Remove from memory
      this.uploads.delete(uploadId);

      logger.info(`Cleaned up upload ${uploadId}`);
    } catch (error) {
      logger.error({ err: error }, `Failed to cleanup upload ${uploadId}`);
    }
  }

  /**
   * Cancel an upload (cleanup and remove)
   */
  async cancelUpload(uploadId: string): Promise<void> {
    await this.cleanupUpload(uploadId);
    logger.info(`Cancelled upload ${uploadId}`);
  }

  /**
   * Cleanup uploads older than 2 hours
   */
  private async cleanupStaleUploads(): Promise<void> {
    const now = Date.now();
    const maxAge = 2 * 60 * 60 * 1000; // 2 hours

    for (const [uploadId, upload] of this.uploads.entries()) {
      const age = now - upload.createdAt.getTime();

      if (age > maxAge) {
        logger.info(`Cleaning up stale upload ${uploadId} (age: ${Math.round(age / 1000 / 60)} minutes)`);
        await this.cleanupUpload(uploadId);
      }
    }
  }

  /**
   * Shutdown cleanup interval
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  /**
   * Get stats for monitoring
   */
  getStats() {
    const activeUploads = this.uploads.size;
    const uploadDetails = Array.from(this.uploads.values()).map(u => ({
      uploadId: u.uploadId,
      filename: u.filename,
      progress: `${u.receivedChunks.size}/${u.totalChunks}`,
      age: Math.round((Date.now() - u.createdAt.getTime()) / 1000 / 60)
    }));

    return {
      activeUploads,
      uploads: uploadDetails
    };
  }
}

// Singleton instance
let chunkedUploadManager: ChunkedUploadManager | null = null;

export function getChunkedUploadManager(): ChunkedUploadManager {
  if (!chunkedUploadManager) {
    chunkedUploadManager = new ChunkedUploadManager();
  }
  return chunkedUploadManager;
}
