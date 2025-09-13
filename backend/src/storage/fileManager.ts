import { promises as fs } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { FileMetadata } from '../types';
import { config } from '../config/config';

export class FileManager {
  private static readonly METADATA_EXT = '.meta';
  
  constructor(private uploadDir: string = config.storage.local?.path || './uploads') {
    this.ensureUploadDir();
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
    retentionHours?: number
  ): Promise<FileMetadata> {
    const fileId = uuidv4();
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
      downloadCount: 0
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
   * Retrieve file metadata
   */
  async getMetadata(fileId: string): Promise<FileMetadata | null> {
    try {
      const metadataPath = join(this.uploadDir, fileId + FileManager.METADATA_EXT);
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
    try {
      const filePath = join(this.uploadDir, fileId);
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
    
    const metadataPath = join(this.uploadDir, fileId + FileManager.METADATA_EXT);
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  }

  /**
   * Delete file and metadata
   */
  async deleteFile(fileId: string): Promise<void> {
    try {
      const filePath = join(this.uploadDir, fileId);
      const metadataPath = join(this.uploadDir, fileId + FileManager.METADATA_EXT);
      
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