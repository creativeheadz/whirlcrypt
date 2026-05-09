import { Router, Request, Response } from 'express';
import multer from 'multer';
import { mkdirSync, promises as fsp } from 'fs';
import { join } from 'path';
import { config } from '../config/config';
import { UploadResponse } from '../types';
import { getFileManager } from '../services/fileManagerService';

const router = Router();

// Multer writes uploads to a tempdir on the same filesystem as the storage path
// so the subsequent rename-into-place is atomic. ${UPLOAD_DIR}/.tmp keeps both
// sides under the same mount and avoids EXDEV fallback in the common case.
const tmpDir = config.storage.local
  ? join(config.storage.local.path, '.tmp')
  : join(process.cwd(), 'uploads', '.tmp');
mkdirSync(tmpDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: tmpDir,
    filename: (_req, _file, cb) => {
      cb(null, `incoming-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
    },
  }),
  limits: {
    fileSize: config.retention.maxFileSize,
    files: 1
  },
  fileFilter: (req, file, cb) => {
    if (config.retention.allowedExtensions) {
      const ext = file.originalname.split('.').pop()?.toLowerCase();
      if (ext && !config.retention.allowedExtensions.includes(ext)) {
        return cb(new Error(`File type .${ext} not allowed`));
      }
    }
    cb(null, true);
  }
});

const safeUnlink = async (path?: string) => {
  if (!path) return;
  try { await fsp.unlink(path); } catch { /* already gone */ }
};

/**
 * Upload and store an already-encrypted file.
 * POST /api/upload
 *
 * The client encrypts the payload with RFC 8188 in-browser; the server
 * stores opaque bytes and never sees plaintext or keys. Multer streams
 * the request body to a temp file on disk to keep memory bounded for
 * large uploads, then the storage provider renames it into place.
 */
router.post('/', upload.single('file'), async (req: Request, res: Response) => {
  const tempPath = req.file?.path;
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const retentionHours = req.body.retentionHours
      ? parseInt(req.body.retentionHours)
      : config.retention.defaultRetentionHours;

    if (retentionHours > config.retention.maxRetentionHours) {
      await safeUnlink(tempPath);
      return res.status(400).json({
        error: `Retention period cannot exceed ${config.retention.maxRetentionHours} hours`
      });
    }

    let maxDownloads: number | undefined;
    if (req.body.maxDownloads !== undefined && req.body.maxDownloads !== '') {
      maxDownloads = parseInt(req.body.maxDownloads, 10);
      if (!Number.isFinite(maxDownloads) || maxDownloads < 1 || maxDownloads > 1000) {
        await safeUnlink(tempPath);
        return res.status(400).json({
          error: 'maxDownloads must be a positive integer between 1 and 1000'
        });
      }
    }

    const fileManager = getFileManager();
    const metadata = await fileManager.storeFileFromPath(
      req.file.path,
      req.file.size,
      req.file.originalname,
      req.file.mimetype,
      retentionHours,
      maxDownloads,
      req.ip,                // uploaderIP for encrypted metadata
      req.headers['user-agent'] // userAgent for encrypted metadata
    );

    const response: UploadResponse = {
      id: metadata.id,
      downloadUrl: `/api/download/${metadata.id}`,
      expiresAt: metadata.expiresAt.toISOString()
    };

    res.json(response);
  } catch (error) {
    // Storage threw before consuming the temp file (or did so partially) — clean it up.
    await safeUnlink(tempPath);

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
