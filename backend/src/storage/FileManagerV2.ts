import { StorageManager } from './StorageManager';
import { FileRepository, CreateFileData, UpdateFileData, DownloadLogData } from '../database/models/File';
import { FileMetadata } from '../types';
import { config } from '../config/config';
import { v4 as uuidv4 } from 'uuid';
import { createReadStream, ReadStream } from 'fs';
import { join } from 'path';
import { MetadataEncryption, FileMetadataToEncrypt } from '../services/MetadataEncryption';

export class FileManagerV2 {
  private storageManager: StorageManager;
  private fileRepository: FileRepository;

  constructor() {
    this.storageManager = new StorageManager();
    this.fileRepository = new FileRepository();
  }

  async initialize(): Promise<void> {
    await this.storageManager.initialize();
    console.log('✅ FileManagerV2 initialized');
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
    const createData: CreateFileData = {
      filename: `encrypted_${fileId}`, // Don't store original filename in plaintext
      originalSize: encryptedData.length,
      encryptedSize: encryptedData.length,
      contentType: 'application/octet-stream', // Don't store original content type
      storagePath,
      storageProvider: config.storage.provider,
      expiresAt,
      maxDownloads,
      encryptedMetadata: serializedMetadata // Store encrypted metadata
    };

    const fileMetadata = await this.fileRepository.create(createData);

    console.log(`📁 File stored: ${fileId} (encrypted metadata) - expires ${expiresAt.toISOString()}`);
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
        console.error('Failed to decrypt metadata for file:', fileId, error);
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
      console.error(`Error retrieving file data for ${fileId}:`, error);
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
      console.error(`Error creating file stream for ${fileId}:`, error);
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
      console.error(`Error logging download for ${fileId}:`, error);
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
      console.error(`Error logging download error for ${fileId}:`, error);
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
      
      console.log(`🗑️ File deleted: ${fileId} (${metadata.filename})`);
      return true;
    } catch (error: any) {
      console.error(`Error deleting file ${fileId}:`, error);
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
      
      // Remove expired files from storage
      for (const file of expiredFiles) {
        if (file.storagePath) {
          try {
            await this.storageManager.delete(file.storagePath);
            console.log(`🧹 Removed expired file from storage: ${file.id} (${file.filename})`);
          } catch (error: any) {
            console.error(`Error removing expired file from storage ${file.id}:`, error);
          }
        }
      }

      // Mark expired files as inactive in database
      const cleanedCount = await this.fileRepository.cleanupExpiredFiles();
      
      if (cleanedCount > 0) {
        console.log(`🧹 Cleaned up ${cleanedCount} expired files`);
      }
      
      return cleanedCount;
    } catch (error: any) {
      console.error('Error during cleanup:', error);
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
    console.log('📦 FileManagerV2 cleaned up');
  }
}