import { StorageManager } from './StorageManager';
import { FileRepository, CreateFileData, UpdateFileData, DownloadLogData } from '../database/models/File';
import { FileMetadata } from '../types';
import { config } from '../config/config';
import { v4 as uuidv4 } from 'uuid';
import { createReadStream, ReadStream, statSync } from 'fs';
import { stat } from 'fs/promises';
import { join } from 'path';
import { MetadataEncryption, FileMetadataToEncrypt } from '../services/MetadataEncryption';
import logger from '../utils/logger';

export class FileManagerV2 {
  private storageManager: StorageManager;
  private fileRepository: FileRepository;

  constructor() {
    this.storageManager = new StorageManager();
    this.fileRepository = new FileRepository();
  }

  async initialize(): Promise<void> {
    await this.storageManager.initialize();
    logger.info('FileManagerV2 initialized');
  }

  /**
   * Store an encrypted file and its metadata with enhanced security
   */
  async storeFile(
    encryptedData: Buffer,
    filename: string,
    contentType: string,
    retentionHours: number = config.retention.defaultRetentionHours,
    maxDownloads?: number,
    uploaderIP?: string,
    userAgent?: string
  ): Promise<FileMetadata> {
    const fileId = uuidv4();
    const expiresAt = new Date(Date.now() + (retentionHours * 60 * 60 * 1000));

    // Store the encrypted file data
    const storagePath = await this.storageManager.store(
      encryptedData,
      filename,
      {
        fileId,
        contentType,
        originalFilename: filename,
        uploadDate: new Date(),
        expiresAt
      }
    );

    // Encrypt sensitive metadata following Wormhole's approach
    const metadataToEncrypt: FileMetadataToEncrypt = {
      originalFilename: filename,
      contentType,
      uploadTimestamp: new Date(),
      uploaderIP,
      userAgent,
      fileSize: encryptedData.length,
      retentionHours
    };

    const encryptedMetadata = MetadataEncryption.encryptMetadata(metadataToEncrypt);
    const serializedMetadata = MetadataEncryption.serializeEncryptedMetadata(encryptedMetadata);

    // Create database record with encrypted metadata
    // If DB insert fails, clean up the stored file to prevent orphans
    const createData: CreateFileData = {
      filename: `encrypted_${fileId}`,
      originalSize: encryptedData.length,
      encryptedSize: encryptedData.length,
      contentType: 'application/octet-stream',
      storagePath,
      storageProvider: config.storage.provider,
      expiresAt,
      maxDownloads,
      encryptedMetadata: serializedMetadata
    };

    let fileMetadata: FileMetadata;
    try {
      fileMetadata = await this.fileRepository.create(createData);
    } catch (dbError) {
      // DB insert failed — clean up the stored file to prevent orphans
      logger.error({ err: dbError }, `DB insert failed for ${fileId}, cleaning up stored file`);
      try {
        await this.storageManager.delete(storagePath);
      } catch (cleanupError) {
        logger.error({ err: cleanupError }, `Failed to clean up orphaned file at ${storagePath}`);
      }
      throw dbError;
    }

    logger.info(`File stored: ${fileId} (encrypted metadata) - expires ${expiresAt.toISOString()}`);
    return fileMetadata;
  }

  /**
   * Store a file from a path on disk (avoids loading into memory).
   * Used for chunked uploads where the assembled file is already on disk.
   */
  async storeFileFromPath(
    filePath: string,
    filename: string,
    contentType: string,
    retentionHours: number = config.retention.defaultRetentionHours,
    maxDownloads?: number,
    uploaderIP?: string,
    userAgent?: string
  ): Promise<FileMetadata> {
    const fileId = uuidv4();
    const expiresAt = new Date(Date.now() + (retentionHours * 60 * 60 * 1000));
    const fileStat = await stat(filePath);
    const fileSize = fileStat.size;

    const storagePath = await this.storageManager.storeFromPath(
      filePath,
      filename,
      {
        fileId,
        contentType,
        originalFilename: filename,
        uploadDate: new Date(),
        expiresAt
      }
    );

    const metadataToEncrypt: FileMetadataToEncrypt = {
      originalFilename: filename,
      contentType,
      uploadTimestamp: new Date(),
      uploaderIP,
      userAgent,
      fileSize,
      retentionHours
    };

    const encryptedMetadata = MetadataEncryption.encryptMetadata(metadataToEncrypt);
    const serializedMetadata = MetadataEncryption.serializeEncryptedMetadata(encryptedMetadata);

    const createData: CreateFileData = {
      filename: `encrypted_${fileId}`,
      originalSize: fileSize,
      encryptedSize: fileSize,
      contentType: 'application/octet-stream',
      storagePath,
      storageProvider: config.storage.provider,
      expiresAt,
      maxDownloads,
      encryptedMetadata: serializedMetadata
    };

    let fileMetadata: FileMetadata;
    try {
      fileMetadata = await this.fileRepository.create(createData);
    } catch (dbError) {
      logger.error({ err: dbError }, `DB insert failed for ${fileId}, cleaning up stored file`);
      try {
        await this.storageManager.delete(storagePath);
      } catch (cleanupError) {
        logger.error({ err: cleanupError }, `Failed to clean up orphaned file at ${storagePath}`);
      }
      throw dbError;
    }

    logger.info(`File stored from path: ${fileId} (encrypted metadata) - expires ${expiresAt.toISOString()}`);
    return fileMetadata;
  }

  /**
   * Get file metadata by ID
   */
  async getMetadata(fileId: string): Promise<FileMetadata | null> {
    return this.fileRepository.findById(fileId);
  }

  /**
   * Get decrypted file metadata by ID
   */
  async getDecryptedMetadata(fileId: string): Promise<(FileMetadata & { decryptedMetadata?: FileMetadataToEncrypt }) | null> {
    const fileMetadata = await this.fileRepository.findById(fileId);

    if (!fileMetadata) {
      return null;
    }

    // If encrypted metadata exists, decrypt it
    let decryptedMetadata: FileMetadataToEncrypt | undefined;
    if (fileMetadata.encryptedMetadata) {
      try {
        const deserializedMetadata = MetadataEncryption.deserializeEncryptedMetadata(fileMetadata.encryptedMetadata);
        decryptedMetadata = MetadataEncryption.decryptMetadata(deserializedMetadata);
      } catch (error) {
        logger.error({ err: error, fileId }, 'Failed to decrypt metadata for file');
        // Continue without decrypted metadata rather than failing completely
      }
    }

    return {
      ...fileMetadata,
      decryptedMetadata
    };
  }

  /**
   * Get file data by ID
   */
  async getFileData(fileId: string): Promise<Buffer | null> {
    const metadata = await this.fileRepository.findActiveById(fileId);
    if (!metadata || !metadata.storagePath) {
      return null;
    }

    try {
      const data = await this.storageManager.retrieve(metadata.storagePath);
      return data;
    } catch (error: any) {
      logger.error({ err: error }, `Error retrieving file data for ${fileId}`);
      return null;
    }
  }

  /**
   * Get file stream by ID for efficient large file downloads
   */
  async getFileStream(fileId: string): Promise<ReadStream | null> {
    const metadata = await this.fileRepository.findActiveById(fileId);
    if (!metadata || !metadata.storagePath) {
      return null;
    }

    try {
      // For local storage, create a read stream directly
      if (config.storage.provider === 'local' && config.storage.local) {
        const fullPath = join(config.storage.local.path, metadata.storagePath);
        return createReadStream(fullPath);
      }

      // For other storage providers, we'd need to implement streaming
      // For now, return null to fall back to buffer method
      return null;
    } catch (error: any) {
      logger.error({ err: error }, `Error creating file stream for ${fileId}`);
      return null;
    }
  }

  /**
   * Check if a file is available for download
   */
  async isFileAvailable(fileId: string): Promise<boolean> {
    return this.fileRepository.isFileAvailable(fileId);
  }

  /**
   * Increment download counter and log download
   */
  async incrementDownloadCount(
    fileId: string,
    ipAddress?: string | null,
    userAgent?: string | null
  ): Promise<FileMetadata | null> {
    // Log the download
    const logData: DownloadLogData = {
      fileId,
      ipAddress: ipAddress || undefined,
      userAgent: userAgent || undefined,
      success: true
    };
    
    try {
      await this.fileRepository.logDownload(logData);
    } catch (error) {
      logger.error({ err: error }, `Error logging download for ${fileId}`);
    }

    // Increment counter
    return this.fileRepository.incrementDownloadCount(fileId);
  }

  /**
   * Log a failed download attempt
   */
  async logDownloadError(
    fileId: string,
    errorMessage: string,
    ipAddress?: string | null,
    userAgent?: string | null
  ): Promise<void> {
    const logData: DownloadLogData = {
      fileId,
      ipAddress: ipAddress || undefined,
      userAgent: userAgent || undefined,
      success: false,
      errorMessage
    };

    try {
      await this.fileRepository.logDownload(logData);
    } catch (error) {
      logger.error({ err: error }, `Error logging download error for ${fileId}`);
    }
  }

  /**
   * Delete a file (mark as inactive and remove from storage)
   */
  async deleteFile(fileId: string): Promise<boolean> {
    const metadata = await this.fileRepository.findById(fileId);
    if (!metadata || !metadata.storagePath) {
      return false;
    }

    try {
      // Remove from storage
      await this.storageManager.delete(metadata.storagePath);
      
      // Mark as inactive in database
      await this.fileRepository.update(fileId, { isActive: false });
      
      logger.info(`File deleted: ${fileId} (${metadata.filename})`);
      return true;
    } catch (error: any) {
      logger.error({ err: error }, `Error deleting file ${fileId}`);
      return false;
    }
  }

  /**
   * Cleanup expired files
   */
  async cleanupExpiredFiles(): Promise<number> {
    try {
      // Get expired files before cleanup to remove from storage
      const expiredFiles = await this.fileRepository.findExpiringSoon(-1); // Get already expired files

      // Mark expired files as inactive in database FIRST (safe even if storage delete fails)
      const cleanedCount = await this.fileRepository.cleanupExpiredFiles();

      // Then remove expired files from storage
      for (const file of expiredFiles) {
        if (file.storagePath) {
          try {
            await this.storageManager.delete(file.storagePath);
            logger.info(`Removed expired file from storage: ${file.id}`);
          } catch (error: any) {
            logger.error({ err: error }, `Error removing expired file from storage ${file.id}`);
          }
        }
      }
      
      if (cleanedCount > 0) {
        logger.info(`Cleaned up ${cleanedCount} expired files`);
      }
      
      return cleanedCount;
    } catch (error: any) {
      logger.error({ err: error }, 'Error during cleanup');
      return 0;
    }
  }

  /**
   * Get storage and file statistics
   */
  async getStats(): Promise<{
    files: {
      total: number;
      active: number;
      expired: number;
      totalSize: number;
      totalDownloads: number;
    };
    storage: { [providerName: string]: any };
  }> {
    const fileStats = await this.fileRepository.getStats();
    const storageHealth = await this.storageManager.healthCheck();

    return {
      files: {
        total: fileStats.totalFiles,
        active: fileStats.activeFiles,
        expired: fileStats.expiredFiles,
        totalSize: fileStats.totalSize,
        totalDownloads: fileStats.totalDownloads
      },
      storage: storageHealth
    };
  }

  /**
   * Check file existence in storage
   */
  async checkFileIntegrity(fileId: string): Promise<{
    database: boolean;
    storage: boolean;
    consistent: boolean;
  }> {
    const metadata = await this.fileRepository.findById(fileId);
    const dbExists = metadata !== null;
    
    let storageExists = false;
    if (metadata && metadata.storagePath) {
      try {
        storageExists = await this.storageManager.exists(metadata.storagePath);
      } catch (error) {
        storageExists = false;
      }
    }

    return {
      database: dbExists,
      storage: storageExists,
      consistent: dbExists === storageExists
    };
  }

  /**
   * Get files that will expire soon
   */
  async getExpiringSoonFiles(hours: number = 1): Promise<FileMetadata[]> {
    return this.fileRepository.findExpiringSoon(hours);
  }

  /**
   * Health check for the entire file management system
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    storage: { [providerName: string]: any };
    database: boolean;
    message?: string;
  }> {
    try {
      // Check storage health
      const storageHealth = await this.storageManager.healthCheck();
      
      // Check database health
      let dbHealthy = false;
      try {
        await this.fileRepository.getStats();
        dbHealthy = true;
      } catch (error) {
        dbHealthy = false;
      }

      // Determine overall status
      const storageHealthy = Object.values(storageHealth).every(
        (health: any) => health.status === 'healthy'
      );

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      let message = '';

      if (!dbHealthy && !storageHealthy) {
        status = 'unhealthy';
        message = 'Both database and storage are unhealthy';
      } else if (!dbHealthy || !storageHealthy) {
        status = 'degraded';
        message = !dbHealthy ? 'Database is unhealthy' : 'Storage is unhealthy';
      }

      return {
        status,
        storage: storageHealth,
        database: dbHealthy,
        message
      };
    } catch (error: any) {
      return {
        status: 'unhealthy',
        storage: {},
        database: false,
        message: error.message
      };
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await this.storageManager.cleanup();
    logger.info('FileManagerV2 cleaned up');
  }
}