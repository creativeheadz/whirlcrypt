import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { validateProductionSecrets } from '../src/config/config';
import { MetadataEncryption } from '../src/services/MetadataEncryption';

const STRONG = {
  JWT_SECRET: 'x'.repeat(48),
  METADATA_ENCRYPTION_KEY: 'y'.repeat(44),
  DB_PASSWORD: 'z'.repeat(20),
};

describe('validateProductionSecrets', () => {
  it('accepts strong secrets in production', () => {
    assert.deepEqual(validateProductionSecrets({ ...STRONG }, 'production'), []);
  });

  it('rejects missing secrets in production', () => {
    const errors = validateProductionSecrets({}, 'production');
    assert.equal(errors.length, 3);
  });

  it('rejects documented dev-only values in production', () => {
    const errors = validateProductionSecrets(
      {
        JWT_SECRET: 'whirlcrypt-jwt-secret-change-in-production',
        METADATA_ENCRYPTION_KEY: 'whirlcrypt-metadata-master-key-change-in-production-32-bytes!!',
        DB_PASSWORD: 'whirlcrypt_dev_only',
      },
      'production'
    );
    assert.equal(errors.length, 3);
  });

  it('rejects the code default DB password in production', () => {
    const errors = validateProductionSecrets({ ...STRONG, DB_PASSWORD: 'whirlcrypt_password' }, 'production');
    assert.equal(errors.length, 1);
    assert.match(errors[0], /DB_PASSWORD/);
  });

  it('rejects short secrets in production', () => {
    const errors = validateProductionSecrets(
      { JWT_SECRET: 'short', METADATA_ENCRYPTION_KEY: 'short', DB_PASSWORD: 'short' },
      'production'
    );
    assert.equal(errors.length, 3);
  });

  it('never blocks development, even with no secrets set', () => {
    assert.deepEqual(validateProductionSecrets({}, 'development'), []);
    assert.deepEqual(validateProductionSecrets({}, ''), []);
    assert.deepEqual(validateProductionSecrets({}, 'test'), []);
  });
});

describe('MetadataEncryption master key', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.METADATA_ENCRYPTION_KEY;
    (MetadataEncryption as any).warnedAboutDefaultKey = false;
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  function sampleMetadata() {
    return {
      originalFilename: 'a.bin',
      contentType: 'application/octet-stream',
      uploadTimestamp: new Date('2026-01-01T00:00:00Z'),
      fileSize: 4,
      retentionHours: 24,
    };
  }

  it('throws in production when no key is configured', () => {
    process.env.NODE_ENV = 'production';
    assert.throws(() => MetadataEncryption.encryptMetadata(sampleMetadata()), /METADATA_ENCRYPTION_KEY must be set in production/);
  });

  it('falls back to the dev default with a warning outside production', () => {
    process.env.NODE_ENV = 'development';
    const warnings: unknown[][] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args);
    };
    try {
      const encrypted = MetadataEncryption.encryptMetadata(sampleMetadata());
      assert.ok(encrypted.encryptedData.length > 0);
      assert.ok(warnings.some((w) => String(w[0]).includes('development default')));
    } finally {
      console.warn = originalWarn;
    }
  });

  it('uses the configured key without warning', () => {
    process.env.NODE_ENV = 'development';
    process.env.METADATA_ENCRYPTION_KEY = 'test-key-from-env';
    let warned = false;
    const originalWarn = console.warn;
    console.warn = () => {
      warned = true;
    };
    try {
      const encrypted = MetadataEncryption.encryptMetadata(sampleMetadata());
      assert.ok(encrypted.encryptedData.length > 0);
      assert.equal(warned, false);
    } finally {
      console.warn = originalWarn;
    }
  });
});
