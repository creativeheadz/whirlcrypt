export interface StorageProvider {
  readonly name: string;
  readonly type: StorageProviderType;
  
  /**
   * Initialize the storage provider with configuration
   */
  initialize(config: StorageConfig): Promise<void>;
  
  /**
   * Store a file and return the storage path
   */
  store(data: Buffer, filename: string, metadata?: StorageMetadata): Promise<string>;
  
  /**
   * Retrieve a file by its storage path
   */
  retrieve(storagePath: string): Promise<Buffer>;
  
  /**
   * Delete a file by its storage path
   */
  delete(storagePath: string): Promise<void>;
  
  /**
   * Check if a file exists at the given storage path
   */
  exists(storagePath: string): Promise<boolean>;
  
  /**
   * Get file stats (size, modified time, etc.)
   */
  getStats(storagePath: string): Promise<StorageStats>;
  
  /**
   * Get storage provider health status
   */
  healthCheck(): Promise<ProviderHealth>;
  
  /**
   * Cleanup resources
   */
  cleanup(): Promise<void>;
}

export type StorageProviderType = 'local' | 's3' | 'gcs' | 'azure' | 'custom';

export interface StorageConfig {
  [key: string]: any;
}

export interface LocalStorageConfig extends StorageConfig {
  path: string;
  createSubdirs?: boolean;
  permissions?: string;
}

export interface S3StorageConfig extends StorageConfig {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  prefix?: string;
}

export interface GCSStorageConfig extends StorageConfig {
  bucket: string;
  keyFilename?: string;
  projectId?: string;
  prefix?: string;
}

export interface AzureStorageConfig extends StorageConfig {
  containerName: string;
  connectionString: string;
  prefix?: string;
}

export interface StorageMetadata {
  contentType?: string;
  originalFilename?: string;
  fileId?: string;
  uploadDate?: Date;
  expiresAt?: Date;
}

export interface StorageStats {
  size: number;
  lastModified: Date;
  exists: boolean;
}

export interface ProviderHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  responseTime?: number;
  lastCheck: Date;
}

export interface StorageManagerConfig {
  defaultProvider: string;
  providers: {
    [name: string]: {
      type: StorageProviderType;
      config: StorageConfig;
      enabled: boolean;
    };
  };
}