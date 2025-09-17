import { DEFAULT_RECORD_SIZE, SALT_LENGTH, KEY_LENGTH } from '../types';

/**
 * RFC 8188 Client-side encryption using Web Crypto API
 * Compatible with wormhole.app's security model
 */

export class ClientCrypto {
  private static readonly ALGORITHM = 'AES-GCM';
  private static readonly INFO_CONTENT_ENCODING = new TextEncoder().encode('Content-Encoding: aes128gcm\0');
  private static readonly INFO_NONCE = new TextEncoder().encode('nonce\0');

  /**
   * Generate cryptographically secure random bytes
   */
  static generateRandomBytes(length: number): Uint8Array {
    const array = new Uint8Array(length);
    return crypto.getRandomValues(array);
  }

  /**
   * Generate encryption keys
   */
  static async generateKeys(): Promise<{ key: Uint8Array; salt: Uint8Array }> {
    return {
      key: this.generateRandomBytes(KEY_LENGTH),
      salt: this.generateRandomBytes(SALT_LENGTH)
    };
  }

  /**
   * HKDF implementation using Web Crypto API
   */
  private static async hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
    // Import the input key material
    const key = await crypto.subtle.importKey(
      'raw',
      ikm,
      { name: 'HKDF' },
      false,
      ['deriveBits']
    );

    // Derive key bits
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt,
        info
      },
      key,
      length * 8
    );

    return new Uint8Array(derivedBits);
  }

  /**
   * Derive content encryption key
   */
  private static async deriveKey(salt: Uint8Array, key: Uint8Array): Promise<Uint8Array> {
    return this.hkdf(salt, key, this.INFO_CONTENT_ENCODING, KEY_LENGTH);
  }

  /**
   * Derive nonce base
   */
  private static async deriveNonce(salt: Uint8Array, key: Uint8Array): Promise<Uint8Array> {
    return this.hkdf(salt, key, this.INFO_NONCE, 12);
  }

  /**
   * Create nonce for record sequence number
   */
  private static createNonce(base: Uint8Array, seq: number): Uint8Array {
    const nonce = new Uint8Array(base);
    
    // XOR the last 8 bytes with the sequence number (big-endian)
    const seqBytes = new ArrayBuffer(8);
    new DataView(seqBytes).setBigUint64(0, BigInt(seq), false);
    const seqArray = new Uint8Array(seqBytes);
    
    for (let i = 0; i < 8; i++) {
      nonce[nonce.length - 8 + i] ^= seqArray[i];
    }
    
    return nonce;
  }

  /**
   * Encrypt file using RFC 8188
   */
  static async encryptFile(
    file: File, 
    key: Uint8Array, 
    salt: Uint8Array, 
    recordSize: number = DEFAULT_RECORD_SIZE,
    onProgress?: (progress: number) => void
  ): Promise<Uint8Array> {
    const contentKey = await this.deriveKey(salt, key);
    const nonceBase = await this.deriveNonce(salt, key);

    // Create header
    const header = new Uint8Array(SALT_LENGTH + 5 + 0); // 0 keyid length
    header.set(salt, 0);
    
    // Record size as 4-byte big-endian
    const recordSizeView = new DataView(header.buffer, SALT_LENGTH, 4);
    recordSizeView.setUint32(0, recordSize, false);
    
    // KeyId length (0)
    header[SALT_LENGTH + 4] = 0;

    const chunks: Uint8Array[] = [header];
    const fileSize = file.size;
    let seq = 0;
    let offset = 0;

    // Import key for AES-GCM
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      contentKey,
      { name: this.ALGORITHM },
      false,
      ['encrypt']
    );

    while (offset < fileSize) {
      const isLast = offset + recordSize >= fileSize;
      const chunkSize = isLast ? fileSize - offset : recordSize;
      
      // Read chunk from file
      const chunk = new Uint8Array(
        await file.slice(offset, offset + chunkSize).arrayBuffer()
      );
      
      const nonce = this.createNonce(nonceBase, seq);
      
      // Add padding byte for last record (optimized)
      let plaintext: Uint8Array;
      if (isLast) {
        plaintext = new Uint8Array(chunk.length + 1);
        plaintext.set(chunk);
        plaintext[chunk.length] = 2;
      } else {
        plaintext = chunk;
      }
      
      // Encrypt chunk
      const encrypted = await crypto.subtle.encrypt(
        { name: this.ALGORITHM, iv: nonce },
        cryptoKey,
        plaintext
      );
      
      chunks.push(new Uint8Array(encrypted));
      
      offset += chunkSize;
      seq++;
      
      if (onProgress) {
        onProgress((offset / fileSize) * 100);
      }
    }

    // Combine all chunks
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let position = 0;
    
    for (const chunk of chunks) {
      result.set(chunk, position);
      position += chunk.length;
    }

    return result;
  }

  /**
   * Decrypt data using RFC 8188 format
   */
  static async decryptData(
    encryptedData: Uint8Array,
    key: Uint8Array,
    salt: Uint8Array,
    onProgress?: (progress: number) => void
  ): Promise<Uint8Array> {
    // Debug logging can be enabled for troubleshooting
    const debug = true;
    if (debug) {
      console.log('🔓 Starting decryption process');
      console.log(`📊 Encrypted data size: ${encryptedData.length} bytes`);
    }

    // Parse header
    if (encryptedData.length < SALT_LENGTH + 5) {
      throw new Error('Invalid encrypted data: header too short');
    }

    const headerSalt = encryptedData.slice(0, SALT_LENGTH);
    const recordSizeView = new DataView(encryptedData.buffer, SALT_LENGTH, 4);
    const recordSize = recordSizeView.getUint32(0, false);
    const keyIdLength = encryptedData[SALT_LENGTH + 4];

    if (debug) {
      console.log(`📋 Header info: recordSize=${recordSize}, keyIdLength=${keyIdLength}`);
    }

    // SECURITY: Validate that the salt from URL matches the salt in the file header
    if (headerSalt.length !== salt.length) {
      throw new Error('Invalid encryption keys: salt length mismatch');
    }

    for (let i = 0; i < salt.length; i++) {
      if (headerSalt[i] !== salt[i]) {
        throw new Error('Invalid encryption keys: salt mismatch');
      }
    }

    const headerLength = SALT_LENGTH + 5 + keyIdLength;

    if (debug) {
      console.log('🔑 Deriving keys with validated salt...');
    }
    // Use the salt from URL (which we've now validated matches the header)
    const contentKey = await this.deriveKey(salt, key);
    const nonceBase = await this.deriveNonce(salt, key);
    if (debug) {
      console.log('✅ Keys derived successfully');
    }

    // Import key for AES-GCM
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      contentKey,
      { name: this.ALGORITHM },
      false,
      ['decrypt']
    );

    const chunks: Uint8Array[] = [];
    let seq = 0;
    let offset = headerLength;
    let totalChunks = 0;

    if (debug) {
      console.log(`🔄 Starting chunk decryption from offset ${offset}`);
    }

    while (offset < encryptedData.length) {
      const remainingData = encryptedData.length - offset;
      const tagLength = 16; // AES-GCM tag length
      const isLastChunk = remainingData <= recordSize + tagLength + 1; // +1 for potential padding

      // Last chunk might have padding, so it can be up to recordSize + 1 + tagLength
      const maxChunkSize = isLastChunk ? recordSize + tagLength + 1 : recordSize + tagLength;
      const expectedChunkSize = Math.min(maxChunkSize, remainingData);

      if (expectedChunkSize <= tagLength) {
        throw new Error('Invalid encrypted data: chunk too small');
      }

      if (debug) {
        console.log(`🧩 Processing chunk ${seq}: offset=${offset}, size=${expectedChunkSize}`);
      }

      const encryptedChunk = encryptedData.slice(offset, offset + expectedChunkSize);
      const nonce = this.createNonce(nonceBase, seq);

      let decryptedArray: Uint8Array;
      try {
        // Decrypt chunk
        const decrypted = await crypto.subtle.decrypt(
          { name: this.ALGORITHM, iv: nonce },
          cryptoKey,
          encryptedChunk
        );

        decryptedArray = new Uint8Array(decrypted);
        if (debug) {
          console.log(`✅ Chunk ${seq} decrypted successfully: ${decryptedArray.length} bytes`);
        }
      } catch (decryptError) {
        console.error(`❌ Failed to decrypt chunk ${seq}:`, decryptError);
        throw new Error(`Decryption failed at chunk ${seq}: ${decryptError.message}`);
      }
      
      // Remove padding from last record
      const isLast = offset + expectedChunkSize >= encryptedData.length;
      if (isLast && decryptedArray.length > 0) {
        const lastByte = decryptedArray[decryptedArray.length - 1];
        if (lastByte === 2) {
          chunks.push(decryptedArray.slice(0, -1));
        } else {
          chunks.push(decryptedArray);
        }
      } else {
        chunks.push(decryptedArray);
      }
      
      offset += expectedChunkSize;
      seq++;
      
      if (onProgress) {
        onProgress((offset / encryptedData.length) * 100);
      }
    }

    // Combine all chunks
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    if (debug) {
      console.log(`🔗 Combining ${chunks.length} chunks into ${totalLength} bytes`);
    }

    const result = new Uint8Array(totalLength);
    let position = 0;

    for (const chunk of chunks) {
      result.set(chunk, position);
      position += chunk.length;
    }

    if (debug) {
      console.log('🎉 Decryption completed successfully');
    }
    return result;
  }

  /**
   * Generate shareable URL with embedded key and filename
   */
  static generateShareUrl(fileId: string, key: Uint8Array, salt: Uint8Array, baseUrl: string, filename?: string): string {
    const keyHex = Array.from(key).map(b => b.toString(16).padStart(2, '0')).join('');
    const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');

    // Keys and filename are embedded in URL fragment (not sent to server)
    let fragment = `key=${keyHex}&salt=${saltHex}`;
    if (filename) {
      // URL encode the filename to handle special characters
      fragment += `&filename=${encodeURIComponent(filename)}`;
    }

    return `${baseUrl}/download/${fileId}#${fragment}`;
  }

  /**
   * Extract keys from URL fragment
   */
  static extractKeysFromUrl(): { key: Uint8Array; salt: Uint8Array } | null {
    const fragment = window.location.hash.substring(1);
    const params = new URLSearchParams(fragment);
    
    const keyHex = params.get('key');
    const saltHex = params.get('salt');
    
    if (!keyHex || !saltHex) return null;
    
    try {
      const key = new Uint8Array(keyHex.match(/.{2}/g)!.map(byte => parseInt(byte, 16)));
      const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(byte => parseInt(byte, 16)));
      
      return { key, salt };
    } catch {
      return null;
    }
  }
}