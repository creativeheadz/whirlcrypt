import { promises as fs } from 'fs';
import { join, resolve, sep } from 'path';
import { randomUUID } from 'crypto';
import { FileMetadata } from '../types';
import { config } from '../config/config';

export class FileManager {
  private static readonly METADATA_EXT = '.meta';

  constructor(private uploadDir: string = config.storage.local?.path || './uploads') {
    this.ensureUploadDir();
  }

  /**
   * Resolve a stored-file path from an untrusted id. Only bare filename
   * tokens are accepted (stored ids are uuids), and the resolved path must
   * stay inside the upload dir even if validation is ever bypassed.
   * Returns null for invalid ids; callers treat that as "not found".
   */
  private resolvePath(fileId: string, suffix = ''): string | null {
    if (typeof fileId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(fileId)) {
      return null;
    }
    const base = resolve(this.uploadDir);
    const full = resolve(base, fileId + suffix);
    if (!full.startsWith(base + sep)) {
      return null;
    }
    return full;
  }

  private async ensureUploadDir(): Promise<void> {
    try {
      await fs.access(this.uploadDir);
    } catch {
      await fs.mkdir(this.uploadDir, { recursive: true });
    }
  }

  /**
   * Store encrypted file and metadata
   */
  async storeFile(
    encryptedData: Buffer,
    originalFilename: string,
    contentType: string,
    retentionHours?: number,
    allowedIps?: string[]
  ): Promise<FileMetadata> {
    const fileId = randomUUID();
    const uploadDate = new Date();
    const expiresAt = new Date(
      uploadDate.getTime() +
      (retentionHours || config.retention.defaultRetentionHours) * 60 * 60 * 1000
    );

    const metadata: FileMetadata = {
      id: fileId,
      filename: originalFilename,
      size: encryptedData.length,
      contentType,
      uploadDate,
      expiresAt,
      downloadCount: 0,
      ...(allowedIps && allowedIps.length > 0 ? { allowedIps } : {})
    };

    // Store encrypted file data
    const filePath = join(this.uploadDir, fileId);
    await fs.writeFile(filePath, encryptedData);

    // Store metadata
    const metadataPath = join(this.uploadDir, fileId + FileManager.METADATA_EXT);
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    return metadata;
  }

  /**
   * Store an encrypted file from an existing path (e.g. multer's diskStorage
   * temp file). Avoids buffering the upload in RAM. Source file is consumed
   * on success via rename (with cross-fs copy+unlink fallback).
   * Extra V2-only parameters (maxDownloads/uploaderIP/userAgent) are accepted
   * for signature compatibility but not stored by this legacy provider.
   * allowedIps IS stored: the download route enforces it on both providers.
   */
  async storeFileFromPath(
    sourcePath: string,
    fileSize: number,
    originalFilename: string,
    contentType: string,
    retentionHours?: number,
    _maxDownloads?: number,
    _uploaderIP?: string,
    _userAgent?: string,
    allowedIps?: string[]
  ): Promise<FileMetadata> {
    const fileId = randomUUID();
    const uploadDate = new Date();
    const expiresAt = new Date(
      uploadDate.getTime() +
      (retentionHours || config.retention.defaultRetentionHours) * 60 * 60 * 1000
    );

    const metadata: FileMetadata = {
      id: fileId,
      filename: originalFilename,
      size: fileSize,
      contentType,
      uploadDate,
      expiresAt,
      downloadCount: 0,
      ...(allowedIps && allowedIps.length > 0 ? { allowedIps } : {})
    };

    const filePath = join(this.uploadDir, fileId);
    try {
      await fs.rename(sourcePath, filePath);
    } catch (err: any) {
      if (err?.code === 'EXDEV') {
        await fs.copyFile(sourcePath, filePath);
        await fs.unlink(sourcePath);
      } else {
        throw err;
      }
    }

    const metadataPath = join(this.uploadDir, fileId + FileManager.METADATA_EXT);
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    return metadata;
  }

  /**
   * Retrieve file metadata
   */
  async getMetadata(fileId: string): Promise<FileMetadata | null> {
    const metadataPath = this.resolvePath(fileId, FileManager.METADATA_EXT);
    if (!metadataPath) return null;
    try {
      const metadataJson = await fs.readFile(metadataPath, 'utf-8');
      const metadata = JSON.parse(metadataJson) as FileMetadata;
      
      // Convert string dates back to Date objects
      metadata.uploadDate = new Date(metadata.uploadDate);
      metadata.expiresAt = new Date(metadata.expiresAt);
      
      return metadata;
    } catch {
      return null;
    }
  }

  /**
   * Retrieve encrypted file data
   */
  async getFileData(fileId: string): Promise<Buffer | null> {
    const filePath = this.resolvePath(fileId);
    if (!filePath) return null;
    try {
      return await fs.readFile(filePath);
    } catch {
      return null;
    }
  }

  /**
   * Check if file exists and is not expired
   */
  async isFileAvailable(fileId: string): Promise<boolean> {
    const metadata = await this.getMetadata(fileId);
    if (!metadata) return false;
    
    const now = new Date();
    return now < metadata.expiresAt;
  }

  /**
   * Increment download counter
   */
  async incrementDownloadCount(fileId: string): Promise<void> {
    const metadata = await this.getMetadata(fileId);
    if (!metadata) return;

    metadata.downloadCount++;

    const metadataPath = this.resolvePath(fileId, FileManager.METADATA_EXT);
    if (!metadataPath) return;
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  }

  /**
   * Delete file and metadata
   */
  async deleteFile(fileId: string): Promise<void> {
    const filePath = this.resolvePath(fileId);
    const metadataPath = this.resolvePath(fileId, FileManager.METADATA_EXT);
    if (!filePath || !metadataPath) return;
    try {
      await Promise.allSettled([
        fs.unlink(filePath),
        fs.unlink(metadataPath)
      ]);
    } catch {
      // Ignore errors - file might already be deleted
    }
  }

  /**
   * Clean up expired files
   */
  async cleanupExpiredFiles(): Promise<number> {
    try {
      const files = await fs.readdir(this.uploadDir);
      const metadataFiles = files.filter(f => f.endsWith(FileManager.METADATA_EXT));
      
      let cleanedCount = 0;
      const now = new Date();

      for (const metadataFile of metadataFiles) {
        try {
          const metadataPath = join(this.uploadDir, metadataFile);
          const metadataJson = await fs.readFile(metadataPath, 'utf-8');
          const metadata = JSON.parse(metadataJson) as FileMetadata;
          
          const expiresAt = new Date(metadata.expiresAt);
          
          if (now > expiresAt) {
            await this.deleteFile(metadata.id);
            cleanedCount++;
          }
        } catch {
          // Skip invalid metadata files
        }
      }

      return cleanedCount;
    } catch {
      return 0;
    }
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<{ 
    totalFiles: number; 
    totalSize: number; 
    expiredFiles: number; 
  }> {
    try {
      const files = await fs.readdir(this.uploadDir);
      const metadataFiles = files.filter(f => f.endsWith(FileManager.METADATA_EXT));
      
      let totalSize = 0;
      let expiredFiles = 0;
      const now = new Date();

      for (const metadataFile of metadataFiles) {
        try {
          const metadataPath = join(this.uploadDir, metadataFile);
          const metadataJson = await fs.readFile(metadataPath, 'utf-8');
          const metadata = JSON.parse(metadataJson) as FileMetadata;
          
          totalSize += metadata.size;
          
          const expiresAt = new Date(metadata.expiresAt);
          if (now > expiresAt) {
            expiredFiles++;
          }
        } catch {
          // Skip invalid metadata files
        }
      }

      return {
        totalFiles: metadataFiles.length,
        totalSize,
        expiredFiles
      };
    } catch {
      return { totalFiles: 0, totalSize: 0, expiredFiles: 0 };
    }
  }
}