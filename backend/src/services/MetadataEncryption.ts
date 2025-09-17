import { randomBytes, createCipheriv, createDecipheriv, createHmac } from 'crypto';

/**
 * Metadata Encryption Service - Wormhole-inspired approach
 * Encrypts sensitive file metadata using AES-GCM with derived keys
 */

export interface EncryptedMetadata {
  encryptedData: Buffer;
  iv: Buffer;
  tag: Buffer;
  keyDerivationSalt: Buffer;
}

export interface FileMetadataToEncrypt {
  originalFilename: string;
  contentType: string;
  uploadTimestamp: Date;
  uploaderIP?: string;
  userAgent?: string;
  fileSize: number;
  retentionHours: number;
}

export class MetadataEncryption {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly KEY_LENGTH = 32; // 256 bits
  private static readonly IV_LENGTH = 16;  // 128 bits
  private static readonly SALT_LENGTH = 32; // 256 bits
  private static readonly TAG_LENGTH = 16; // 128 bits
  
  // Master key for metadata encryption (should be from environment)
  private static readonly MASTER_KEY = process.env.METADATA_ENCRYPTION_KEY || 
    'whirlcrypt-metadata-master-key-change-in-production-32-bytes!!';

  /**
   * Derive encryption key from master key using HKDF-like approach
   */
  private static deriveKey(salt: Buffer, info: string = 'metadata-encryption'): Buffer {
    const hmac = createHmac('sha256', this.MASTER_KEY);
    hmac.update(salt);
    hmac.update(info);
    return hmac.digest().subarray(0, this.KEY_LENGTH);
  }

  /**
   * Encrypt file metadata using AES-GCM
   */
  static encryptMetadata(metadata: FileMetadataToEncrypt): EncryptedMetadata {
    try {
      // Generate random salt and IV
      const keyDerivationSalt = randomBytes(this.SALT_LENGTH);
      const iv = randomBytes(this.IV_LENGTH);
      
      // Derive encryption key
      const key = this.deriveKey(keyDerivationSalt);
      
      // Prepare metadata for encryption
      const metadataJson = JSON.stringify({
        originalFilename: metadata.originalFilename,
        contentType: metadata.contentType,
        uploadTimestamp: metadata.uploadTimestamp.toISOString(),
        uploaderIP: metadata.uploaderIP ? this.hashIP(metadata.uploaderIP) : null,
        userAgent: metadata.userAgent ? this.hashUserAgent(metadata.userAgent) : null,
        fileSize: metadata.fileSize,
        retentionHours: metadata.retentionHours,
        encryptedAt: new Date().toISOString()
      });
      
      const plaintext = Buffer.from(metadataJson, 'utf8');
      
      // Create cipher
      const cipher = createCipheriv(this.ALGORITHM, key, iv);
      
      // Encrypt data
      const encryptedData = Buffer.concat([
        cipher.update(plaintext),
        cipher.final()
      ]);
      
      // Get authentication tag
      const tag = cipher.getAuthTag();
      
      return {
        encryptedData,
        iv,
        tag,
        keyDerivationSalt
      };
      
    } catch (error) {
      console.error('Metadata encryption failed:', error);
      throw new Error('Failed to encrypt metadata');
    }
  }

  /**
   * Decrypt file metadata
   */
  static decryptMetadata(encrypted: EncryptedMetadata): FileMetadataToEncrypt {
    try {
      // Derive decryption key
      const key = this.deriveKey(encrypted.keyDerivationSalt);
      
      // Create decipher
      const decipher = createDecipheriv(this.ALGORITHM, key, encrypted.iv);
      decipher.setAuthTag(encrypted.tag);
      
      // Decrypt data
      const decrypted = Buffer.concat([
        decipher.update(encrypted.encryptedData),
        decipher.final()
      ]);
      
      // Parse JSON
      const metadataJson = JSON.parse(decrypted.toString('utf8'));
      
      return {
        originalFilename: metadataJson.originalFilename,
        contentType: metadataJson.contentType,
        uploadTimestamp: new Date(metadataJson.uploadTimestamp),
        uploaderIP: metadataJson.uploaderIP, // Already hashed
        userAgent: metadataJson.userAgent,   // Already hashed
        fileSize: metadataJson.fileSize,
        retentionHours: metadataJson.retentionHours
      };
      
    } catch (error) {
      console.error('Metadata decryption failed:', error);
      throw new Error('Failed to decrypt metadata');
    }
  }

  /**
   * Serialize encrypted metadata for database storage
   */
  static serializeEncryptedMetadata(encrypted: EncryptedMetadata): string {
    const combined = Buffer.concat([
      encrypted.keyDerivationSalt,
      encrypted.iv,
      encrypted.tag,
      encrypted.encryptedData
    ]);
    
    return combined.toString('base64');
  }

  /**
   * Deserialize encrypted metadata from database
   */
  static deserializeEncryptedMetadata(serialized: string): EncryptedMetadata {
    const combined = Buffer.from(serialized, 'base64');
    
    let offset = 0;
    const keyDerivationSalt = combined.subarray(offset, offset + this.SALT_LENGTH);
    offset += this.SALT_LENGTH;
    
    const iv = combined.subarray(offset, offset + this.IV_LENGTH);
    offset += this.IV_LENGTH;
    
    const tag = combined.subarray(offset, offset + this.TAG_LENGTH);
    offset += this.TAG_LENGTH;
    
    const encryptedData = combined.subarray(offset);
    
    return {
      encryptedData,
      iv,
      tag,
      keyDerivationSalt
    };
  }

  /**
   * Hash IP address for privacy (one-way hash)
   */
  private static hashIP(ip: string): string {
    const hash = createHmac('sha256', 'ip-salt-' + this.MASTER_KEY);
    hash.update(ip);
    return hash.digest('hex').substring(0, 16); // First 16 chars for storage efficiency
  }

  /**
   * Hash User Agent for privacy (one-way hash)
   */
  private static hashUserAgent(userAgent: string): string {
    const hash = createHmac('sha256', 'ua-salt-' + this.MASTER_KEY);
    hash.update(userAgent);
    return hash.digest('hex').substring(0, 32); // First 32 chars
  }

  /**
   * Generate metadata encryption key for environment setup
   */
  static generateMasterKey(): string {
    return randomBytes(32).toString('base64');
  }

  /**
   * Validate metadata encryption configuration
   */
  static validateConfiguration(): boolean {
    try {
      // Test encryption/decryption cycle
      const testMetadata: FileMetadataToEncrypt = {
        originalFilename: 'test.txt',
        contentType: 'text/plain',
        uploadTimestamp: new Date(),
        uploaderIP: '127.0.0.1',
        userAgent: 'test-agent',
        fileSize: 1024,
        retentionHours: 24
      };
      
      const encrypted = this.encryptMetadata(testMetadata);
      const serialized = this.serializeEncryptedMetadata(encrypted);
      const deserialized = this.deserializeEncryptedMetadata(serialized);
      const decrypted = this.decryptMetadata(deserialized);
      
      return decrypted.originalFilename === testMetadata.originalFilename &&
             decrypted.contentType === testMetadata.contentType &&
             decrypted.fileSize === testMetadata.fileSize;
             
    } catch (error) {
      console.error('Metadata encryption validation failed:', error);
      return false;
    }
  }
}
