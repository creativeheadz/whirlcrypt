import { RetentionConfig } from '../types';

/**
 * Validate configuration at startup and warn/fail on issues
 */
function validateConfig(cfg: AppConfig): void {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isProduction = cfg.nodeEnv === 'production';

  // Port validation
  if (cfg.port < 1 || cfg.port > 65535) {
    errors.push(`PORT must be between 1 and 65535 (got ${cfg.port})`);
  }

  // File size validation
  if (cfg.retention.maxFileSize < 1024) {
    errors.push(`MAX_FILE_SIZE must be at least 1024 bytes (got ${cfg.retention.maxFileSize})`);
  }
  if (cfg.retention.maxFileSize > 4294967296) {
    warnings.push(`MAX_FILE_SIZE exceeds 4GB (${cfg.retention.maxFileSize}). Frontend limit is 4GB.`);
  }

  // Retention validation
  if (cfg.retention.defaultRetentionHours < 1) {
    errors.push('DEFAULT_RETENTION_HOURS must be at least 1');
  }
  if (cfg.retention.defaultRetentionHours > cfg.retention.maxRetentionHours) {
    errors.push('DEFAULT_RETENTION_HOURS cannot exceed MAX_RETENTION_HOURS');
  }

  // Rate limiting validation
  if (cfg.rateLimiting.maxRequests < 1) {
    errors.push('RATE_LIMIT_MAX_REQUESTS must be at least 1');
  }

  // Production-specific checks
  if (isProduction) {
    if (cfg.corsOrigin.some(o => o.includes('localhost'))) {
      errors.push('CORS_ORIGIN contains localhost — not allowed in production');
    }
    if (!process.env.JWT_SECRET) {
      errors.push('JWT_SECRET must be set in production');
    }
    if (!process.env.METADATA_ENCRYPTION_KEY) {
      errors.push('METADATA_ENCRYPTION_KEY must be set in production');
    }
    if (cfg.database.password === 'whirlcrypt_password') {
      errors.push('DB_PASSWORD is using the default value — must be changed for production');
    }
  }

  if (warnings.length > 0) {
    console.warn('Configuration warnings:');
    warnings.forEach(w => console.warn(`  - ${w}`));
  }

  if (errors.length > 0) {
    console.error('Configuration errors:');
    errors.forEach(e => console.error(`  - ${e}`));
    if (isProduction) {
      console.error('Aborting startup due to configuration errors in production mode.');
      process.exit(1);
    }
  }
}

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
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '4294967296'), // 4GB (matches frontend limit)
    allowedExtensions: process.env.ALLOWED_EXTENSIONS?.split(',').filter(ext => ext.trim() !== '') || undefined
  },

  rateLimiting: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100')
  }
};

// Validate configuration at startup
validateConfig(config);