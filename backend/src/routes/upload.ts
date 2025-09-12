import { Router, Request, Response } from 'express';
import multer from 'multer';
import { FileManager } from '../storage/fileManager';
import { RFC8188Crypto } from '../encryption/rfc8188';
import { config } from '../config/config';
import { UploadResponse } from '../types';

const router = Router();
const fileManager = new FileManager();

// Configure multer for memory storage (we'll handle encryption)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.retention.maxFileSize,
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // Check allowed extensions if configured
    if (config.retention.allowedExtensions) {
      const ext = file.originalname.split('.').pop()?.toLowerCase();
      if (ext && !config.retention.allowedExtensions.includes(ext)) {
        return cb(new Error(`File type .${ext} not allowed`));
      }
    }
    cb(null, true);
  }
});

/**
 * Upload and encrypt file
 * POST /api/upload
 */
router.post('/', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Parse retention hours from request
    const retentionHours = req.body.retentionHours ? 
      parseInt(req.body.retentionHours) : 
      config.retention.defaultRetentionHours;

    // Validate retention period
    if (retentionHours > config.retention.maxRetentionHours) {
      return res.status(400).json({ 
        error: `Retention period cannot exceed ${config.retention.maxRetentionHours} hours` 
      });
    }

    // File is already encrypted client-side, just store it directly
    // Parse encryption parameters for verification (but don't re-encrypt)
    const keyHex = req.body.key;
    const saltHex = req.body.salt;

    if (!keyHex || !saltHex) {
      return res.status(400).json({ error: 'Missing encryption parameters' });
    }

    // Store the already encrypted file data
    const metadata = await fileManager.storeFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      retentionHours
    );

    const response: UploadResponse = {
      id: metadata.id,
      downloadUrl: `/api/download/${metadata.id}`,
      expiresAt: metadata.expiresAt.toISOString()
    };

    res.json(response);

  } catch (error) {
    console.error('Upload error:', error);
    
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large' });
      }
    }

    const message = error instanceof Error ? error.message : 'Upload failed';
    res.status(500).json({ error: message });
  }
});

export default router;