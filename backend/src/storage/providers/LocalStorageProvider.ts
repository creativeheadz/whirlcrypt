import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  StorageProvider,
  StorageProviderType,
  LocalStorageConfig,
  StorageMetadata,
  StorageStats,
  ProviderHealth
} from '../interfaces';

export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local';
  readonly type: StorageProviderType = 'local';
  
  private config!: LocalStorageConfig;
  private basePath!: string;

  async initialize(config: LocalStorageConfig): Promise<void> {
    this.config = {
      createSubdirs: true,
      permissions: '0755',
      ...config
    };
    
    this.basePath = this.config.path;
    
    // Ensure base directory exists
    try {
      await fs.access(this.basePath);
    } catch {
      await fs.mkdir(this.basePath, { 
        recursive: true, 
        mode: parseInt(this.config.permissions!, 8) 
      });
    }
  }

  async store(data: Buffer, filename: string, metadata?: StorageMetadata): Promise<string> {
    if (!this.config) {
      throw new Error('Storage provider not initialized');
    }

    // Generate unique path structure
    const fileId = metadata?.fileId || uuidv4();
    const subdir = this.config.createSubdirs ? this.generateSubdirectory(fileId) : '';
    const safeFilename = this.sanitizeFilename(filename);
    const storagePath = join(subdir, `${fileId}-${safeFilename}`);
    const fullPath = join(this.basePath, storagePath);

    // Ensure directory exists
    const dirPath = dirname(fullPath);
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { 
        recursive: true, 
        mode: parseInt(this.config.permissions!, 8) 
      });
    }

    // Store the file
    await fs.writeFile(fullPath, data);

    // Store metadata as JSON sidecar file if provided
    if (metadata) {
      const metadataPath = `${fullPath}.meta`;
      const metadataContent = JSON.stringify({
        ...metadata,
        storedAt: new Date().toISOString(),
        originalSize: data.length
      }, null, 2);
      
      await fs.writeFile(metadataPath, metadataContent, 'utf8');
    }

    return storagePath;
  }

  async retrieve(storagePath: string): Promise<Buffer> {
    if (!this.config) {
      throw new Error('Storage provider not initialized');
    }

    const fullPath = join(this.basePath, storagePath);

    try {
      console.log(`Attempting to retrieve file from: ${fullPath}`);
      const data = await fs.readFile(fullPath);
      console.log(`Successfully retrieved file, size: ${data.length} bytes`);
      return data;
    } catch (error: any) {
      console.error(`Error retrieving file from ${fullPath}:`, error);
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${storagePath}`);
      }
      throw error;
    }
  }

  async delete(storagePath: string): Promise<void> {
    if (!this.config) {
      throw new Error('Storage provider not initialized');
    }

    const fullPath = join(this.basePath, storagePath);
    const metadataPath = `${fullPath}.meta`;

    try {
      // Delete the main file
      await fs.unlink(fullPath);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    try {
      // Delete metadata file if it exists
      await fs.unlink(metadataPath);
    } catch (error: any) {
      // Ignore if metadata file doesn't exist
      if (error.code !== 'ENOENT') {
        console.warn(`Failed to delete metadata file: ${metadataPath}`, error);
      }
    }

    // Cleanup empty directories
    await this.cleanupEmptyDirectories(dirname(fullPath));
  }

  async exists(storagePath: string): Promise<boolean> {
    if (!this.config) {
      throw new Error('Storage provider not initialized');
    }

    const fullPath = join(this.basePath, storagePath);
    
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async getStats(storagePath: string): Promise<StorageStats> {
    if (!this.config) {
      throw new Error('Storage provider not initialized');
    }

    const fullPath = join(this.basePath, storagePath);
    
    try {
      const stats = await fs.stat(fullPath);
      return {
        size: stats.size,
        lastModified: stats.mtime,
        exists: true
      };
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return {
          size: 0,
          lastModified: new Date(0),
          exists: false
        };
      }
      throw error;
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    const startTime = Date.now();
    
    try {
      if (!this.config) {
        return {
          status: 'unhealthy',
          message: 'Storage provider not initialized',
          lastCheck: new Date()
        };
      }

      // Test write and read operations
      const testData = Buffer.from('health-check');
      const testPath = join(this.basePath, '.health-check');
      
      await fs.writeFile(testPath, testData);
      const readData = await fs.readFile(testPath);
      await fs.unlink(testPath);
      
      if (!testData.equals(readData)) {
        return {
          status: 'unhealthy',
          message: 'Data integrity check failed',
          responseTime: Date.now() - startTime,
          lastCheck: new Date()
        };
      }

      return {
        status: 'healthy',
        responseTime: Date.now() - startTime,
        lastCheck: new Date()
      };
    } catch (error: any) {
      return {
        status: 'unhealthy',
        message: error.message,
        responseTime: Date.now() - startTime,
        lastCheck: new Date()
      };
    }
  }

  async cleanup(): Promise<void> {
    // Nothing specific to cleanup for local storage
    // The provider itself doesn't hold connections
  }

  private generateSubdirectory(fileId: string): string {
    // Create a 2-level directory structure based on file ID
    // e.g., "ab/cd" from fileId starting with "abcd..."
    const id = fileId.replace(/-/g, '');
    return join(id.slice(0, 2), id.slice(2, 4));
  }

  private sanitizeFilename(filename: string): string {
    // Remove or replace characters that could be problematic in filenames
    return filename
      .replace(/[<>:"/\\|?*]/g, '_') // Replace invalid characters
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .slice(0, 100); // Limit filename length
  }

  private async cleanupEmptyDirectories(dirPath: string): Promise<void> {
    if (dirPath === this.basePath) {
      return; // Don't delete the base path
    }

    try {
      const entries = await fs.readdir(dirPath);
      if (entries.length === 0) {
        await fs.rmdir(dirPath);
        // Recursively clean up parent directory
        await this.cleanupEmptyDirectories(dirname(dirPath));
      }
    } catch (error) {
      // Ignore errors during cleanup
    }
  }

  // Utility method to get metadata from sidecar file
  async getMetadata(storagePath: string): Promise<StorageMetadata | null> {
    if (!this.config) {
      throw new Error('Storage provider not initialized');
    }

    const fullPath = join(this.basePath, storagePath);
    const metadataPath = `${fullPath}.meta`;

    try {
      const metadataContent = await fs.readFile(metadataPath, 'utf8');
      return JSON.parse(metadataContent);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  // Utility method to list all files (for debugging/admin)
  async listFiles(prefix?: string): Promise<string[]> {
    if (!this.config) {
      throw new Error('Storage provider not initialized');
    }

    const searchPath = prefix ? join(this.basePath, prefix) : this.basePath;
    const files: string[] = [];

    const walkDir = async (dir: string, relativePath = ''): Promise<void> => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          const relPath = join(relativePath, entry.name);
          
          if (entry.isDirectory()) {
            await walkDir(fullPath, relPath);
          } else if (entry.isFile() && !entry.name.endsWith('.meta')) {
            files.push(relPath);
          }
        }
      } catch (error) {
        // Ignore directories that can't be read
      }
    };

    await walkDir(searchPath);
    return files;
  }
}