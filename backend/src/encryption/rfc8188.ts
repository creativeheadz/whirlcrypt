import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { ECEHeader, DEFAULT_RECORD_SIZE, SALT_LENGTH, KEY_LENGTH, KEYID_LENGTH, TAG_LENGTH } from '../types';

/**
 * RFC 8188 - Encrypted Content-Encoding for HTTP
 * Implementation of AES128GCM encryption for streaming content
 */

export class RFC8188Crypto {
  private static readonly ALGORITHM = 'aes-128-gcm';
  private static readonly INFO_CONTENT_ENCODING = Buffer.from('Content-Encoding: aes128gcm\0');
  private static readonly INFO_NONCE = Buffer.from('nonce\0');

  /**
   * Generate encryption key and salt
   */
  static generateKeys(): { key: Buffer; salt: Buffer } {
    return {
      key: randomBytes(KEY_LENGTH),
      salt: randomBytes(SALT_LENGTH)
    };
  }

  /**
   * HKDF key derivation as specified in RFC 5869
   */
  private static hkdf(salt: Buffer, ikm: Buffer, info: Buffer, length: number): Buffer {
    const { createHmac } = require('crypto');
    
    // Step 1: Extract
    const prk = createHmac('sha256', salt)
      .update(ikm)
      .digest();

    // Step 2: Expand
    const n = Math.ceil(length / 32);
    let t = Buffer.alloc(0);
    const chunks: Buffer[] = [];
    
    for (let i = 1; i <= n; i++) {
      const hmac = createHmac('sha256', prk);
      if (i > 1) {
        hmac.update(t);
      }
      hmac.update(info);
      hmac.update(Buffer.from([i]));
      
      t = hmac.digest();
      chunks.push(t);
    }

    return Buffer.concat(chunks).subarray(0, length);
  }

  /**
   * Derive content encryption key
   */
  private static deriveKey(salt: Buffer, key: Buffer): Buffer {
    return this.hkdf(salt, key, this.INFO_CONTENT_ENCODING, KEY_LENGTH);
  }

  /**
   * Derive nonce base
   */
  private static deriveNonce(salt: Buffer, key: Buffer): Buffer {
    return this.hkdf(salt, key, this.INFO_NONCE, 12);
  }

  /**
   * Create nonce for record sequence number
   */
  private static createNonce(base: Buffer, seq: number): Buffer {
    const nonce = Buffer.from(base);
    // XOR the last 8 bytes with the sequence number (big-endian)
    const seqBuffer = Buffer.alloc(8);
    seqBuffer.writeBigUInt64BE(BigInt(seq), 0);
    
    for (let i = 0; i < 8; i++) {
      nonce[nonce.length - 8 + i] ^= seqBuffer[i];
    }
    
    return nonce;
  }

  /**
   * Encrypt data using RFC 8188 format
   */
  static encrypt(data: Buffer, key: Buffer, salt: Buffer, recordSize: number = DEFAULT_RECORD_SIZE): Buffer {
    const contentKey = this.deriveKey(salt, key);
    const nonceBase = this.deriveNonce(salt, key);
    
    // Create header
    const recordSizeBuffer = Buffer.alloc(4);
    recordSizeBuffer.writeUInt32BE(recordSize, 0);
    
    const header = Buffer.concat([
      salt,
      recordSizeBuffer, // record size as 4-byte big-endian
      Buffer.from([0]) // keyid length (0)
    ]);

    const chunks: Buffer[] = [header];
    let seq = 0;
    let offset = 0;

    while (offset < data.length) {
      const isLast = offset + recordSize >= data.length;
      const chunkSize = isLast ? data.length - offset : recordSize;
      const chunk = data.subarray(offset, offset + chunkSize);
      
      const nonce = this.createNonce(nonceBase, seq);
      const cipher = createCipheriv(this.ALGORITHM, contentKey, nonce);
      
      // Add padding byte for last record
      const plaintext = isLast ? Buffer.concat([chunk, Buffer.from([2])]) : chunk;
      
      const encrypted = cipher.update(plaintext);
      cipher.final();
      const tag = cipher.getAuthTag();
      
      chunks.push(Buffer.concat([encrypted, tag]));
      
      offset += chunkSize;
      seq++;
    }

    return Buffer.concat(chunks);
  }

  /**
   * Decrypt data using RFC 8188 format
   */
  static decrypt(encryptedData: Buffer, key: Buffer): Buffer {
    // Parse header
    if (encryptedData.length < SALT_LENGTH + 5) {
      throw new Error('Invalid encrypted data: header too short');
    }

    const salt = encryptedData.subarray(0, SALT_LENGTH);
    const keyIdLength = encryptedData.readUInt8(SALT_LENGTH + 4);
    const recordSize = encryptedData.readUInt32BE(SALT_LENGTH);
    const headerLength = SALT_LENGTH + 5 + keyIdLength;
    
    const contentKey = this.deriveKey(salt, key);
    const nonceBase = this.deriveNonce(salt, key);
    
    const chunks: Buffer[] = [];
    let seq = 0;
    let offset = headerLength;

    while (offset < encryptedData.length) {
      const remainingData = encryptedData.length - offset;
      const expectedChunkSize = Math.min(recordSize + TAG_LENGTH, remainingData);
      
      if (expectedChunkSize <= TAG_LENGTH) {
        throw new Error('Invalid encrypted data: chunk too small');
      }

      const encryptedChunk = encryptedData.subarray(offset, offset + expectedChunkSize - TAG_LENGTH);
      const tag = encryptedData.subarray(offset + expectedChunkSize - TAG_LENGTH, offset + expectedChunkSize);
      
      const nonce = this.createNonce(nonceBase, seq);
      const decipher = createDecipheriv(this.ALGORITHM, contentKey, nonce);
      decipher.setAuthTag(tag);
      
      const decrypted = Buffer.concat([
        decipher.update(encryptedChunk),
        decipher.final()
      ]);
      
      // Remove padding from last record
      const isLast = offset + expectedChunkSize >= encryptedData.length;
      if (isLast && decrypted.length > 0) {
        // Remove last byte if it's padding (value 2)
        const lastByte = decrypted[decrypted.length - 1];
        if (lastByte === 2) {
          chunks.push(decrypted.subarray(0, -1));
        } else {
          chunks.push(decrypted);
        }
      } else {
        chunks.push(decrypted);
      }
      
      offset += expectedChunkSize;
      seq++;
    }

    return Buffer.concat(chunks);
  }

  /**
   * Parse ECE header from encrypted data
   */
  static parseHeader(encryptedData: Buffer): ECEHeader {
    if (encryptedData.length < SALT_LENGTH + 5) {
      throw new Error('Invalid encrypted data: header too short');
    }

    const salt = encryptedData.subarray(0, SALT_LENGTH);
    const recordSize = encryptedData.readUInt32BE(SALT_LENGTH);
    const keyIdLength = encryptedData.readUInt8(SALT_LENGTH + 4);
    const keyId = encryptedData.subarray(SALT_LENGTH + 5, SALT_LENGTH + 5 + keyIdLength);

    return { salt, recordSize, keyId };
  }
}