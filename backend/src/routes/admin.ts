import { Router, Request, Response } from 'express';
import { config } from '../config/config';
import { getFileManager } from '../services/fileManagerService';
import { requireAuth, logAction, withAuth, AuthenticatedRequest } from '../auth/middleware';

const router = Router();

/**
 * Get storage statistics
 * GET /api/admin/stats
 */
router.get('/stats', requireAuth, logAction('VIEW_STATS'), withAuth(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const fileManager = getFileManager();
    const stats = await fileManager.getStats();

    // Handle both FileManagerV2 (structured) and FileManager (flat) response formats
    const response = 'files' in stats ? {
      // FileManagerV2 format
      totalFiles: stats.files.total,
      totalSize: stats.files.totalSize,
      expiredFiles: stats.files.expired,
      activeFiles: stats.files.active,
      totalDownloads: stats.files.totalDownloads,
      storage: stats.storage
    } : {
      // FileManager format (fallback)
      totalFiles: stats.totalFiles,
      totalSize: stats.totalSize,
      expiredFiles: stats.expiredFiles,
      activeFiles: stats.totalFiles - stats.expiredFiles,
      totalDownloads: 0,
      storage: {}
    };

    res.json({
      ...response,
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
}));

/**
 * Trigger cleanup of expired files
 * POST /api/admin/cleanup
 */
router.post('/cleanup', requireAuth, logAction('CLEANUP_FILES'), withAuth(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const fileManager = getFileManager();
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
}));

/**
 * Get current retention configuration
 * GET /api/admin/config
 */
router.get('/config', requireAuth, logAction('VIEW_CONFIG'), withAuth((req: AuthenticatedRequest, res: Response) => {
  res.json({
    retention: config.retention,
    rateLimiting: config.rateLimiting,
    maxFileSize: config.retention.maxFileSize
  });
}));

/**
 * Update retention configuration (in memory only)
 * PUT /api/admin/config
 */
router.put('/config', requireAuth, logAction('UPDATE_CONFIG'), withAuth((req: AuthenticatedRequest, res: Response) => {
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
}));

export default router;