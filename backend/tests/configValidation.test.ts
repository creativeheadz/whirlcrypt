import { describe, it, expect } from 'vitest';

// Test the validation logic directly (extracted from config.ts)
interface TestConfig {
  port: number;
  nodeEnv: string;
  corsOrigin: string[];
  retention: {
    maxFileSize: number;
    defaultRetentionHours: number;
    maxRetentionHours: number;
  };
  rateLimiting: {
    maxRequests: number;
  };
}

function validateTestConfig(cfg: TestConfig): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (cfg.port < 1 || cfg.port > 65535) {
    errors.push(`PORT must be between 1 and 65535 (got ${cfg.port})`);
  }

  if (cfg.retention.maxFileSize < 1024) {
    errors.push(`MAX_FILE_SIZE must be at least 1024 bytes`);
  }
  if (cfg.retention.maxFileSize > 4294967296) {
    warnings.push(`MAX_FILE_SIZE exceeds 4GB`);
  }

  if (cfg.retention.defaultRetentionHours < 1) {
    errors.push('DEFAULT_RETENTION_HOURS must be at least 1');
  }
  if (cfg.retention.defaultRetentionHours > cfg.retention.maxRetentionHours) {
    errors.push('DEFAULT_RETENTION_HOURS cannot exceed MAX_RETENTION_HOURS');
  }

  if (cfg.rateLimiting.maxRequests < 1) {
    errors.push('RATE_LIMIT_MAX_REQUESTS must be at least 1');
  }

  if (cfg.nodeEnv === 'production') {
    if (cfg.corsOrigin.some(o => o.includes('localhost'))) {
      warnings.push('CORS_ORIGIN contains localhost');
    }
  }

  return { errors, warnings };
}

describe('Config Validation', () => {
  const validConfig: TestConfig = {
    port: 3001,
    nodeEnv: 'development',
    corsOrigin: ['http://localhost:5173'],
    retention: {
      maxFileSize: 4294967296,
      defaultRetentionHours: 24,
      maxRetentionHours: 168,
    },
    rateLimiting: { maxRequests: 100 }
  };

  it('should accept valid config without errors', () => {
    const { errors } = validateTestConfig(validConfig);
    expect(errors).toHaveLength(0);
  });

  it('should reject invalid port', () => {
    const { errors } = validateTestConfig({ ...validConfig, port: 0 });
    expect(errors.some(e => e.includes('PORT'))).toBe(true);
  });

  it('should reject port above 65535', () => {
    const { errors } = validateTestConfig({ ...validConfig, port: 70000 });
    expect(errors.some(e => e.includes('PORT'))).toBe(true);
  });

  it('should reject maxFileSize below 1024', () => {
    const { errors } = validateTestConfig({
      ...validConfig,
      retention: { ...validConfig.retention, maxFileSize: 100 }
    });
    expect(errors.some(e => e.includes('MAX_FILE_SIZE'))).toBe(true);
  });

  it('should warn when maxFileSize exceeds 4GB', () => {
    const { warnings } = validateTestConfig({
      ...validConfig,
      retention: { ...validConfig.retention, maxFileSize: 5000000000 }
    });
    expect(warnings.some(w => w.includes('4GB'))).toBe(true);
  });

  it('should reject defaultRetentionHours exceeding maxRetentionHours', () => {
    const { errors } = validateTestConfig({
      ...validConfig,
      retention: { ...validConfig.retention, defaultRetentionHours: 200, maxRetentionHours: 168 }
    });
    expect(errors.some(e => e.includes('DEFAULT_RETENTION_HOURS'))).toBe(true);
  });

  it('should reject maxRequests below 1', () => {
    const { errors } = validateTestConfig({
      ...validConfig,
      rateLimiting: { maxRequests: 0 }
    });
    expect(errors.some(e => e.includes('RATE_LIMIT_MAX_REQUESTS'))).toBe(true);
  });

  it('should warn about localhost CORS in production', () => {
    const { warnings } = validateTestConfig({
      ...validConfig,
      nodeEnv: 'production',
      corsOrigin: ['http://localhost:5173']
    });
    expect(warnings.some(w => w.includes('localhost'))).toBe(true);
  });

  it('should not warn about localhost CORS in development', () => {
    const { warnings } = validateTestConfig({
      ...validConfig,
      nodeEnv: 'development',
      corsOrigin: ['http://localhost:5173']
    });
    expect(warnings.some(w => w.includes('localhost'))).toBe(false);
  });
});
