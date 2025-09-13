import { FileManagerV2 } from '../storage/FileManagerV2';
import { FileManager } from '../storage/fileManager';

// Global file manager instance - will be set during app initialization
let fileManagerInstance: FileManagerV2 | FileManager | null = null;

export function setFileManager(manager: FileManagerV2 | FileManager): void {
  fileManagerInstance = manager;
}

export function getFileManager(): FileManagerV2 | FileManager {
  if (!fileManagerInstance) {
    throw new Error('File manager not initialized. Make sure to call setFileManager() during app startup.');
  }
  return fileManagerInstance;
}

export function isUsingDatabase(): boolean {
  return fileManagerInstance instanceof FileManagerV2;
}