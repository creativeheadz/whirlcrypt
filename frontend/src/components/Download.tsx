import React, { useState, useEffect } from 'react'
import { useParams, Navigate } from 'react-router-dom'
import { Download as DownloadIcon, AlertCircle, CheckCircle2, Lock } from 'lucide-react'
import { ClientCrypto } from '../crypto/rfc8188'
import axios from 'axios'

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
    downloaded: false,
  })

  useEffect(() => {
    const keys = ClientCrypto.extractKeysFromUrl()
    if (!keys) {
      setState(prev => ({ ...prev, error: 'Invalid download link — missing encryption keys.' }))
      return
    }
    setState(prev => ({ ...prev, keys }))
  }, [id])

  const handleDownload = async () => {
    if (!id || !state.keys) return
    setState(prev => ({ ...prev, downloading: true, progress: 0, error: null }))

    try {
      const fragment = window.location.hash.substring(1)
      const params = new URLSearchParams(fragment)
      const keyHex = params.get('key')
      if (!keyHex) throw new Error('Missing encryption key in URL')

      const filename = params.get('filename') || `decrypted-file-${id.substring(0, 8)}`

      const response = await fetch(`/api/download/${id}`, {
        headers: { 'x-encryption-key': keyHex },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }
      if (!response.body) throw new Error('Response body is not available')

      let fileWriter: any = null
      const blobParts: Uint8Array[] = []
      let receivedBytes = 0

      const useFileSystemAPI = 'showSaveFilePicker' in window
      if (useFileSystemAPI) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: filename,
            types: [{ description: 'File', accept: { 'application/octet-stream': ['.*'] } }],
          })
          fileWriter = await handle.createWritable()
        } catch (e: any) {
          if (e?.name === 'AbortError') throw e
        }
      }

      await ClientCrypto.decryptStreamToSink(
        response.body,
        state.keys.key,
        state.keys.salt,
        {
          onChunk: async (chunk: Uint8Array) => {
            receivedBytes += chunk.length
            if (fileWriter) await fileWriter.write(chunk)
            else blobParts.push(chunk)
          },
          onComplete: async () => {
            if (fileWriter) await fileWriter.close()
            else {
              const finalBlob = new Blob(blobParts, { type: 'application/octet-stream' })
              const url = URL.createObjectURL(finalBlob)
              const a = document.createElement('a')
              a.href = url
              a.download = filename
              document.body.appendChild(a)
              a.click()
              a.remove()
              URL.revokeObjectURL(url)
            }
          },
        },
        (downloaded, decrypted) => {
          const progress = Math.min(95, (decrypted / (downloaded || 1)) * 95)
          setState(prev => ({ ...prev, progress }))
        }
      )

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
          downloadCount: 0,
        },
      }))
    } catch (error) {
      console.error('Download error:', error)
      let errorMessage = 'Download failed'
      if (axios.isAxiosError(error)) {
        errorMessage = error.response?.data?.error || `HTTP ${error.response?.status}: ${error.message}`
      } else if (error instanceof Error) {
        if (error.message.includes('Decryption failed')) errorMessage = `Decryption error: ${error.message}`
        else if (error.message.includes('Invalid encrypted data')) errorMessage = `File corruption: ${error.message}`
        else errorMessage = `Processing error: ${error.message}`
      }
      setState(prev => ({ ...prev, downloading: false, progress: 0, error: errorMessage }))
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  if (!id) return <Navigate to="/" replace />

  return (
    <div className="max-w-3xl mx-auto space-y-10">
      {/* Masthead */}
      <header className="space-y-3">
        <div className="folio">§ 01 · Receive</div>
        <h1 className="display">An envelope, addressed to whoever holds this link.</h1>
        <p className="max-w-2xl text-ink-soft" style={{ fontSize: 13, lineHeight: 1.65 }}>
          The bytes on the server are sealed. Decryption happens in your browser, with the key carried
          only in the URL fragment. The metadata below appears after a successful decrypt — by design.
        </p>
      </header>

      {/* Pre-decrypt */}
      {!state.downloaded && !state.error && (
        <section className="plate">
          <div className="folio mb-4">§ 02 · The envelope</div>
          <div className="flex items-start gap-4">
            <div
              className="flex items-center justify-center"
              style={{
                width: 56, height: 56,
                border: '1px solid var(--rule-strong)',
                color: 'var(--ember)',
              }}
            >
              <Lock className="h-6 w-6" />
            </div>
            <div className="flex-1 space-y-2">
              <div className="font-display italic text-xl">Sealed file ready.</div>
              <div className="folio">
                ID · {id.substring(0, 8)}…
              </div>
              <p className="text-ink-soft" style={{ fontSize: 13 }}>
                Click below. The browser will fetch the encrypted bytes, stream-decrypt them, and
                save the file. Filename and metadata reveal only after decryption succeeds.
              </p>
            </div>
          </div>

          <div className="mt-6">
            <button
              onClick={handleDownload}
              disabled={state.downloading || !state.keys}
              className="btn btn-primary w-full justify-center"
            >
              <DownloadIcon className="h-3.5 w-3.5" />
              {state.downloading ? 'Working…' : 'Download & decrypt'}
            </button>
          </div>

          {state.downloading && (
            <div className="mt-5">
              <div className="flex justify-between folio mb-1">
                <span>Decrypting</span>
                <span>{Math.round(state.progress)}%</span>
              </div>
              <div className="gauge"><div className="gauge-fill" style={{ width: `${state.progress}%` }} /></div>
            </div>
          )}
        </section>
      )}

      {/* Post-decrypt */}
      {state.downloaded && state.fileInfo && (
        <section className="plate">
          <div className="folio mb-4">§ 02 · Delivered</div>
          <div className="flex items-start gap-4">
            <div
              className="flex items-center justify-center"
              style={{
                width: 56, height: 56,
                border: '1px solid var(--rule-strong)',
                color: 'var(--green)',
              }}
            >
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div className="flex-1 space-y-2">
              <div className="font-display italic text-xl">{state.fileInfo.filename}</div>
              <div className="folio">{formatFileSize(state.fileInfo.size)}</div>
            </div>
          </div>
          <div className="mt-5 strip strip-success">
            <CheckCircle2 className="h-4 w-4 text-led-green flex-shrink-0 mt-0.5" />
            <div style={{ fontSize: 13 }}>Decrypted in your browser — the server saw nothing readable.</div>
          </div>
        </section>
      )}

      {/* Error */}
      {state.error && (
        <section className="plate">
          <div className="folio mb-4">§ 02 · Trouble</div>
          <div className="strip strip-error">
            <AlertCircle className="h-5 w-5 text-led-red flex-shrink-0 mt-0.5" />
            <div className="space-y-2">
              <div className="font-display italic text-lg text-ink">Could not deliver.</div>
              <div className="text-ink-soft" style={{ fontSize: 13 }}>{state.error}</div>
            </div>
          </div>

          <div className="mt-5">
            <div className="folio mb-2">Likely causes</div>
            <ul className="text-ink-soft space-y-1" style={{ fontSize: 13, listStyle: 'none', paddingLeft: 0 }}>
              <li>· The file expired or was deleted.</li>
              <li>· The link is corrupt or shortened past its fragment.</li>
              <li>· The encryption key is missing or wrong.</li>
            </ul>
          </div>
        </section>
      )}

      {/* Mechanism */}
      <section className="plate">
        <div className="folio mb-4">§ 03 · The mechanism</div>
        <dl className="telem">
          <dt>Cipher</dt>        <dd>AES-128-GCM, RFC 8188 record stream</dd>
          <dt>Decrypt</dt>       <dd>In your browser, never on the server</dd>
          <dt>Key transit</dt>   <dd>URL fragment — not transmitted in HTTP</dd>
          <dt>Expiry</dt>        <dd>Auto-purge after retention window</dd>
        </dl>
      </section>
    </div>
  )
}

export default Download
