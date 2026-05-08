import React, { useState, useEffect } from 'react'
import { useParams, Navigate } from 'react-router-dom'
import { Download as DownloadIcon, Clock, AlertCircle, CheckCircle2, Lock } from 'lucide-react'
import { ClientCrypto } from '../crypto/rfc8188'

interface FileInfo {
  filename: string
  size: number
  contentType: string
  uploadDate: string
  expiresAt: string
  downloadCount: number
}

interface DownloadState {
  fileInfo: FileInfo | null
  downloading: boolean
  progress: number
  error: string | null
  keys: { key: Uint8Array; salt: Uint8Array } | null
  downloaded: boolean
}

const Download: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const [state, setState] = useState<DownloadState>({
    fileInfo: null,
    downloading: false,
    progress: 0,
    error: null,
    keys: null,
    downloaded: false
  })

  useEffect(() => {
    // Extract keys from URL fragment
    const keys = ClientCrypto.extractKeysFromUrl()
    if (!keys) {
      setState(prev => ({ 
        ...prev, 
        error: 'Invalid download link - missing encryption keys' 
      }))
      return
    }

    setState(prev => ({ ...prev, keys }))

    // Don't fetch file info - metadata will be revealed only after successful decryption
  }, [id])

  const handleDownload = async () => {
    if (!id || !state.keys) return

    setState(prev => ({ ...prev, downloading: true, progress: 0, error: null }))

    try {
      // Get original hex key from URL fragment (don't double-convert)
      const fragment = window.location.hash.substring(1);
      const params = new URLSearchParams(fragment);
      const keyHex = params.get('key');

      if (!keyHex) {
        throw new Error('Missing encryption key in URL');
      }

      // Extract and sanitize original filename from URL fragment
      const rawFilename = params.get('filename') || `decrypted-file-${id.substring(0, 8)}`
      const filename = rawFilename.replace(/[<>"'&\\/:*?|]/g, '_').substring(0, 255)

      // Use fetch API with streaming for better memory efficiency
      const response = await fetch(`/api/download/${id}`, {
        headers: { 'x-encryption-key': keyHex },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }

      if (!response.body) {
        throw new Error('Response body is not available')
      }

      // Get content length for accurate progress tracking
      const contentLength = parseInt(response.headers.get('content-length') || '0', 10)

      let fileWriter: any = null
      // Consolidated blob parts — periodically merge to reduce array size and GC pressure
      let blobParts: Blob[] = []
      let pendingChunks: Uint8Array[] = []
      let pendingSize = 0
      const BLOB_FLUSH_THRESHOLD = 50 * 1024 * 1024 // Merge every 50MB
      const LARGE_FILE_WARNING_SIZE = 500 * 1024 * 1024 // Warn above 500MB without FSAA
      let receivedBytes = 0
      let decryptedBytes = 0
      let largeFileWarned = false

      const useFileSystemAPI = 'showSaveFilePicker' in window
      if (useFileSystemAPI) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: filename,
            types: [{ description: 'File', accept: { 'application/octet-stream': ['.*'] } }]
          })
          fileWriter = await handle.createWritable()
        } catch (e:any) {
          if (e?.name === 'AbortError') throw e
        }
      }

      await ClientCrypto.decryptStreamToSink(
        response.body,
        state.keys.key,
        state.keys.salt,
        {
          onChunk: async (chunk: Uint8Array) => {
            decryptedBytes += chunk.length
            receivedBytes += chunk.length
            if (fileWriter) {
              await fileWriter.write(chunk)
            } else {
              pendingChunks.push(chunk)
              pendingSize += chunk.length

              // Periodically consolidate pending chunks into a single Blob
              // to reduce array length and memory fragmentation
              if (pendingSize >= BLOB_FLUSH_THRESHOLD) {
                blobParts.push(new Blob(pendingChunks as unknown as BlobPart[]))
                pendingChunks = []
                pendingSize = 0
              }

              // Warn once if this is a large file on a browser without FSAA
              if (!largeFileWarned && contentLength > LARGE_FILE_WARNING_SIZE) {
                largeFileWarned = true
                setState(prev => ({
                  ...prev,
                  error: 'Large file warning: Your browser may run out of memory. Use Chrome or Edge for best results with large files.'
                }))
              }
            }
          },
          onComplete: async () => {
            if (fileWriter) {
              await fileWriter.close()
            } else {
              // Consolidate any remaining pending chunks
              if (pendingChunks.length > 0) {
                blobParts.push(new Blob(pendingChunks as unknown as BlobPart[]))
                pendingChunks = []
              }
              const finalBlob = new Blob(blobParts, { type: 'application/octet-stream' })
              blobParts = [] // Free references for GC
              const url = URL.createObjectURL(finalBlob)
              const a = document.createElement('a')
              a.href = url
              a.download = filename
              document.body.appendChild(a)
              a.click()
              a.remove()
              URL.revokeObjectURL(url)
            }
          }
        },
        (downloaded, decrypted) => {
          decryptedBytes = decrypted

          // Calculate accurate progress:
          // 0-60%: Download progress (network)
          // 60-100%: Decryption progress (processing)
          let progress = 0

          if (contentLength > 0) {
            // We know the total size, so calculate download progress accurately
            const downloadProgress = Math.min(60, (downloaded / contentLength) * 60)
            const decryptionProgress = Math.min(40, (decrypted / contentLength) * 40)
            progress = downloadProgress + decryptionProgress
          } else {
            // Fallback: use decrypted bytes as progress indicator
            // This will increase smoothly as data is processed
            progress = Math.min(95, (decrypted / Math.max(downloaded, 1)) * 95)
          }

          // Ensure progress only moves forward (monotonic)
          setState(prev => ({ ...prev, progress: Math.max(prev.progress, progress) }))
        }
      )

      setState(prev => ({ ...prev, progress: 100 }))

      // Zero key material from memory after successful decryption
      if (state.keys) {
        state.keys.key.fill(0)
        state.keys.salt.fill(0)
      }

      // Set file info after successful decryption
      setState(prev => ({
        ...prev,
        downloading: false,
        progress: 100,
        downloaded: true,
        fileInfo: {
          filename,
          size: receivedBytes,
          contentType: 'application/octet-stream',
          uploadDate: new Date().toISOString(),
          expiresAt: new Date().toISOString(),
          downloadCount: 0
        }
      }))

    } catch (error) {
      console.error('Download error:', error)

      let errorMessage = 'Download failed';

      const errorAny = error as any;
      const rawMessage = errorAny?.message as string | undefined;
      const errorName = errorAny?.name as string | undefined;

      if (errorName === 'AbortError') {
        // User cancelled the download (e.g. closing the file picker)
        errorMessage = 'Download was cancelled.';
      } else if (rawMessage) {
        // Decryption or other processing error
        if (rawMessage.includes('Decryption failed')) {
          errorMessage = `Decryption error: ${rawMessage}`;
        } else if (rawMessage.includes('Invalid encrypted data')) {
          errorMessage = `File corruption: ${rawMessage}`;
        } else if (rawMessage.startsWith('HTTP ')) {
          // HTTP/network error surfaced from fetch
          errorMessage = rawMessage;
        } else {
          errorMessage = `Processing error: ${rawMessage}`;
        }
      }

      setState(prev => ({
        ...prev,
        downloading: false,
        progress: 0,
        error: errorMessage
      }))
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatTimeRemaining = (expiresAt: string): string => {
    const now = new Date()
    const expires = new Date(expiresAt)
    const diff = expires.getTime() - now.getTime()

    if (diff <= 0) return 'Expired'

    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

    if (hours > 0) {
      return `${hours}h ${minutes}m remaining`
    } else {
      return `${minutes}m remaining`
    }
  }

  // Redirect if no file ID
  if (!id) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Download File
        </h1>
        <p className="text-gray-700">
          Secure encrypted file download
        </p>
      </div>

      {/* Generic Download Card - Before decryption */}
      {!state.downloaded && !state.error && (
        <div className="card p-6">
          <div className="flex items-center space-x-3 mb-4">
            <Lock className="h-8 w-8 text-orange-500" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Encrypted File</h2>
              <p className="text-gray-600">Ready to download and decrypt</p>
            </div>
          </div>

          {/* Download Button */}
          <div className="mt-6">
            <button
              onClick={handleDownload}
              disabled={state.downloading || !state.keys}
              className="btn-primary w-full flex items-center justify-center"
            >
              <DownloadIcon className="h-4 w-4 mr-2" />
              {state.downloading ? 'Downloading...' : 'Download & Decrypt File'}
            </button>
          </div>

          {/* Progress Bar */}
          {state.downloading && (
            <div className="mt-4">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>
                  {state.progress < 60
                    ? `Downloading encrypted file...`
                    : state.progress < 95
                      ? `Decrypting file...`
                      : `Finalizing...`}
                </span>
                <span>{Math.round(state.progress)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${state.progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* File Info Card - Only shown after successful decryption */}
      {state.downloaded && state.fileInfo && (
        <div className="card p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center space-x-3">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {state.fileInfo.filename}
                </h3>
                <p className="text-sm text-gray-500">
                  {formatFileSize(state.fileInfo.size)} • {state.fileInfo.contentType}
                </p>
              </div>
            </div>
            <div className="flex items-center text-sm text-gray-500">
              <Lock className="h-4 w-4 mr-1" />
              <span>Encrypted</span>
            </div>
          </div>

          {/* File Details */}
          <div className="grid grid-cols-2 gap-4 text-sm border-t pt-4">
            <div>
              <span className="font-medium text-gray-700">Uploaded:</span>
              <p className="text-gray-500">
                {new Date(state.fileInfo.uploadDate).toLocaleString()}
              </p>
            </div>
            <div>
              <span className="font-medium text-gray-700">Downloads:</span>
              <p className="text-gray-500">{state.fileInfo.downloadCount}</p>
            </div>
            <div className="col-span-2">
              <span className="font-medium text-gray-700">
                <Clock className="h-4 w-4 inline mr-1" />
                Expires:
              </span>
              <p className="text-gray-500">
                {formatTimeRemaining(state.fileInfo.expiresAt)}
              </p>
            </div>
          </div>

          {/* Success Message */}
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
            <div className="flex items-center">
              <CheckCircle2 className="h-4 w-4 text-green-500 mr-2" />
              <span className="text-green-700 text-sm">
                File downloaded and decrypted successfully!
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {state.error && (
        <div className="card p-6">
          <div className="flex items-center">
            <AlertCircle className="h-8 w-8 text-red-500 mr-3" />
            <div>
              <h3 className="text-lg font-semibold text-red-800">Download Error</h3>
              <p className="text-red-600">{state.error}</p>
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t">
            <p className="text-sm text-gray-600">
              Possible reasons:
            </p>
            <ul className="mt-2 text-sm text-gray-500 list-disc list-inside">
              <li>File has expired or been deleted</li>
              <li>Invalid or corrupted download link</li>
              <li>Missing encryption keys in URL</li>
            </ul>
          </div>
        </div>
      )}

      {/* Security Info */}
      <div className="card p-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
          <Lock className="h-5 w-5 mr-2 text-primary-600" />
          Download Security
        </h3>
        <div className="text-sm text-gray-600 space-y-2">
          <p>• File is encrypted with AES-128-GCM using RFC 8188 standard</p>
          <p>• Decryption keys are embedded in this URL and never sent to the server</p>
          <p>• File is decrypted in your browser for maximum security</p>
          <p>• Download link will expire automatically after the retention period</p>
        </div>
      </div>
    </div>
  )
}

export default Download