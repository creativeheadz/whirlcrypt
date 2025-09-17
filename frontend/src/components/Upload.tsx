import React, { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload as UploadIcon, FileText, Lock, Clock, Share2, AlertCircle, CheckCircle2, Copy, Folder, FolderOpen } from 'lucide-react'
import { ClientCrypto } from '../crypto/rfc8188'
import JSZip from 'jszip'
import axios from 'axios'
import { useToast } from '../contexts/ToastContext'

interface UploadState {
  file: File | null
  files: File[] | null // For folder uploads
  uploading: boolean
  progress: number
  zipProgress: number
  error: string | null
  shareUrl: string | null
  retentionHours: number
  isFolder: boolean
  folderName: string | null
}

const UploadPage: React.FC = () => {
  const [state, setState] = useState<UploadState>({
    file: null,
    files: null,
    uploading: false,
    progress: 0,
    zipProgress: 0,
    error: null,
    shareUrl: null,
    retentionHours: 24,
    isFolder: false,
    folderName: null
  })

  const [copied, setCopied] = useState(false)
  const { showError, showSuccess, showWarning, showInfo } = useToast()

  // Calculate total size of files
  const calculateTotalSize = (files: File[]): number => {
    return files.reduce((total, file) => total + file.size, 0)
  }

  // Extract folder name from file paths
  const extractFolderName = (files: File[]): string => {
    if (files.length === 0) return 'folder'

    // Get the common path prefix
    const paths = files.map(file => file.webkitRelativePath || file.name)
    const firstPath = paths[0]
    const parts = firstPath.split('/')

    if (parts.length > 1) {
      return parts[0] // Return the root folder name
    }

    return 'selected-files'
  }

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const totalSize = calculateTotalSize(acceptedFiles)

      if (totalSize > 100 * 1024 * 1024) {
        showError(
          'Files Too Large',
          `Total size is ${formatFileSize(totalSize)}. Maximum allowed: 100MB`
        )
        return
      }

      // Check if this is a folder upload (files have webkitRelativePath)
      const isFolder = acceptedFiles.some(file => file.webkitRelativePath)

      if (isFolder) {
        const folderName = extractFolderName(acceptedFiles)
        setState(prev => ({
          ...prev,
          files: acceptedFiles,
          file: null,
          isFolder: true,
          folderName,
          error: null,
          shareUrl: null
        }))
      } else {
        setState(prev => ({
          ...prev,
          file: acceptedFiles[0],
          files: null,
          isFolder: false,
          folderName: null,
          error: null,
          shareUrl: null
        }))
      }
    }
  }, [])

  const { getRootProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true, // Allow multiple files for folder uploads
    maxSize: 100 * 1024 * 1024, // 100MB per file, but we'll check total size in onDrop
    disabled: (state.file !== null || state.files !== null) || state.uploading, // Disable dropzone once file/folder is selected or uploading
    noClick: true, // Disable click to open file dialog - we'll handle this manually
    onDropRejected: (rejectedFiles) => {
      const rejection = rejectedFiles[0]?.errors[0]
      let errorMsg = 'Files rejected'

      if (rejection?.code === 'file-too-large') {
        errorMsg = 'One or more files too large (max 100MB per file)'
      } else if (rejection?.code === 'too-many-files') {
        errorMsg = 'Too many files selected'
      }

      showError('Upload Error', errorMsg)
    }
  })

  // Handle file selection (single/multiple files)
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      const totalSize = calculateTotalSize(files)

      if (totalSize > 100 * 1024 * 1024) {
        showError(
          'Files Too Large',
          `Total size is ${formatFileSize(totalSize)}. Maximum allowed: 100MB`
        )
        return
      }

      if (files.length === 1) {
        // Single file
        setState(prev => ({
          ...prev,
          file: files[0],
          files: null,
          isFolder: false,
          folderName: null,
          error: null,
          shareUrl: null
        }))
      } else {
        // Multiple files - treat as folder
        const folderName = 'selected-files'
        setState(prev => ({
          ...prev,
          files,
          file: null,
          isFolder: true,
          folderName,
          error: null,
          shareUrl: null
        }))
      }
    }
    // Reset the input
    e.target.value = ''
  }

  // Handle folder selection
  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      const totalSize = calculateTotalSize(files)

      if (totalSize > 100 * 1024 * 1024) {
        showError(
          'Folder Too Large',
          `Total size is ${formatFileSize(totalSize)}. Maximum allowed: 100MB`
        )
        return
      }

      const folderName = extractFolderName(files)
      setState(prev => ({
        ...prev,
        files,
        file: null,
        isFolder: true,
        folderName,
        error: null,
        shareUrl: null
      }))

      // Show success notification
      showSuccess(
        'Folder Selected!',
        `${files.length} files selected from "${folderName}"`
      )
    }
    // Reset the input
    e.target.value = ''
  }

  // Show info before folder selection
  const handleFolderButtonClick = () => {
    showInfo(
      'Browser Security Notice',
      'Your browser will ask permission to upload multiple files. Click "Upload" to proceed.',
      8000 // Show for 8 seconds
    )
  }

  // Create ZIP file from folder
  const createZipFromFiles = async (files: File[], onProgress?: (progress: number) => void): Promise<File> => {
    const zip = new JSZip()

    // Add files to ZIP maintaining folder structure
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const relativePath = file.webkitRelativePath || file.name

      // Read file content
      const arrayBuffer = await file.arrayBuffer()
      zip.file(relativePath, arrayBuffer)

      if (onProgress) {
        onProgress((i + 1) / files.length * 100)
      }
    }

    // Generate ZIP file
    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    })

    // Create File object from blob
    const folderName = state.folderName || 'folder'
    return new File([zipBlob], `${folderName}.zip`, { type: 'application/zip' })
  }

  const handleUpload = async () => {
    if (!state.file && !state.files) return

    setState(prev => ({ ...prev, uploading: true, progress: 0, zipProgress: 0, error: null }))

    try {
      let fileToUpload: File

      // Handle folder upload - create ZIP first
      if (state.files && state.isFolder) {
        setState(prev => ({ ...prev, progress: 5 })) // 5% for starting ZIP creation

        fileToUpload = await createZipFromFiles(
          state.files,
          (zipProgress) => setState(prev => ({
            ...prev,
            zipProgress,
            progress: 5 + (zipProgress * 0.25) // 25% for ZIP creation (5% to 30%)
          }))
        )

        setState(prev => ({ ...prev, progress: 30, zipProgress: 100 }))
      } else if (state.file) {
        fileToUpload = state.file
        setState(prev => ({ ...prev, progress: 5 }))
      } else {
        throw new Error('No file or folder selected')
      }

      // Generate encryption keys
      const { key, salt } = await ClientCrypto.generateKeys()

      // Encrypt file (ZIP or single file) with larger record size for better performance
      const encryptedData = await ClientCrypto.encryptFile(
        fileToUpload,
        key,
        salt,
        65536, // 64KB record size (16x larger for better performance)
        (progress) => setState(prev => ({
          ...prev,
          progress: 30 + (progress * 0.4) // 40% for encryption (30% to 70%)
        }))
      )

      // Create form data (no need to send keys - server never decrypts)
      const formData = new FormData()
      formData.append('file', new Blob([new Uint8Array(encryptedData)]), fileToUpload.name)
      formData.append('retentionHours', state.retentionHours.toString())

      // Upload to server
      setState(prev => ({ ...prev, progress: 70 }))

      const response = await axios.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const uploadProgress = progressEvent.total ?
            (progressEvent.loaded / progressEvent.total) * 30 : 0 // 30% for upload
          setState(prev => ({ ...prev, progress: 70 + uploadProgress }))
        }
      })

      // Generate shareable URL with embedded keys and filename
      const shareUrl = ClientCrypto.generateShareUrl(
        response.data.id,
        key,
        salt,
        window.location.origin,
        fileToUpload.name // Include original filename in URL fragment
      )

      setState(prev => ({
        ...prev,
        uploading: false,
        progress: 100,
        zipProgress: 0,
        shareUrl,
        error: null
      }))

      // Show success notification
      showSuccess(
        state.isFolder ? 'Folder Uploaded!' : 'File Uploaded!',
        'Your encrypted file is ready to share securely.'
      )

    } catch (error) {
      console.error('Upload error:', error)
      const errorMessage = axios.isAxiosError(error)
        ? error.response?.data?.error || 'Upload failed'
        : error instanceof Error
          ? error.message
          : 'Upload failed'

      setState(prev => ({
        ...prev,
        uploading: false,
        progress: 0,
        zipProgress: 0,
        error: errorMessage
      }))

      // Show error notification
      showError('Upload Failed', errorMessage)
    }
  }

  const handleCopyLink = async () => {
    if (state.shareUrl) {
      await navigator.clipboard.writeText(state.shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)

      // Show success notification
      showSuccess('Link Copied!', 'Share URL copied to clipboard')
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const retentionOptions = [
    { value: 1, label: '1 hour' },
    { value: 6, label: '6 hours' },
    { value: 24, label: '24 hours' },
    { value: 72, label: '3 days' },
    { value: 168, label: '7 days' }
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Secure File & Folder Sharing
        </h1>
        <p className="text-gray-700 max-w-2xl mx-auto">
          Share files and folders securely with end-to-end encryption. Files are encrypted in your browser
          before upload using RFC 8188 standard. Folders are automatically packaged into encrypted ZIP archives.
        </p>
        <p className="text-sm text-gray-500 max-w-xl mx-auto mt-2">
          📁 <strong>Folder uploads:</strong> Your browser will ask permission to access multiple files - this is normal security behavior.
        </p>
      </div>

      {/* Upload Area */}
      <div className="card p-6">
        <div
          {...((state.file || state.files) ? {} : getRootProps())}
          className={`upload-zone ${isDragActive ? 'dragover' : ''} ${(state.file || state.files) ? 'cursor-default' : ''}`}
        >

          {(state.file || state.files) ? (
            state.isFolder && state.files ? (
              <FolderOpen className="mx-auto h-12 w-12 text-blue-500 mb-4" />
            ) : (
              <FileText className="mx-auto h-12 w-12 text-green-500 mb-4" />
            )
          ) : (
            <UploadIcon className="mx-auto h-12 w-12 text-gray-500 mb-4" />
          )}

          {state.file ? (
            <div className="space-y-2">
              <div className="flex items-center justify-center space-x-2 text-sm">
                <FileText className="h-4 w-4 text-gray-600" />
                <span className="font-medium text-gray-900">{state.file.name}</span>
                <span className="text-gray-600">({formatFileSize(state.file.size)})</span>
              </div>

              <div className="mt-4 flex gap-2 justify-center">
                {!state.uploading && !state.shareUrl && (
                  <button
                    onClick={handleUpload}
                    className="btn-primary flex items-center"
                  >
                    <Lock className="h-4 w-4 mr-2" />
                    Encrypt & Upload
                  </button>
                )}
                {!state.uploading && !state.shareUrl && (
                  <button
                    onClick={() => setState(prev => ({
                      ...prev,
                      file: null,
                      files: null,
                      isFolder: false,
                      folderName: null,
                      error: null
                    }))}
                    className="btn-secondary"
                  >
                    Remove File
                  </button>
                )}
              </div>
            </div>
          ) : state.files && state.isFolder ? (
            <div className="space-y-2">
              <div className="flex items-center justify-center space-x-2 text-sm">
                <Folder className="h-4 w-4 text-blue-600" />
                <span className="font-medium text-gray-900">{state.folderName}</span>
                <span className="text-gray-600">
                  ({state.files.length} files, {formatFileSize(calculateTotalSize(state.files))})
                </span>
              </div>

              <div className="mt-4 flex gap-2 justify-center">
                {!state.uploading && !state.shareUrl && (
                  <button
                    onClick={handleUpload}
                    className="btn-primary flex items-center"
                  >
                    <Lock className="h-4 w-4 mr-2" />
                    Create ZIP & Upload
                  </button>
                )}
                {!state.uploading && !state.shareUrl && (
                  <button
                    onClick={() => setState(prev => ({
                      ...prev,
                      file: null,
                      files: null,
                      isFolder: false,
                      folderName: null,
                      error: null
                    }))}
                    className="btn-secondary"
                  >
                    Remove Folder
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div>
              <p className="text-lg font-medium text-gray-900 mb-2">
                {isDragActive ? 'Drop files or folders here' : 'Choose files or folders to upload'}
              </p>
              <p className="text-gray-700 mb-4">
                Drag and drop files or folders here, or use the buttons below (max 100MB total)
              </p>
              <div className="flex gap-3 justify-center">
                <label className="btn-primary flex items-center cursor-pointer">
                  <FileText className="h-4 w-4 mr-2" />
                  Select Files
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                </label>
                <label
                  className="btn-secondary flex items-center cursor-pointer"
                  onClick={handleFolderButtonClick}
                >
                  <Folder className="h-4 w-4 mr-2" />
                  Select Folder
                  <input
                    type="file"
                    {...({ webkitdirectory: '' } as any)}
                    multiple
                    className="hidden"
                    onChange={handleFolderSelect}
                  />
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Retention Settings */}
        {(state.file || state.files) && !state.shareUrl && (
          <div className="mt-4 pt-4 border-t border-gray-300/50">
            <label className="block text-sm font-medium text-gray-800 mb-2">
              <Clock className="h-4 w-4 inline mr-1" />
              {state.isFolder ? 'Folder' : 'File'} retention period
            </label>
            <select
              value={state.retentionHours}
              onChange={(e) => setState(prev => ({
                ...prev,
                retentionHours: parseInt(e.target.value)
              }))}
              className="input max-w-xs"
              disabled={state.uploading}
            >
              {retentionOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Progress Bar */}
        {state.uploading && (
          <div className="mt-4 space-y-3">
            {/* ZIP Creation Progress (for folders) */}
            {state.isFolder && state.zipProgress > 0 && state.zipProgress < 100 && (
              <div>
                <div className="flex justify-between text-sm text-gray-700 mb-1">
                  <span>Creating ZIP archive...</span>
                  <span>{Math.round(state.zipProgress)}%</span>
                </div>
                <div className="w-full bg-gray-200/70 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${state.zipProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Overall Progress */}
            <div>
              <div className="flex justify-between text-sm text-gray-700 mb-1">
                <span>
                  {state.progress < 30 && state.isFolder ? 'Creating ZIP archive...' :
                   state.progress < 70 ? 'Encrypting...' : 'Uploading...'}
                </span>
                <span>{Math.round(state.progress)}%</span>
              </div>
              <div className="w-full bg-gray-200/70 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-orange-500 to-orange-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${state.progress}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Error Message */}
        {state.error && (
          <div className="mt-4 p-3 bg-red-100/80 border border-red-300/60 rounded-lg backdrop-blur-sm">
            <div className="flex items-center">
              <AlertCircle className="h-4 w-4 text-red-600 mr-2" />
              <span className="text-red-800 text-sm">{state.error}</span>
            </div>
          </div>
        )}

        {/* Success & Share Link */}
        {state.shareUrl && (
          <div className="mt-4 p-4 glass-orange rounded-lg">
            <div className="flex items-center mb-3">
              <CheckCircle2 className="h-5 w-5 text-orange-600 mr-2" />
              <span className="text-gray-900 font-medium">
                {state.isFolder ? 'Folder uploaded successfully!' : 'File uploaded successfully!'}
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-800 mb-1">
                  <Share2 className="h-4 w-4 inline mr-1" />
                  Share link (includes decryption key)
                </label>
                <div className="flex">
                  <input
                    type="text"
                    value={state.shareUrl}
                    readOnly
                    className="input flex-1 mr-2 font-mono text-xs"
                  />
                  <button
                    onClick={handleCopyLink}
                    className={`btn-secondary flex items-center ${copied ? 'bg-green-100/90 text-green-800 border-green-400/60' : ''}`}
                  >
                    <Copy className="h-4 w-4 mr-1" />
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>

              <div className="text-xs text-gray-700 space-y-1">
                <p>• Link expires in {state.retentionHours} hour{state.retentionHours !== 1 ? 's' : ''}</p>
                <p>• Encryption keys are embedded in the URL fragment (not sent to server)</p>
                <p>• Share this link securely - anyone with it can download the {state.isFolder ? 'folder (as ZIP)' : 'file'}</p>
                {state.isFolder && (
                  <p>• Recipients can extract the ZIP to restore the original folder structure</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Security Info */}
      <div className="card p-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
          <Lock className="h-5 w-5 mr-2 text-orange-600" />
          Security Features
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700">
          <div className="space-y-2">
            <p>• <strong className="text-orange-600">End-to-end encryption:</strong> Files & folders encrypted in browser</p>
            <p>• <strong className="text-orange-600">RFC 8188 standard:</strong> Industry-standard encryption</p>
            <p>• <strong className="text-orange-600">Zero server access:</strong> Keys never sent to server</p>
            <p>• <strong className="text-orange-600">Folder support:</strong> Automatic ZIP creation client-side</p>
          </div>
          <div className="space-y-2">
            <p>• <strong className="text-orange-600">Automatic expiration:</strong> Files auto-delete</p>
            <p>• <strong className="text-orange-600">No tracking:</strong> No ads or user tracking</p>
            <p>• <strong className="text-orange-600">Open source:</strong> Transparent security</p>
            <p>• <strong className="text-orange-600">100MB limit:</strong> Total size limit per upload</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default UploadPage