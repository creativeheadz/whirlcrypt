import { Router, Request, Response } from 'express';
import multer from 'multer';
import { config } from '../config/config';
import { UploadResponse } from '../types';
import { getFileManager } from '../services/fileManagerService';
import { FileManagerV2 } from '../storage/FileManagerV2';
import { getChunkedUploadManager } from '../services/ChunkedUploadManager';
import { chunkedUploadInitRateLimitMiddleware } from '../middleware/security';
import logger from '../utils/logger';

const router = Router();

// Configure multer for memory storage (chunks only)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 11 * 1024 * 1024, // 11MB (10MB chunk + overhead)
    files: 1
  }
});

/**
 * Initialize a chunked upload
 * POST /api/upload/chunked/init
 */
router.post('/init', chunkedUploadInitRateLimitMiddleware, async (req: Request, res: Response) => {
  try {
    const { filename, totalSize, totalChunks, retentionHours: reqRetentionHours } = req.body;

    // Validate input
    if (!filename || !totalSize || !totalChunks) {
      return res.status(400).json({
        error: 'Missing required fields: filename, totalSize, totalChunks'
      });
    }

    // Validate filename
    if (typeof filename !== 'string' || filename.length > 255 || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    // Validate file size
    if (totalSize > config.retention.maxFileSize) {
      return res.status(413).json({
        error: `File too large. Maximum size: ${config.retention.maxFileSize} bytes`
      });
    }

    // Parse and validate retention hours
    const retentionHours = reqRetentionHours ?
      parseInt(reqRetentionHours) :
      config.retention.defaultRetentionHours;

    if (retentionHours > config.retention.maxRetentionHours) {
      return res.status(400).json({
        error: `Retention period cannot exceed ${config.retention.maxRetentionHours} hours`
      });
    }

    // Initialize upload
    const chunkedUploadManager = getChunkedUploadManager();
    const { uploadId, chunkSize } = await chunkedUploadManager.initUpload(
      filename,
      totalSize,
      totalChunks,
      retentionHours,
      req.ip,
      req.headers['user-agent']
    );

    res.json({ uploadId, chunkSize });

  } catch (error) {
    logger.error({ err: error }, 'Chunked upload init error');
    const message = error instanceof Error ? error.message : 'Failed to initialize upload';
    res.status(500).json({ error: message });
  }
});

/**
 * Upload a single chunk
 * POST /api/upload/chunked/chunk/:uploadId
 *
 * No rate limiting here — chunks are validated against an active upload session
 * which was already rate-limited at init. The uploadId acts as a session token.
 * Invalid uploadIds are rejected by ChunkedUploadManager.storeChunk().
 */
router.post('/chunk/:uploadId', upload.single('chunk'), async (req: Request, res: Response) => {
  try {
    const { uploadId } = req.params;
    const chunkIndex = parseInt(req.body.chunkIndex);

    if (!req.file) {
      return res.status(400).json({ error: 'No chunk data uploaded' });
    }

    if (isNaN(chunkIndex) || chunkIndex < 0) {
      return res.status(400).json({ error: 'Invalid chunkIndex' });
    }

    // Validate upload exists and belongs to this IP (session-based auth)
    const chunkedUploadManager = getChunkedUploadManager();
    const uploadMeta = chunkedUploadManager.getUpload(uploadId);
    if (!uploadMeta) {
      return res.status(404).json({ error: 'Upload not found or expired' });
    }
    if (uploadMeta.uploaderIP && uploadMeta.uploaderIP !== req.ip) {
      return res.status(403).json({ error: 'Upload session does not belong to this client' });
    }

    // Store chunk
    await chunkedUploadManager.storeChunk(uploadId, chunkIndex, req.file.buffer);

    // Check if upload is complete
    const isComplete = chunkedUploadManager.isUploadComplete(uploadId);

    res.json({
      received: true,
      chunkIndex,
      isComplete
    });

  } catch (error) {
    logger.error({ err: error }, 'Chunk upload error');
    const message = error instanceof Error ? error.message : 'Failed to upload chunk';
    res.status(500).json({ error: message });
  }
});

/**
 * Finalize upload (assemble chunks and create file)
 * POST /api/upload/chunked/finalize/:uploadId
 */
router.post('/finalize/:uploadId', async (req: Request, res: Response) => {
  try {
    const { uploadId } = req.params;

    const chunkedUploadManager = getChunkedUploadManager();

    // Get upload metadata
    const uploadMeta = chunkedUploadManager.getUpload(uploadId);
    if (!uploadMeta) {
      return res.status(404).json({ error: 'Upload not found or expired' });
    }

    // Verify all chunks received
    if (!chunkedUploadManager.isUploadComplete(uploadId)) {
      return res.status(400).json({
        error: 'Upload incomplete',
        received: uploadMeta.receivedChunks.size,
        total: uploadMeta.totalChunks
      });
    }

    // Assemble chunks to a file on disk (streaming, no memory limit)
    const assembledPath = await chunkedUploadManager.assembleChunks(uploadId);

    // Store assembled file (already encrypted by client)
    const fileManager = getFileManager();
    let metadata;

    if (fileManager instanceof FileManagerV2) {
      // Use path-based storage to avoid loading file into memory
      metadata = await fileManager.storeFileFromPath(
        assembledPath,
        uploadMeta.filename,
        'application/octet-stream',
        uploadMeta.retentionHours,
        undefined,
        uploadMeta.uploaderIP,
        uploadMeta.userAgent
      );
    } else {
      // Fallback FileManager only accepts Buffer - read file into memory
      // This path is only used when database is unavailable
      const { promises: fsPromises } = require('fs');
      const assembledData = await fsPromises.readFile(assembledPath);
      metadata = await fileManager.storeFile(
        assembledData,
        uploadMeta.filename,
        'application/octet-stream',
        uploadMeta.retentionHours
      );
    }

    // Cleanup temporary chunks
    await chunkedUploadManager.cleanupUpload(uploadId);

    const response: UploadResponse = {
      id: metadata.id,
      downloadUrl: `/api/download/${metadata.id}`,
      expiresAt: metadata.expiresAt.toISOString()
    };

    res.json(response);

  } catch (error) {
    logger.error({ err: error }, 'Upload finalize error');
    const message = error instanceof Error ? error.message : 'Failed to finalize upload';
    res.status(500).json({ error: message });
  }
});

/**
 * Cancel upload (cleanup chunks)
 * DELETE /api/upload/chunked/cancel/:uploadId
 */
router.delete('/cancel/:uploadId', async (req: Request, res: Response) => {
  try {
    const { uploadId } = req.params;

    const chunkedUploadManager = getChunkedUploadManager();
    await chunkedUploadManager.cancelUpload(uploadId);

    res.json({ cancelled: true });

  } catch (error) {
    logger.error({ err: error }, 'Upload cancel error');
    const message = error instanceof Error ? error.message : 'Failed to cancel upload';
    res.status(500).json({ error: message });
  }
});

/**
 * Get upload status (for debugging/monitoring)
 * GET /api/upload/chunked/status/:uploadId
 */
router.get('/status/:uploadId', async (req: Request, res: Response) => {
  try {
    const { uploadId } = req.params;

    const chunkedUploadManager = getChunkedUploadManager();
    const upload = chunkedUploadManager.getUpload(uploadId);

    if (!upload) {
      return res.status(404).json({ error: 'Upload not found' });
    }

    res.json({
      uploadId: upload.uploadId,
      filename: upload.filename,
      totalSize: upload.totalSize,
      totalChunks: upload.totalChunks,
      receivedChunks: upload.receivedChunks.size,
      isComplete: chunkedUploadManager.isUploadComplete(uploadId),
      createdAt: upload.createdAt
    });

  } catch (error) {
    logger.error({ err: error }, 'Upload status error');
    const message = error instanceof Error ? error.message : 'Failed to get upload status';
    res.status(500).json({ error: message });
  }
});

export default router;
