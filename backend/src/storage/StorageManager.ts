import { StorageProvider, StorageProviderType, StorageConfig } from './interfaces';
import { LocalStorageProvider } from './providers/LocalStorageProvider';
import { config } from '../config/config';

export class StorageManager {
  private providers: Map<string, StorageProvider> = new Map();
  private defaultProvider!: StorageProvider;

  async initialize(): Promise<void> {
    // Initialize the configured storage provider
    const providerType = config.storage.provider;
    
    switch (providerType) {
      case 'local':
        if (!config.storage.local) {
          throw new Error('Local storage configuration is missing');
        }
        
        const localProvider = new LocalStorageProvider();
        await localProvider.initialize(config.storage.local);
        this.providers.set('local', localProvider);
        this.defaultProvider = localProvider;
        break;
        
      // TODO: Add S3, GCS, Azure providers
      case 's3':
        throw new Error('S3 storage provider not yet implemented');
      case 'gcs':
        throw new Error('Google Cloud Storage provider not yet implemented');
      case 'azure':
        throw new Error('Azure Storage provider not yet implemented');
        
      default:
        throw new Error(`Unsupported storage provider: ${providerType}`);
    }

    console.log(`✅ Storage initialized with provider: ${providerType}`);
  }

  getProvider(name?: string): StorageProvider {
    if (!name) {
      return this.defaultProvider;
    }

    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Storage provider not found: ${name}`);
    }

    return provider;
  }

  getDefaultProvider(): StorageProvider {
    return this.defaultProvider;
  }

  async healthCheck(): Promise<{ [providerName: string]: any }> {
    const results: { [providerName: string]: any } = {};

    for (const [name, provider] of this.providers.entries()) {
      try {
        results[name] = await provider.healthCheck();
      } catch (error: any) {
        results[name] = {
          status: 'error',
          message: error.message,
          lastCheck: new Date()
        };
      }
    }

    return results;
  }

  async cleanup(): Promise<void> {
    for (const provider of this.providers.values()) {
      try {
        await provider.cleanup();
      } catch (error) {
        console.error('Error cleaning up storage provider:', error);
      }
    }
    
    this.providers.clear();
  }

  // Convenience methods that delegate to the default provider
  async store(data: Buffer, filename: string, metadata?: any): Promise<string> {
    return this.defaultProvider.store(data, filename, metadata);
  }

  async retrieve(storagePath: string): Promise<Buffer> {
    return this.defaultProvider.retrieve(storagePath);
  }

  async delete(storagePath: string): Promise<void> {
    return this.defaultProvider.delete(storagePath);
  }

  async exists(storagePath: string): Promise<boolean> {
    return this.defaultProvider.exists(storagePath);
  }

  async getStats(storagePath: string) {
    return this.defaultProvider.getStats(storagePath);
  }
}