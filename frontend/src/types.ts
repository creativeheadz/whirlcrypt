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

// RFC 8188 compliant constants
export const DEFAULT_RECORD_SIZE = 4096; // 4KB - RFC 8188 default
export const SALT_LENGTH = 16;
export const KEY_LENGTH = 16;
export const KEYID_LENGTH = 1;
export const TAG_LENGTH = 16;

// Performance tuning: Larger record size for better performance (still within RFC 8188 limits)
// RFC 8188 allows up to (2^32 - 1) bytes, but we use 256KB for optimal browser performance
export const OPTIMIZED_RECORD_SIZE = 262144; // 256KB - good balance between memory and performance