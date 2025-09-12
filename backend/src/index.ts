import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import { join } from 'path';
import { config } from './config/config';
import { FileManager } from './storage/fileManager';
import {
  cspMiddleware,
  rateLimitMiddleware,
  uploadRateLimitMiddleware,
  securityHeaders,
  sanitizeInput
} from './middleware/security';

// Import routes
import uploadRouter from './routes/upload';
import downloadRouter from './routes/download';
import adminRouter from './routes/admin';

const app = express();
const fileManager = new FileManager();

// Security middleware
app.use(securityHeaders);
app.use(cspMiddleware);
app.use(rateLimitMiddleware);

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
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Routes
app.use('/api/upload', uploadRateLimitMiddleware, uploadRouter);
app.use('/api/download', downloadRouter);
app.use('/api/admin', adminRouter);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Cleanup cron job - runs every hour by default
const cleanupCron = `0 */${config.retention.cleanupIntervalMinutes} * * *`;
cron.schedule(cleanupCron, async () => {
  try {
    const cleanedCount = await fileManager.cleanupExpiredFiles();
    console.log(`Cleanup completed: ${cleanedCount} expired files removed`);
  } catch (error) {
    console.error('Cleanup error:', error);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully');
  process.exit(0);
});

// Start server
const port = config.port;
app.listen(port, () => {
  console.log(`🚀 Whirlcrypt API running on port ${port}`);
  console.log(`📁 Upload directory: ${config.uploadDir}`);
  console.log(`⏰ Default retention: ${config.retention.defaultRetentionHours} hours`);
  console.log(`🧹 Cleanup runs every ${config.retention.cleanupIntervalMinutes} minutes`);
  console.log(`📦 Max file size: ${Math.round(config.retention.maxFileSize / 1024 / 1024)}MB`);
});

export default app;