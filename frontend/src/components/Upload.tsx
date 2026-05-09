import React, { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { FileText, Lock, Share2, AlertCircle, CheckCircle2, Copy, Folder, FolderOpen, Clock } from 'lucide-react'
import { ClientCrypto } from '../crypto/rfc8188'
import JSZip from 'jszip'
import axios from 'axios'
import { useToast } from '../contexts/ToastContext'

// Feature-detect support for fetch with a ReadableStream body + duplex:'half'.
// Required for streaming uploads (RAM stays at ~one chunk regardless of file
// size). Available on Chrome 105+, Edge 105+, Firefox 105+, Safari 16.4+.
// Older engines fall back to the in-memory Blob path further down.
const supportsRequestStreams = (() => {
  let duplexAccessed = false
  try {
    const req = new Request('http://example.invalid/', {
      method: 'POST',
      body: new ReadableStream(),
      get duplex() {
        duplexAccessed = true
        return 'half'
      },
    } as any)
    // request-stream bodies don't auto-set Content-Type
    return duplexAccessed && !req.headers.has('Content-Type')
  } catch {
    return false
  }
})()

interface UploadState {
  file: File | null
  files: File[] | null
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
    folderName: null,
  })
  const [copied, setCopied] = useState(false)
  const { showError, showSuccess, showInfo } = useToast()

  const calculateTotalSize = (files: File[]): number =>
    files.reduce((total, file) => total + file.size, 0)

  const extractFolderName = (files: File[]): string => {
    if (files.length === 0) return 'folder'
    const paths = files.map(f => f.webkitRelativePath || f.name)
    const parts = paths[0].split('/')
    return parts.length > 1 ? parts[0] : 'selected-files'
  }

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const totalSize = calculateTotalSize(acceptedFiles)
      if (totalSize > 4294967296) {
        showError('Files too large', `Total size is ${formatFileSize(totalSize)}. Maximum allowed: 4GB`)
        return
      }
      const isFolder = acceptedFiles.some(f => f.webkitRelativePath)
      if (isFolder) {
        const folderName = extractFolderName(acceptedFiles)
        setState(prev => ({ ...prev, files: acceptedFiles, file: null, isFolder: true, folderName, error: null, shareUrl: null }))
      } else {
        setState(prev => ({ ...prev, file: acceptedFiles[0], files: null, isFolder: false, folderName: null, error: null, shareUrl: null }))
      }
    }
  }, [])

  const { getRootProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    maxSize: 4294967296,
    disabled: state.file !== null || state.files !== null || state.uploading,
    noClick: true,
    onDropRejected: (rejectedFiles) => {
      const rejection = rejectedFiles[0]?.errors[0]
      let errorMsg = 'Files rejected'
      if (rejection?.code === 'file-too-large') errorMsg = 'One or more files too large (max 4GB per file)'
      else if (rejection?.code === 'too-many-files') errorMsg = 'Too many files selected'
      showError('Upload error', errorMsg)
    },
  })

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    const totalSize = calculateTotalSize(files)
    if (totalSize > 4294967296) {
      showError('Files too large', `Total size is ${formatFileSize(totalSize)}. Maximum allowed: 4GB`)
      return
    }
    if (files.length === 1) {
      setState(prev => ({ ...prev, file: files[0], files: null, isFolder: false, folderName: null, error: null, shareUrl: null }))
    } else {
      setState(prev => ({ ...prev, files, file: null, isFolder: true, folderName: 'selected-files', error: null, shareUrl: null }))
    }
    e.target.value = ''
  }

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    const totalSize = calculateTotalSize(files)
    if (totalSize > 4294967296) {
      showError('Folder too large', `Total size is ${formatFileSize(totalSize)}. Maximum allowed: 4GB`)
      return
    }
    const folderName = extractFolderName(files)
    setState(prev => ({ ...prev, files, file: null, isFolder: true, folderName, error: null, shareUrl: null }))
    showSuccess('Folder selected', `${files.length} files from "${folderName}"`)
    e.target.value = ''
  }

  const handleFolderButtonClick = () => {
    showInfo('Browser permission', 'Your browser will ask permission to upload multiple files.', 6000)
  }

  const createZipFromFiles = async (files: File[], onProgress?: (p: number) => void): Promise<File> => {
    const zip = new JSZip()
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const relativePath = file.webkitRelativePath || file.name
      const arrayBuffer = await file.arrayBuffer()
      zip.file(relativePath, arrayBuffer)
      onProgress?.((i + 1) / files.length * 100)
    }
    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
    const folderName = state.folderName || 'folder'
    return new File([zipBlob], `${folderName}.zip`, { type: 'application/zip' })
  }

  const handleUpload = async () => {
    if (!state.file && !state.files) return
    setState(prev => ({ ...prev, uploading: true, progress: 0, zipProgress: 0, error: null }))
    try {
      let fileToUpload: File
      if (state.files && state.isFolder) {
        setState(prev => ({ ...prev, progress: 5 }))
        fileToUpload = await createZipFromFiles(state.files, (zipProgress) =>
          setState(prev => ({ ...prev, zipProgress, progress: 5 + (zipProgress * 0.25) }))
        )
        setState(prev => ({ ...prev, progress: 30, zipProgress: 100 }))
      } else if (state.file) {
        fileToUpload = state.file
        setState(prev => ({ ...prev, progress: 5 }))
      } else {
        throw new Error('No file or folder selected')
      }

      const { key, salt } = await ClientCrypto.generateKeys()

      let response: { id: string; downloadUrl: string; expiresAt: string }

      if (supportsRequestStreams) {
        // Streaming path: pipe encryption straight into the request body.
        // RAM stays at ~one record (64 KB) regardless of file size.
        const boundary = '----WhirlcryptBoundary' + Math.random().toString(36).slice(2)
        const encoder = new TextEncoder()

        const body = new ReadableStream<Uint8Array>({
          async start(controller) {
            try {
              controller.enqueue(encoder.encode(
                `--${boundary}\r\nContent-Disposition: form-data; name="retentionHours"\r\n\r\n${state.retentionHours}\r\n`
              ))
              controller.enqueue(encoder.encode(
                `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileToUpload.name}"\r\nContent-Type: application/octet-stream\r\n\r\n`
              ))
              for await (const chunk of ClientCrypto.encryptFileStream(
                fileToUpload, key, salt, 65536,
                (progress) => setState(prev => ({ ...prev, progress: 30 + (progress * 0.65) }))
              )) {
                controller.enqueue(chunk)
              }
              controller.enqueue(encoder.encode(`\r\n--${boundary}--\r\n`))
              controller.close()
            } catch (e) {
              controller.error(e)
            }
          },
        })

        const uploadResponse = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
          body,
          // @ts-ignore — duplex required for streaming bodies, not yet in TS lib types
          duplex: 'half',
        } as RequestInit)
        if (!uploadResponse.ok) throw new Error(`Upload failed: ${uploadResponse.statusText}`)
        response = await uploadResponse.json()
      } else {
        // Fallback for engines without request-stream support (Safari <16.4 etc.).
        // Encrypts to memory, then uploads via FormData. RAM = file size.
        const encryptedChunks: Uint8Array[] = []
        for await (const chunk of ClientCrypto.encryptFileStream(
          fileToUpload, key, salt, 65536,
          (progress) => setState(prev => ({ ...prev, progress: 30 + (progress * 0.4) }))
        )) {
          encryptedChunks.push(chunk)
        }
        setState(prev => ({ ...prev, progress: 70 }))

        const encryptedBlob = new Blob(encryptedChunks as unknown as BlobPart[], {
          type: 'application/octet-stream',
        })
        const formData = new FormData()
        formData.append('retentionHours', String(state.retentionHours))
        formData.append('file', encryptedBlob, fileToUpload.name)

        const uploadResponse = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        })
        if (!uploadResponse.ok) throw new Error(`Upload failed: ${uploadResponse.statusText}`)
        response = await uploadResponse.json()
      }

      const shareUrl = ClientCrypto.generateShareUrl(
        response.id,
        key,
        salt,
        window.location.origin,
        fileToUpload.name
      )

      setState(prev => ({ ...prev, uploading: false, progress: 100, zipProgress: 0, shareUrl, error: null }))
      showSuccess(state.isFolder ? 'Folder uploaded' : 'File uploaded', 'Encrypted and ready to share.')
    } catch (error) {
      console.error('Upload error:', error)
      const errorMessage = axios.isAxiosError(error)
        ? error.response?.data?.error || 'Upload failed'
        : error instanceof Error ? error.message : 'Upload failed'
      setState(prev => ({ ...prev, uploading: false, progress: 0, zipProgress: 0, error: errorMessage }))
      showError('Upload failed', errorMessage)
    }
  }

  const handleCopyLink = async () => {
    if (!state.shareUrl) return
    await navigator.clipboard.writeText(state.shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    showSuccess('Link copied', 'Share URL on the clipboard.')
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
    { value: 168, label: '7 days' },
  ]

  const hasSelection = !!(state.file || state.files)

  const phaseLabel = state.progress < 30 && state.isFolder
    ? 'Compressing'
    : state.progress < 70
    ? 'Encrypting'
    : 'Uploading'

  return (
    <div className="space-y-10">
      {/* Masthead */}
      <header className="space-y-3">
        <div className="folio">§ 01 · Send</div>
        <h1 className="display">A private channel, sealed at your end.</h1>
        <p className="max-w-2xl text-ink-soft" style={{ fontSize: 13, lineHeight: 1.65 }}>
          Files are sealed in your browser using the RFC 8188 record stream — keys travel only in the
          URL fragment, never to the server. Folders are bundled to a ZIP first, then encrypted whole.
        </p>
      </header>

      {/* Drop tray */}
      <section className="plate">
        <div className="folio mb-4">§ 02 · The tray</div>

        <div
          {...(hasSelection ? {} : getRootProps())}
          className={`tray ${isDragActive ? 'tray-active' : ''} ${hasSelection ? 'tray-locked' : ''}`}
        >
          {hasSelection ? (
            state.isFolder && state.files ? (
              <div className="space-y-4">
                <FolderOpen className="mx-auto h-10 w-10 text-ember" />
                <div className="space-y-1">
                  <div className="font-display italic text-lg">{state.folderName}</div>
                  <div className="folio">
                    {state.files.length} files · {formatFileSize(calculateTotalSize(state.files))}
                  </div>
                </div>
                {!state.uploading && !state.shareUrl && (
                  <div className="flex gap-2 justify-center pt-1">
                    <button onClick={handleUpload} className="btn btn-primary">
                      <Lock className="h-3.5 w-3.5" /> Encrypt & upload
                    </button>
                    <button
                      onClick={() => setState(prev => ({ ...prev, file: null, files: null, isFolder: false, folderName: null, error: null }))}
                      className="btn btn-secondary"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ) : state.file ? (
              <div className="space-y-4">
                <FileText className="mx-auto h-10 w-10 text-ember" />
                <div className="space-y-1">
                  <div className="font-display italic text-lg">{state.file.name}</div>
                  <div className="folio">{formatFileSize(state.file.size)}</div>
                </div>
                {!state.uploading && !state.shareUrl && (
                  <div className="flex gap-2 justify-center pt-1">
                    <button onClick={handleUpload} className="btn btn-primary">
                      <Lock className="h-3.5 w-3.5" /> Encrypt & upload
                    </button>
                    <button
                      onClick={() => setState(prev => ({ ...prev, file: null, files: null, isFolder: false, folderName: null, error: null }))}
                      className="btn btn-secondary"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ) : null
          ) : (
            <div className="space-y-5">
              <div className="font-display italic text-2xl">
                {isDragActive ? 'Release to seal.' : 'Drop a file or a folder here.'}
              </div>
              <div className="folio">or</div>
              <div className="flex gap-3 justify-center flex-wrap">
                <label className="btn btn-primary cursor-pointer">
                  <FileText className="h-3.5 w-3.5" /> Select files
                  <input type="file" multiple className="hidden" onChange={handleFileSelect} />
                </label>
                <label className="btn btn-secondary cursor-pointer" onClick={handleFolderButtonClick}>
                  <Folder className="h-3.5 w-3.5" /> Select folder
                  <input
                    type="file"
                    {...({ webkitdirectory: '' } as any)}
                    multiple
                    className="hidden"
                    onChange={handleFolderSelect}
                  />
                </label>
              </div>
              <div className="folio text-ink-faint">Max 4 GB total</div>
            </div>
          )}
        </div>

        {/* Retention */}
        {hasSelection && !state.shareUrl && (
          <div className="mt-6 pt-5 border-t border-rule">
            <label className="folio block mb-2 flex items-center gap-2">
              <Clock className="h-3.5 w-3.5" />
              {state.isFolder ? 'Folder' : 'File'} retention
            </label>
            <select
              value={state.retentionHours}
              onChange={e => setState(prev => ({ ...prev, retentionHours: parseInt(e.target.value) }))}
              className="input max-w-xs"
              disabled={state.uploading}
            >
              {retentionOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}

        {/* Progress readout */}
        {state.uploading && (
          <div className="mt-6 space-y-4">
            {state.isFolder && state.zipProgress > 0 && state.zipProgress < 100 && (
              <div>
                <div className="flex justify-between folio mb-1">
                  <span>Compressing folder</span>
                  <span>{Math.round(state.zipProgress)}%</span>
                </div>
                <div className="gauge"><div className="gauge-fill" style={{ width: `${state.zipProgress}%` }} /></div>
              </div>
            )}
            <div>
              <div className="flex justify-between folio mb-1">
                <span>{phaseLabel}</span>
                <span>{Math.round(state.progress)}%</span>
              </div>
              <div className="gauge"><div className="gauge-fill" style={{ width: `${state.progress}%` }} /></div>
            </div>
          </div>
        )}

        {/* Error strip */}
        {state.error && (
          <div className="strip strip-error mt-6">
            <AlertCircle className="h-4 w-4 text-led-red flex-shrink-0 mt-0.5" />
            <div className="text-ink" style={{ fontSize: 13 }}>{state.error}</div>
          </div>
        )}

        {/* Success readout */}
        {state.shareUrl && (
          <div className="strip strip-ember mt-6 flex-col items-stretch !p-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-ember flex-shrink-0 mt-0.5" />
              <div className="flex-1 space-y-3">
                <div className="font-display italic text-lg text-ink">
                  {state.isFolder ? 'Folder sealed.' : 'File sealed.'}
                </div>
                <div>
                  <div className="folio mb-1 flex items-center gap-2">
                    <Share2 className="h-3 w-3" /> Share link (key in fragment, never sent)
                  </div>
                  <div className="flex gap-2">
                    <input type="text" value={state.shareUrl} readOnly className="input flex-1" style={{ fontSize: 11 }} />
                    <button
                      onClick={handleCopyLink}
                      className={`btn ${copied ? 'btn-secondary' : 'btn-secondary'}`}
                      style={copied ? { color: 'var(--green)', borderColor: 'var(--green)' } : undefined}
                    >
                      <Copy className="h-3.5 w-3.5" /> {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
                <dl className="telem">
                  <dt>Expires</dt>
                  <dd>in {state.retentionHours} hour{state.retentionHours !== 1 ? 's' : ''}</dd>
                  <dt>Cipher</dt>
                  <dd>AES-128-GCM · RFC 8188</dd>
                  <dt>Server sees</dt>
                  <dd>encrypted bytes only</dd>
                </dl>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* What it does */}
      <section className="plate">
        <div className="folio mb-4">§ 03 · The mechanism</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-3">
          <dl className="telem">
            <dt>Encryption</dt>      <dd>RFC 8188 record stream, in-browser</dd>
            <dt>Cipher</dt>          <dd>AES-128-GCM, 64KB records</dd>
            <dt>Key custody</dt>     <dd>URL fragment only — never the server</dd>
            <dt>Folder support</dt>  <dd>Client-side ZIP, then sealed whole</dd>
          </dl>
          <dl className="telem">
            <dt>Expiry</dt>          <dd>Auto-purge after retention window</dd>
            <dt>Tracking</dt>        <dd>None. No analytics, no ads.</dd>
            <dt>Source</dt>          <dd>Open, MIT licence</dd>
            <dt>Limit</dt>           <dd>4 GB per upload</dd>
          </dl>
        </div>
      </section>
    </div>
  )
}

export default UploadPage
