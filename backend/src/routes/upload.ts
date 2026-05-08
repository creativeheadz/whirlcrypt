import { Router, Request, Response } from 'express';
import multer from 'multer';
import { config } from '../config/config';
import { UploadResponse } from '../types';
import { getFileManager } from '../services/fileManagerService';
import { exec } from 'child_process';
import { promisify } from 'util';
import logger from '../utils/logger';

const execAsync = promisify(exec);
const router = Router();

/**
 * Check available disk space
 * Returns available space in bytes
 */
async function getAvailableDiskSpace(path: string): Promise<number> {
  try {
    const { stdout } = await execAsync(`df -B1 "${path}" | tail -1 | awk '{print $4}'`);
    return parseInt(stdout.trim());
  } catch (error) {
    logger.error({ err: error }, 'Error checking disk space');
    // Return a large number if we can't check (assume space available)
    return Number.MAX_SAFE_INTEGER;
  }
}

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

    // Check available disk space before processing
    const uploadPath = config.storage.local?.path || './uploads';
    const availableSpace = await getAvailableDiskSpace(uploadPath);
    const requiredSpace = req.file.size * 1.5; // Add 50% buffer for temporary files
    
    if (availableSpace < requiredSpace) {
      logger.error(`Insufficient disk space: available=${availableSpace}, required=${requiredSpace}`);
      return res.status(507).json({ 
        error: 'Insufficient storage space on server. Please try again later or contact administrator.' 
      });
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
    // No need to verify encryption parameters - server never decrypts files

    // Store the already encrypted file data with enhanced metadata encryption
    const fileManager = getFileManager();
    const metadata = await fileManager.storeFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      retentionHours,
      undefined, // maxDownloads
      req.ip,    // uploaderIP for encrypted metadata
      req.headers['user-agent'] // userAgent for encrypted metadata
    );

    const response: UploadResponse = {
      id: metadata.id,
      downloadUrl: `/api/download/${metadata.id}`,
      expiresAt: metadata.expiresAt.toISOString()
    };

    res.json(response);

  } catch (error) {
    logger.error({ err: error }, 'Upload error');
    
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