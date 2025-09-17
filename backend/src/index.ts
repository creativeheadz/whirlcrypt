import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import { join } from 'path';

// Load environment variables
dotenv.config();
import { config } from './config/config';
import { FileManagerV2 } from './storage/FileManagerV2';
import { FileManager } from './storage/fileManager';
import { DatabaseConnection } from './database/connection';
import { setFileManager } from './services/fileManagerService';
import { certificateMonitoringJob } from './jobs/certificateMonitoring';
import {
  cspMiddleware,
  rateLimitMiddleware,
  uploadRateLimitMiddleware,
  securityHeaders,
  sanitizeInput,
  handleCSPViolation
} from './middleware/security';

// Import routes
import uploadRouter from './routes/upload';
import downloadRouter from './routes/download';
import adminRouter from './routes/admin';
import adminAuthRouter from './routes/admin-auth';
import securityRouter from './routes/security';

// Import attack detection middleware
import { AttackDetectionMiddleware } from './middleware/attackDetection';

const app = express();
let fileManager: FileManagerV2 | FileManager;

// Trust proxy for reverse proxy setup (nginx) - use loopback for local setup
app.set('trust proxy', 'loopback');

// Security middleware
app.use(securityHeaders);

// Serve static assets BEFORE attack detection and rate limiting
if (config.nodeEnv === 'production') {
  const frontendPath = join(__dirname, '../../frontend/dist');

  // Serve static assets (JS, CSS, images) without any middleware interference
  app.use('/assets', express.static(join(frontendPath, 'assets')));
  app.use('/favicon.ico', express.static(join(frontendPath, 'favicon.ico')));
  app.use('/favicon.png', express.static(join(frontendPath, 'favicon.png')));
}

// Apply rate limiting and attack detection AFTER static assets
app.use(rateLimitMiddleware);

// Attack detection middleware (before routes)
app.use(AttackDetectionMiddleware.detect());

// CORS configuration
app.use(cors({
  origin: config.corsOrigin,
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'x-encryption-key']
}));

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(sanitizeInput);

// Load OpenAPI spec
const swaggerDocument = YAML.load(join(__dirname, '../../docs/openapi.yaml'));

// API Documentation
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Whirlcrypt API Documentation',
  customfavIcon: '/favicon.ico'
}));

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const dbHealth = await DatabaseConnection.healthCheck();
    
    // Check file manager health if available
    let fileSystemHealth: any = { status: 'healthy', storage: {} };
    if (fileManager && 'healthCheck' in fileManager) {
      fileSystemHealth = await fileManager.healthCheck();
    }

    const isHealthy = dbHealth.status === 'healthy' && fileSystemHealth.status === 'healthy';
    const isUsingDatabase = fileManager instanceof FileManagerV2;

    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      database: dbHealth,
      storage: fileSystemHealth.storage || {},
      fileManager: isUsingDatabase ? 'FileManagerV2 (Database)' : 'FileManager (Filesystem)',
      environment: config.nodeEnv
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Routes
app.use('/api/upload', uploadRateLimitMiddleware, uploadRouter);
app.use('/api/download', downloadRouter);
app.use('/api/admin/auth', adminAuthRouter);
app.use('/api/admin', adminRouter);
app.use('/api/security', securityRouter); // Public security dashboard

// Serve static files (error pages, etc.)
app.use(express.static(join(__dirname, '../public')));

// Serve static frontend files in production
if (config.nodeEnv === 'production') {
  const frontendPath = join(__dirname, '../../frontend/dist');

  // Serve index.html for all non-API routes (SPA routing) with CSP nonce injection
  app.get('*', cspMiddleware, (req, res) => {
    // Skip API routes
    if (req.path.startsWith('/api/')) {
      return res.status(404).sendFile(join(__dirname, '../public/404.html'));
    }

    // Inject CSP nonce into HTML and remove conflicting CSP meta tag
    const fs = require('fs');
    const indexPath = join(frontendPath, 'index.html');

    try {
      let html = fs.readFileSync(indexPath, 'utf8');
      const nonce = res.locals.cspNonce;

      if (nonce) {
        // Add nonce to script tags
        html = html.replace(/<script/g, `<script nonce="${nonce}"`);
        // Add nonce to style tags if any
        html = html.replace(/<style/g, `<style nonce="${nonce}"`);

        // Remove conflicting CSP meta tag (server CSP takes precedence)
        html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/i, '');
      }

      res.send(html);
    } catch (error) {
      console.error('Error serving index.html:', error);
      res.status(500).send('Internal Server Error');
    }
  });
} else {
  // 404 handler for development (frontend served separately)
  app.use('*', AttackDetectionMiddleware.handle404());
}

// Global error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);

  // Check if request accepts HTML
  if (req.accepts('html')) {
    return res.status(500).sendFile(join(__dirname, '../public/500.html'));
  }

  // API requests get JSON response
  res.status(500).json({ error: 'Internal server error' });
});

// Cleanup cron job - runs every hour by default
const cleanupCron = `0 */${config.retention.cleanupIntervalMinutes} * * *`;
cron.schedule(cleanupCron, async () => {
  try {
    const cleanedCount = await fileManager.cleanupExpiredFiles();
    console.log(`🧹 File cleanup completed: ${cleanedCount} expired files removed`);

    // Also cleanup security logs and expired bans
    const { AttackLogger } = await import('./services/AttackLogger');
    const { BanManager } = await import('./services/BanManager');

    const attackLogger = new AttackLogger();
    const banManager = new BanManager();

    const oldLogsCleanup = await attackLogger.cleanupOldLogs();
    const expiredBansCleanup = await banManager.cleanupExpiredBans();

    console.log(`🛡️ Security cleanup completed: ${oldLogsCleanup} old logs, ${expiredBansCleanup} expired bans`);
  } catch (error) {
    console.error('Cleanup error:', error);
  }
});

// Initialize application
async function initializeApp() {
  try {
    console.log('🔄 Initializing Whirlcrypt...');
    
    // Test database connection
    const dbConnected = await DatabaseConnection.testConnection();
    
    if (dbConnected) {
      console.log('✅ Database connected - using FileManagerV2');
      
      // Initialize database schema
      if (config.nodeEnv === 'development') {
        try {
          await DatabaseConnection.initializeSchema();
        } catch (error) {
          console.warn('⚠️ Could not initialize database schema (may already exist):', (error as Error).message);
        }
      }

      // Initialize FileManagerV2 with database
      fileManager = new FileManagerV2();
      await fileManager.initialize();
      setFileManager(fileManager);
    } else {
      console.warn('⚠️ Database not available - falling back to FileManager (filesystem only)');
      console.warn('⚠️ For full functionality, set up PostgreSQL and configure DB_* environment variables');
      
      // Initialize old FileManager without database
      fileManager = new FileManager();
      setFileManager(fileManager);
    }

    console.log('✅ Application initialized successfully');
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize application:', error);
    return false;
  }
}

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log('🔄 Shutting down gracefully...');
  
  try {
    // Cleanup file manager if it has a cleanup method
    if (fileManager && 'cleanup' in fileManager) {
      await fileManager.cleanup();
    }
    
    // Close database connection
    await DatabaseConnection.close();
    console.log('✅ Cleanup completed');
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  }
  
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
const port = config.port;

initializeApp().then((initialized) => {
  if (!initialized) {
    console.error('❌ Application failed to initialize');
    process.exit(1);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Whirlcrypt API v2.0 running on port ${port}`);
    console.log(`🌐 Server accessible at http://0.0.0.0:${port} and http://192.168.1.100:${port}`);
    console.log(`🗄️ Database: ${config.database.host}:${config.database.port}/${config.database.database}`);
    console.log(`📁 Storage: ${config.storage.provider} (${config.storage.local?.path || 'configured'})`);
    console.log(`⏰ Default retention: ${config.retention.defaultRetentionHours} hours`);
    console.log(`🧹 Cleanup runs every ${config.retention.cleanupIntervalMinutes} minutes`);
    console.log(`📦 Max file size: ${Math.round(config.retention.maxFileSize / 1024 / 1024)}MB`);
    console.log(`🌍 Environment: ${config.nodeEnv}`);

    // Start certificate transparency monitoring
    if (process.env.CT_MONITOR_ENABLED !== 'false') {
      certificateMonitoringJob.start();
      console.log(`🔍 Certificate Transparency monitoring enabled`);
    }
  });
}).catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});

export default app;