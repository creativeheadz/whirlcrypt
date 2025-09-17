import { Router, Request, Response } from 'express';
import { config } from '../config/config';
import { getFileManager } from '../services/fileManagerService';
import { requireAuth, logAction, withAuth, AuthenticatedRequest } from '../auth/middleware';
import { certificateMonitoringJob } from '../jobs/certificateMonitoring';

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

/**
 * Get Certificate Transparency monitoring status
 * GET /api/admin/ct-monitor/status
 */
router.get('/ct-monitor/status', requireAuth, logAction('VIEW_CT_MONITOR'), withAuth(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const stats = certificateMonitoringJob.getStatistics();

    res.json({
      success: true,
      data: {
        enabled: process.env.CT_MONITOR_ENABLED !== 'false',
        ...stats,
        schedule: process.env.CT_MONITOR_SCHEDULE || '0 */6 * * *',
        monitoredDomains: process.env.CT_MONITOR_DOMAINS?.split(',').map(d => d.trim()) || []
      }
    });

  } catch (error) {
    console.error('CT monitor status error:', error);
    const message = error instanceof Error ? error.message : 'Failed to get CT monitor status';
    res.status(500).json({ error: message });
  }
}));

/**
 * Force run Certificate Transparency monitoring
 * POST /api/admin/ct-monitor/run
 */
router.post('/ct-monitor/run', requireAuth, logAction('RUN_CT_MONITOR'), withAuth(async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Run monitoring in background
    certificateMonitoringJob.forceRun().catch(error => {
      console.error('Background CT monitoring failed:', error);
    });

    res.json({
      success: true,
      message: 'Certificate Transparency monitoring started'
    });

  } catch (error) {
    console.error('CT monitor run error:', error);
    const message = error instanceof Error ? error.message : 'Failed to run CT monitor';
    res.status(500).json({ error: message });
  }
}));

/**
 * Add domain to CT monitoring
 * POST /api/admin/ct-monitor/domains
 */
router.post('/ct-monitor/domains', requireAuth, logAction('ADD_CT_DOMAIN'), withAuth(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { domain } = req.body;

    if (!domain || typeof domain !== 'string') {
      return res.status(400).json({ error: 'Domain is required' });
    }

    certificateMonitoringJob.addDomain(domain);

    res.json({
      success: true,
      message: `Domain ${domain} added to CT monitoring`
    });

  } catch (error) {
    console.error('CT monitor add domain error:', error);
    const message = error instanceof Error ? error.message : 'Failed to add domain';
    res.status(500).json({ error: message });
  }
}));

export default router;