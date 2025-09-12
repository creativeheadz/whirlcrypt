import { RetentionConfig } from '../types';

export interface AppConfig {
  port: number;
  corsOrigin: string[];
  uploadDir: string;
  retention: RetentionConfig;
  rateLimiting: {
    windowMs: number;
    maxRequests: number;
  };
}

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '3001'),
  corsOrigin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'],
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  retention: {
    defaultRetentionHours: parseInt(process.env.DEFAULT_RETENTION_HOURS || '24'),
    maxRetentionHours: parseInt(process.env.MAX_RETENTION_HOURS || '168'), // 7 days
    cleanupIntervalMinutes: parseInt(process.env.CLEANUP_INTERVAL_MINUTES || '60'),
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '104857600'), // 100MB
    allowedExtensions: process.env.ALLOWED_EXTENSIONS?.split(',')
  },
  rateLimiting: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100')
  }
};