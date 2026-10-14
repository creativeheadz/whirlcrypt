import { Router, Request, Response } from 'express';
import { config } from '../config/config';

const router = Router();

/**
 * Public upload limits. Non-sensitive by design: the uploader needs the real
 * maxFileSize BEFORE encrypting so users never encrypt gigabytes the server
 * will reject. Always reflects live config (including admin overrides).
 * GET /api/config
 */
export function getPublicConfig(_req: Request, res: Response): void {
  res.json({
    maxFileSize: config.retention.maxFileSize,
    defaultRetentionHours: config.retention.defaultRetentionHours,
    maxRetentionHours: config.retention.maxRetentionHours,
  });
}

router.get('/', getPublicConfig);

export default router;
