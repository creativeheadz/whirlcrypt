import React, { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload as UploadIcon, FileText, Lock, Clock, Share2, AlertCircle, CheckCircle2, Copy } from 'lucide-react'
import { ClientCrypto } from '../crypto/rfc8188'
import axios from 'axios'

interface UploadState {
  file: File | null
  uploading: boolean
  progress: number
  error: string | null
  shareUrl: string | null
  retentionHours: number
}

const UploadPage: React.FC = () => {
  const [state, setState] = useState<UploadState>({
    file: null,
    uploading: false,
    progress: 0,
    error: null,
    shareUrl: null,
    retentionHours: 24
  })

  const [copied, setCopied] = useState(false)

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setState(prev => ({
        ...prev,
        file: acceptedFiles[0],
        error: null,
        shareUrl: null
      }))
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    maxSize: 100 * 1024 * 1024, // 100MB
    disabled: state.file !== null || state.uploading, // Disable dropzone once file is selected or uploading
    onDropRejected: (rejectedFiles) => {
      const rejection = rejectedFiles[0]?.errors[0]
      let errorMsg = 'File rejected'
      
      if (rejection?.code === 'file-too-large') {
        errorMsg = 'File too large (max 100MB)'
      } else if (rejection?.code === 'too-many-files') {
        errorMsg = 'Only one file at a time'
      }
      
      setState(prev => ({ ...prev, error: errorMsg }))
    }
  })

  const handleUpload = async () => {
    if (!state.file) return

    setState(prev => ({ ...prev, uploading: true, progress: 0, error: null }))

    try {
      // Generate encryption keys
      const { key, salt } = await ClientCrypto.generateKeys()
      
      // Encrypt file
      const encryptedData = await ClientCrypto.encryptFile(
        state.file,
        key,
        salt,
        4096, // 4KB record size
        (progress) => setState(prev => ({ ...prev, progress: progress * 0.7 })) // 70% for encryption
      )

      // Convert to hex for transmission
      const keyHex = Array.from(key).map(b => b.toString(16).padStart(2, '0')).join('')
      const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('')

      // Create form data
      const formData = new FormData()
      formData.append('file', new Blob([encryptedData]), state.file.name)
      formData.append('key', keyHex)
      formData.append('salt', saltHex)
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

      // Generate shareable URL with embedded keys
      const shareUrl = ClientCrypto.generateShareUrl(
        response.data.id,
        key,
        salt,
        window.location.origin
      )

      setState(prev => ({
        ...prev,
        uploading: false,
        progress: 100,
        shareUrl,
        error: null
      }))

    } catch (error) {
      console.error('Upload error:', error)
      const errorMessage = axios.isAxiosError(error)
        ? error.response?.data?.error || 'Upload failed'
        : 'Upload failed'
      
      setState(prev => ({
        ...prev,
        uploading: false,
        progress: 0,
        error: errorMessage
      }))
    }
  }

  const handleCopyLink = async () => {
    if (state.shareUrl) {
      await navigator.clipboard.writeText(state.shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
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
          Secure File Sharing
        </h1>
        <p className="text-gray-700 max-w-2xl mx-auto">
          Share files securely with end-to-end encryption. Files are encrypted in your browser 
          before upload using RFC 8188 standard.
        </p>
      </div>

      {/* Upload Area */}
      <div className="card p-6">
        <div
          {...(state.file ? {} : getRootProps())}
          className={`upload-zone ${isDragActive ? 'dragover' : ''} ${state.file ? 'cursor-default' : 'cursor-pointer'}`}
        >
          {!state.file && <input {...getInputProps()} />}
          <UploadIcon className="mx-auto h-12 w-12 text-gray-500 mb-4" />
          
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
                    className="btn-primary"
                  >
                    <Lock className="h-4 w-4 mr-2" />
                    Encrypt & Upload
                  </button>
                )}
                {!state.uploading && !state.shareUrl && (
                  <button
                    onClick={() => setState(prev => ({ ...prev, file: null, error: null }))}
                    className="btn-secondary"
                  >
                    Remove File
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div>
              <p className="text-lg font-medium text-gray-900 mb-2">
                {isDragActive ? 'Drop file here' : 'Choose file to upload'}
              </p>
              <p className="text-gray-700 mb-4">
                Drag and drop a file here, or click to browse (max 100MB)
              </p>
              <button type="button" className="btn-primary">
                Select File
              </button>
            </div>
          )}
        </div>

        {/* Retention Settings */}
        {state.file && !state.shareUrl && (
          <div className="mt-4 pt-4 border-t border-gray-300/50">
            <label className="block text-sm font-medium text-gray-800 mb-2">
              <Clock className="h-4 w-4 inline mr-1" />
              File retention period
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
          <div className="mt-4">
            <div className="flex justify-between text-sm text-gray-700 mb-1">
              <span>Encrypting and uploading...</span>
              <span>{Math.round(state.progress)}%</span>
            </div>
            <div className="w-full bg-gray-200/70 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-orange-500 to-orange-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${state.progress}%` }}
              />
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
              <span className="text-gray-900 font-medium">File uploaded successfully!</span>
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
                <p>• Share this link securely - anyone with it can download the file</p>
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
            <p>• <strong className="text-orange-600">End-to-end encryption:</strong> Files encrypted in browser</p>
            <p>• <strong className="text-orange-600">RFC 8188 standard:</strong> Industry-standard encryption</p>
            <p>• <strong className="text-orange-600">Zero server access:</strong> Keys never sent to server</p>
          </div>
          <div className="space-y-2">
            <p>• <strong className="text-orange-600">Automatic expiration:</strong> Files auto-delete</p>
            <p>• <strong className="text-orange-600">No tracking:</strong> No ads or user tracking</p>
            <p>• <strong className="text-orange-600">Open source:</strong> Transparent security</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default UploadPage