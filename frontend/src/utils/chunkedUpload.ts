import { ClientCrypto } from '../crypto/rfc8188';
import { OPTIMIZED_RECORD_SIZE, SALT_LENGTH, TAG_LENGTH } from '../types';

const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks

interface ChunkedUploadOptions {
  file: File;
  key: Uint8Array;
  salt: Uint8Array;
  retentionHours: number;
  onProgress: (progress: number, status: string) => void;
  onError: (error: Error) => void;
  onUploadId?: (uploadId: string) => void;
  abortSignal?: AbortSignal;
}

interface UploadResponse {
  id: string;
  downloadUrl: string;
  expiresAt: string;
}

/**
 * Upload large file using chunked upload
 * Encrypts the entire file as a single RFC 8188 stream and
 * slices the encrypted bytes into 10MB network chunks.
 */
export async function chunkedUpload(options: ChunkedUploadOptions): Promise<UploadResponse> {
  const { file, key, salt, retentionHours, onProgress, onError, onUploadId, abortSignal } = options;

  try {
    const fileSize = file.size;
    const recordSize = OPTIMIZED_RECORD_SIZE;

    // Compute total encrypted size:
    // header (salt + 4-byte record size + 1-byte keyId) +
    // plaintext bytes +
    // 1 byte padding in last record +
    // one authentication tag per record
    const numRecords = Math.ceil(fileSize / recordSize);
    const headerLength = SALT_LENGTH + 5; // no keyId
    const encryptedSize = headerLength + fileSize + 1 + numRecords * TAG_LENGTH;
    const totalChunks = Math.ceil(encryptedSize / CHUNK_SIZE);

    onProgress(0, 'Initializing upload...');

    // Step 1: Initialize chunked upload with encrypted size metadata
    const initResponse = await fetch('/api/upload/chunked/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.name,
        totalSize: encryptedSize,
        totalChunks,
        retentionHours
      })
    });

    if (!initResponse.ok) {
      const error = await initResponse.json().catch(() => ({ error: 'Failed to initialize upload' }));
      throw new Error(error.error || 'Failed to initialize upload');
    }

    const { uploadId } = await initResponse.json();
    if (onUploadId) onUploadId(uploadId);
    onProgress(5, 'Upload initialized...');

    // Step 2: Stream encrypt the whole file and upload encrypted chunks
    let pending = new Uint8Array(0);
    let chunkIndex = 0;

    const flushChunk = async (finalChunk: boolean = false) => {
      if (pending.length === 0) return;

      const chunkToSend = finalChunk ? pending : pending.slice(0, CHUNK_SIZE);
      pending = finalChunk ? new Uint8Array(0) : pending.slice(CHUNK_SIZE);

      const encryptedChunkBlob = new Blob([chunkToSend], { type: 'application/octet-stream' });

      // Upload chunk with retry (5 attempts to handle transient errors and rate limits)
      await uploadChunkWithRetry(uploadId, chunkIndex, encryptedChunkBlob, 5);
      chunkIndex++;

      const uploadedChunks = Math.min(chunkIndex, totalChunks);
      const progress = 5 + (uploadedChunks / totalChunks) * 85;
      onProgress(progress, `Uploaded chunk ${uploadedChunks}/${totalChunks}`);
    };

    onProgress(5, 'Encrypting and uploading...');

    for await (const encryptedPart of ClientCrypto.encryptFileStream(
      file,
      key,
      salt,
      OPTIMIZED_RECORD_SIZE
    )) {
      // Append new encrypted bytes to pending buffer
      const merged = new Uint8Array(pending.length + encryptedPart.length);
      merged.set(pending);
      merged.set(encryptedPart, pending.length);
      pending = merged;

      // Flush full-sized chunks
      while (pending.length >= CHUNK_SIZE) {
        if (abortSignal?.aborted) {
          await cancelChunkedUpload(uploadId);
          throw new Error('Upload cancelled');
        }
        await flushChunk(false);
      }
    }

    // Flush any remaining bytes as the final chunk
    if (pending.length > 0) {
      await flushChunk(true);
    }

    onProgress(90, 'Finalizing upload...');

    // Step 3: Finalize upload
    const finalizeResponse = await fetch(`/api/upload/chunked/finalize/${uploadId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!finalizeResponse.ok) {
      const error = await finalizeResponse.json().catch(() => ({ error: 'Failed to finalize upload' }));
      throw new Error(error.error || 'Failed to finalize upload');
    }

    onProgress(100, 'Upload complete!');

    return await finalizeResponse.json();
  } catch (error) {
    console.error('Chunked upload failed:', error);
    if (onError && error instanceof Error) {
      onError(error);
    }
    throw error;
  }
}

/**
 * Upload a chunk with retry logic
 */
async function uploadChunkWithRetry(
  uploadId: string,
  chunkIndex: number,
  encryptedChunk: Blob,
  maxRetries: number
): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await uploadChunk(uploadId, chunkIndex, encryptedChunk);
      return; // Success
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      console.warn(`Chunk ${chunkIndex} upload failed (attempt ${attempt + 1}/${maxRetries}):`, error);

      // Wait before retry
      if (attempt < maxRetries - 1) {
        // Use Retry-After header if available (rate limit), otherwise exponential backoff
        const retryAfter = error?.retryAfter;
        const delay = Math.min(
          retryAfter ? retryAfter * 1000 : Math.pow(2, attempt) * 2000,
          30000 // Cap backoff at 30 seconds
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All retries failed
  throw new Error(`Failed to upload chunk ${chunkIndex} after ${maxRetries} attempts: ${lastError?.message}`);
}

/**
 * Upload a single chunk using XMLHttpRequest for progress tracking
 */
async function uploadChunk(
  uploadId: string,
  chunkIndex: number,
  encryptedChunk: Blob
): Promise<void> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('chunk', encryptedChunk);
    formData.append('chunkIndex', chunkIndex.toString());

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        // Optional: Could add fine-grained progress callback here
        const percent = (e.loaded / e.total) * 100;
        // console.log(`Chunk ${chunkIndex} upload: ${percent.toFixed(1)}%`);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          if (response.received) {
            resolve();
          } else {
            reject(new Error('Chunk not received by server'));
          }
        } catch (error) {
          reject(new Error('Invalid response from server'));
        }
      } else {
        let errorObj: any;
        try {
          const parsed = JSON.parse(xhr.responseText);
          errorObj = new Error(parsed.error || `HTTP ${xhr.status}`);
        } catch {
          errorObj = new Error(`HTTP ${xhr.status}: ${xhr.statusText}`);
        }
        // Attach Retry-After for rate limit responses
        if (xhr.status === 429) {
          const retryAfter = xhr.getResponseHeader('Retry-After');
          if (retryAfter) {
            errorObj.retryAfter = parseInt(retryAfter, 10);
          }
        }
        reject(errorObj);
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Network error during chunk upload'));
    });

    xhr.addEventListener('timeout', () => {
      reject(new Error('Chunk upload timeout'));
    });

    xhr.open('POST', `/api/upload/chunked/chunk/${uploadId}`);
    xhr.timeout = 120000; // 120 second timeout per chunk (supports slow connections)
    xhr.send(formData);
  });
}

/**
 * Cancel an upload
 */
export async function cancelChunkedUpload(uploadId: string): Promise<void> {
  try {
    await fetch(`/api/upload/chunked/cancel/${uploadId}`, {
      method: 'DELETE'
    });
  } catch (error) {
    console.error('Failed to cancel upload:', error);
  }
}
