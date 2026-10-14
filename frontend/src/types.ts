export interface FileMetadata {
  id: string;
  filename: string;
  size: number;
  contentType: string;
  uploadDate: Date;
  expiresAt: Date;
  downloadCount: number;
  maxDownloads?: number;
}

export interface UploadResponse {
  id: string;
  downloadUrl: string;
  expiresAt: string;
}

export interface DownloadResponse {
  filename: string;
  contentType: string;
  size: number;
  stream: ReadableStream;
}

export interface RetentionConfig {
  defaultRetentionHours: number;
  maxRetentionHours: number;
  cleanupIntervalMinutes: number;
  maxFileSize: number;
  allowedExtensions?: string[];
}

export interface EncryptionKeys {
  encryptionKey: Uint8Array;
  salt: Uint8Array;
  recordSize: number;
}

export interface ECEHeader {
  salt: Uint8Array;
  recordSize: number;
  keyId: Uint8Array;
}

// RFC 8188 record size. This is the size of an *encrypted* record on the wire,
// including the 16-byte AES-GCM authentication tag (RFC 8188 §2.1).
export const DEFAULT_RECORD_SIZE = 65536;
/**
 * Largest record size the decryptor accepts. Our writer always emits
 * DEFAULT_RECORD_SIZE; anything above this bound from a foreign sender is
 * rejected so a corrupt or hostile header cannot force unbounded buffering.
 */
export const MAX_RECORD_SIZE = 1048576;
export const SALT_LENGTH = 16;
export const KEY_LENGTH = 16;
export const KEYID_LENGTH = 1;
export const TAG_LENGTH = 16;