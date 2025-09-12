import { Router, Request, Response } from 'express';
import { FileManager } from '../storage/fileManager';
import { RFC8188Crypto } from '../encryption/rfc8188';

const router = Router();
const fileManager = new FileManager();

/**
 * Download and decrypt file
 * GET /api/download/:id
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
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

    // Get file metadata and data
    const [metadata, encryptedData] = await Promise.all([
      fileManager.getMetadata(id),
      fileManager.getFileData(id)
    ]);

    if (!metadata || !encryptedData) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Increment download counter
    await fileManager.incrementDownloadCount(id);

    // Set response headers for encrypted file
    res.setHeader('Content-Disposition', `attachment; filename="${metadata.filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream'); // Always binary for encrypted data
    res.setHeader('Content-Length', encryptedData.length.toString());
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Send encrypted file (client will decrypt)
    res.send(encryptedData);

  } catch (error) {
    console.error('Download error:', error);
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