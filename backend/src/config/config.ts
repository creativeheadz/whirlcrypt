import { RetentionConfig } from '../types';

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  poolMax: number;
  idleTimeout: number;
  connectionTimeout: number;
  ssl: boolean;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
}

export interface StorageConfig {
  provider: string;
  local?: {
    path: string;
    createSubdirs: boolean;
  };
  s3?: {
    bucket: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    endpoint?: string;
    prefix?: string;
  };
}

export interface AppConfig {
  port: number;
  nodeEnv: string;
  corsOrigin: string[];
  database: DatabaseConfig;
  redis?: RedisConfig;
  storage: StorageConfig;
  retention: RetentionConfig;
  rateLimiting: {
    windowMs: number;
    maxRequests: number;
  };
}

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '3001'),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'],
  
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'whirlcrypt',
    user: process.env.DB_USER || 'whirlcrypt_user',
    password: process.env.DB_PASSWORD || 'whirlcrypt_password',
    poolMax: parseInt(process.env.DB_POOL_MAX || '20'),
    idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
    connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000'),
    ssl: process.env.DB_SSL === 'true'
  },

  redis: process.env.REDIS_HOST ? {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0')
  } : undefined,

  storage: {
    provider: process.env.STORAGE_PROVIDER || 'local',
    local: {
      path: process.env.UPLOAD_DIR || './uploads',
      createSubdirs: process.env.STORAGE_CREATE_SUBDIRS !== 'false'
    },
    s3: process.env.S3_BUCKET ? {
      bucket: process.env.S3_BUCKET,
      region: process.env.S3_REGION || 'us-east-1',
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      endpoint: process.env.S3_ENDPOINT,
      prefix: process.env.S3_PREFIX
    } : undefined
  },

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