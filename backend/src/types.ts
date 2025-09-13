export interface FileMetadata {
  id: string;
  filename: string;
  size: number;
  contentType: string;
  uploadDate: Date;
  expiresAt: Date;
  downloadCount: number;
  maxDownloads?: number;
  // Extended fields for internal use
  encryptedSize?: number;
  storagePath?: string;
  storageProvider?: string;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
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

export const DEFAULT_RECORD_SIZE = 4096;
export const SALT_LENGTH = 16;
export const KEY_LENGTH = 16;
export const KEYID_LENGTH = 1;
export const TAG_LENGTH = 16;