import { Router, Request, Response } from 'express';
import { FileManager } from '../storage/fileManager';
import { config } from '../config/config';

const router = Router();
const fileManager = new FileManager();

/**
 * Get storage statistics
 * GET /api/admin/stats
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await fileManager.getStats();
    
    res.json({
      ...stats,
      config: {
        maxFileSize: config.retention.maxFileSize,
        defaultRetentionHours: config.retention.defaultRetentionHours,
        maxRetentionHours: config.retention.maxRetentionHours,
        allowedExtensions: config.retention.allowedExtensions
      }
    });
    
  } catch (error) {
    console.error('Stats error:', error);
    const message = error instanceof Error ? error.message : 'Failed to get stats';
    res.status(500).json({ error: message });
  }
});

/**
 * Trigger cleanup of expired files
 * POST /api/admin/cleanup
 */
router.post('/cleanup', async (req: Request, res: Response) => {
  try {
    const cleanedCount = await fileManager.cleanupExpiredFiles();
    
    res.json({
      message: `Cleaned up ${cleanedCount} expired files`,
      cleanedCount
    });
    
  } catch (error) {
    console.error('Cleanup error:', error);
    const message = error instanceof Error ? error.message : 'Cleanup failed';
    res.status(500).json({ error: message });
  }
});

/**
 * Get current retention configuration
 * GET /api/admin/config
 */
router.get('/config', (req: Request, res: Response) => {
  res.json({
    retention: config.retention,
    rateLimiting: config.rateLimiting,
    maxFileSize: config.retention.maxFileSize
  });
});

/**
 * Update retention configuration (in memory only)
 * PUT /api/admin/config
 */
router.put('/config', (req: Request, res: Response) => {
  try {
    const { defaultRetentionHours, maxRetentionHours, maxFileSize } = req.body;
    
    if (defaultRetentionHours && defaultRetentionHours > 0) {
      config.retention.defaultRetentionHours = Math.min(
        defaultRetentionHours, 
        config.retention.maxRetentionHours
      );
    }
    
    if (maxRetentionHours && maxRetentionHours > 0) {
      config.retention.maxRetentionHours = maxRetentionHours;
    }
    
    if (maxFileSize && maxFileSize > 0) {
      config.retention.maxFileSize = maxFileSize;
    }
    
    res.json({
      message: 'Configuration updated',
      retention: config.retention
    });
    
  } catch (error) {
    console.error('Config update error:', error);
    const message = error instanceof Error ? error.message : 'Failed to update config';
    res.status(500).json({ error: message });
  }
});

export default router;