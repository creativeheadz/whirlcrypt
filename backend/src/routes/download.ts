import { Router, Request, Response } from 'express';
import { createReadStream } from 'fs';
import { pipeline } from 'stream/promises';
import { getFileManager } from '../services/fileManagerService';

const router = Router();

/**
 * Download and decrypt file
 * GET /api/download/:id
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const fileManager = getFileManager();

    // Parse decryption key from request headers or body
    const keyHex = req.headers['x-encryption-key'] as string || req.query.key as string;

    if (!keyHex) {
      return res.status(400).json({ error: 'Missing encryption key' });
    }

    // Check if file exists and is available
    const isAvailable = await fileManager.isFileAvailable(id);
    if (!isAvailable) {
      return res.status(404).json({ error: 'File not found or expired' });
    }

    // Get file metadata first
    const metadata = await fileManager.getMetadata(id);
    if (!metadata) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Increment download counter and log download (if supported by the file manager)
    if ('incrementDownloadCount' in fileManager) {
      await fileManager.incrementDownloadCount(id, req.ip, req.get('User-Agent'));
    }

    // Set response headers for encrypted file
    // NOTE: Don't set filename in Content-Disposition - frontend will determine it after decryption
    res.setHeader('Content-Disposition', 'attachment');
    res.setHeader('Content-Type', 'application/octet-stream'); // Always binary for encrypted data
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // For FileManagerV2 with database, try to stream if possible
    if ('getFileStream' in fileManager && typeof fileManager.getFileStream === 'function') {
      try {
        const stream = await fileManager.getFileStream(id);
        if (stream) {
          // Set content length if we have the size
          if (metadata.encryptedSize || metadata.size) {
            res.setHeader('Content-Length', (metadata.encryptedSize || metadata.size).toString());
          }

          // Stream the file
          await pipeline(stream, res);
          return;
        }
      } catch (streamError) {
        console.warn('Streaming failed, falling back to buffer method:', streamError);
      }
    }

    // Fallback: Get file data as buffer (for compatibility with existing FileManager)
    const encryptedData = await fileManager.getFileData(id);
    if (!encryptedData) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Set content length
    res.setHeader('Content-Length', encryptedData.length.toString());

    // Send encrypted file (client will decrypt)
    res.send(encryptedData);

  } catch (error) {
    console.error('Download error for file ID:', req.params.id, error);

    // More detailed error logging
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
    }

    const message = error instanceof Error ? error.message : 'Download failed';
    res.status(500).json({ error: message });
  }
});

/**
 * Get file info without downloading
 * GET /api/download/:id/info
 */
router.get('/:id/info', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const fileManager = getFileManager();

    // Check if file exists and is available
    const isAvailable = await fileManager.isFileAvailable(id);
    if (!isAvailable) {
      return res.status(404).json({ error: 'File not found or expired' });
    }

    const metadata = await fileManager.getMetadata(id);
    if (!metadata) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Return safe metadata (no sensitive info)
    res.json({
      filename: metadata.filename,
      size: metadata.size,
      contentType: metadata.contentType,
      uploadDate: metadata.uploadDate,
      expiresAt: metadata.expiresAt,
      downloadCount: metadata.downloadCount
    });

  } catch (error) {
    console.error('Info error:', error);
    const message = error instanceof Error ? error.message : 'Failed to get file info';
    res.status(500).json({ error: message });
  }
});

export default router;