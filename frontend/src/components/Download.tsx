import React, { useState, useEffect } from 'react'
import { useParams, Navigate } from 'react-router-dom'
import { Download as DownloadIcon, AlertCircle, CheckCircle2, Lock, KeyRound } from 'lucide-react'
import { ClientCrypto, EnvelopeMetadata } from '../crypto/rfc8188'
import axios from 'axios'

interface FileInfo {
  filename: string
  size: number
  contentType: string
}

interface DownloadState {
  fileInfo: FileInfo | null
  downloading: boolean
  progress: number
  error: string | null

  // URL fragment params
  keyOrWrapped: Uint8Array | null
  salt: Uint8Array | null
  passphraseSalt: Uint8Array | null   // null when the link doesn't need a passphrase

  // user-entered passphrase + per-attempt error
  passphrase: string
  passphraseError: string | null

  downloaded: boolean
}

const Download: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const [state, setState] = useState<DownloadState>({
    fileInfo: null,
    downloading: false,
    progress: 0,
    error: null,
    keyOrWrapped: null,
    salt: null,
    passphraseSalt: null,
    passphrase: '',
    passphraseError: null,
    downloaded: false,
  })

  useEffect(() => {
    const parsed = ClientCrypto.extractKeysFromUrl()
    if (!parsed) {
      setState(prev => ({
        ...prev,
        error: 'Invalid or outdated download link — missing encryption keys.',
      }))
      return
    }
    setState(prev => ({
      ...prev,
      keyOrWrapped: parsed.keyOrWrapped,
      salt: parsed.salt,
      passphraseSalt: parsed.passphraseSalt,
    }))
  }, [id])

  const handleDownload = async () => {
    if (!id || !state.keyOrWrapped || !state.salt) return

    // Resolve the actual file key. If the link is passphrase-locked, unwrap
    // the key with the user-supplied passphrase first.
    let key: Uint8Array
    if (state.passphraseSalt) {
      if (state.passphrase.length === 0) {
        setState(prev => ({ ...prev, passphraseError: 'Enter the passphrase to unlock.' }))
        return
      }
      try {
        key = await ClientCrypto.unwrapKeyWithPassphrase(
          state.keyOrWrapped,
          state.passphrase,
          state.passphraseSalt,
        )
      } catch (e: any) {
        setState(prev => ({ ...prev, passphraseError: 'Failed to derive key from passphrase.' }))
        return
      }
    } else {
      key = state.keyOrWrapped
    }

    setState(prev => ({ ...prev, downloading: true, progress: 0, error: null, passphraseError: null }))

    try {
      const response = await fetch(`/api/download/${id}`)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }
      if (!response.body) throw new Error('Response body is not available')

      let metadata: EnvelopeMetadata | null = null
      let fileWriter: any = null
      const blobParts: Uint8Array[] = []
      let receivedBytes = 0

      const useFileSystemAPI = 'showSaveFilePicker' in window

      await ClientCrypto.decryptEnvelopeToSink(
        response.body,
        key,
        state.salt,
        {
          onMetadata: async (m) => {
            metadata = m
            if (useFileSystemAPI) {
              try {
                const handle = await (window as any).showSaveFilePicker({
                  suggestedName: m.filename,
                  types: [{
                    description: m.contentType || 'File',
                    accept: { [m.contentType || 'application/octet-stream']: ['.*'] },
                  }],
                })
                fileWriter = await handle.createWritable()
              } catch (e: any) {
                if (e?.name === 'AbortError') throw e
              }
            }
            setState(prev => ({
              ...prev,
              fileInfo: { filename: m.filename, size: 0, contentType: m.contentType },
            }))
          },
          onChunk: async (chunk) => {
            receivedBytes += chunk.length
            if (fileWriter) {
              await fileWriter.write(chunk)
            } else {
              blobParts.push(chunk)
            }
          },
          onComplete: async () => {
            if (fileWriter) {
              await fileWriter.close()
            } else {
              const filename = metadata?.filename ?? `decrypted-file-${id?.substring(0, 8)}`
              const contentType = metadata?.contentType || 'application/octet-stream'
              const finalBlob = new Blob(blobParts, { type: contentType })
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

      const filename = metadata?.filename ?? `decrypted-file-${id?.substring(0, 8)}`
      const contentType = metadata?.contentType || 'application/octet-stream'

      setState(prev => ({
        ...prev,
        downloading: false,
        progress: 100,
        downloaded: true,
        fileInfo: { filename, size: receivedBytes, contentType },
      }))
    } catch (error) {
      console.error('Download error:', error)
      const isAuthFailure = error instanceof Error && (
        error.message.includes('OperationError') ||
        error.message.includes('salt mismatch') ||
        error.message.includes('delimiter')
      )

      // A passphrase-locked link that fails AES-GCM auth almost always means
      // a wrong passphrase. Steer the user back to the passphrase input
      // rather than treating the page as terminally broken.
      if (state.passphraseSalt && isAuthFailure) {
        setState(prev => ({
          ...prev,
          downloading: false,
          progress: 0,
          passphraseError: 'Wrong passphrase. Try again.',
        }))
        return
      }

      let errorMessage = 'Download failed'
      if (axios.isAxiosError(error)) {
        errorMessage = error.response?.data?.error || `HTTP ${error.response?.status}: ${error.message}`
      } else if (error instanceof Error) {
        if (error.message.includes('salt mismatch') || error.message.includes('OperationError')) {
          errorMessage = 'Decryption failed — the link is from a different file or has been tampered with.'
        } else if (error.message.includes('delimiter')) {
          errorMessage = `Decryption failed — record format invalid: ${error.message}`
        } else if (error.message.includes('metadata')) {
          errorMessage = `Decryption succeeded but metadata header is corrupt: ${error.message}`
        } else {
          errorMessage = error.message
        }
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

  const passphraseRequired = state.passphraseSalt !== null

  return (
    <div className="max-w-3xl mx-auto space-y-10">
      {/* Masthead */}
      <header className="space-y-3">
        <div className="folio">§ 01 · Receive</div>
        <h1 className="display">An envelope, addressed to whoever holds this link.</h1>
        <p className="max-w-2xl text-ink-soft" style={{ fontSize: 13, lineHeight: 1.65 }}>
          The bytes on the server are sealed. Decryption happens in your browser, with the key carried
          only in the URL fragment{passphraseRequired ? ' and a passphrase shared out-of-band' : ''}.
          The filename and type appear once decryption confirms the link is intact.
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
                {passphraseRequired && <span className="ml-3" style={{ color: 'var(--ember)' }}>· passphrase required</span>}
              </div>
              <p className="text-ink-soft" style={{ fontSize: 13 }}>
                {passphraseRequired
                  ? 'The sender has locked this link with a passphrase. Enter it below to derive the decryption key.'
                  : 'Click below. The browser will fetch the encrypted bytes, stream-decrypt them, and save the file.'}
              </p>
            </div>
          </div>

          {passphraseRequired && (
            <div className="mt-6 space-y-3">
              <label className="folio block flex items-center gap-2">
                <KeyRound className="h-3 w-3" />
                Passphrase
              </label>
              <input
                type="password"
                value={state.passphrase}
                onChange={e => setState(prev => ({ ...prev, passphrase: e.target.value, passphraseError: null }))}
                onKeyDown={e => { if (e.key === 'Enter' && !state.downloading) handleDownload() }}
                disabled={state.downloading}
                autoFocus
                autoComplete="off"
                className="input max-w-md"
                placeholder="Enter the passphrase the sender shared with you"
              />
              {state.passphraseError && (
                <div className="folio" style={{ color: 'var(--red)' }}>
                  {state.passphraseError}
                </div>
              )}
              <div className="folio text-ink-faint" style={{ fontSize: 10 }}>
                The passphrase is fed to PBKDF2-SHA256 (600k iterations) to unwrap the file key.
                The passphrase itself never leaves your browser.
              </div>
            </div>
          )}

          <div className="mt-6">
            <button
              onClick={handleDownload}
              disabled={state.downloading || !state.keyOrWrapped || (passphraseRequired && state.passphrase.length === 0)}
              className="btn btn-primary w-full justify-center"
            >
              <DownloadIcon className="h-3.5 w-3.5" />
              {state.downloading
                ? 'Working…'
                : passphraseRequired
                ? 'Unlock & download'
                : 'Download & decrypt'}
            </button>
          </div>

          {state.downloading && (
            <div className="mt-5">
              <div className="flex justify-between folio mb-1">
                <span>Decrypting{state.fileInfo ? ` · ${state.fileInfo.filename}` : ''}</span>
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
              <div className="folio">{formatFileSize(state.fileInfo.size)} · {state.fileInfo.contentType}</div>
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
              <li>· The file expired or was deleted (or burned after a previous download).</li>
              <li>· The link is corrupt or shortened past its fragment.</li>
              <li>· The link is from before today's wire-format upgrade — please re-share.</li>
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
          <dt>Filename</dt>      <dd>Sealed inside the envelope, revealed on decrypt</dd>
          {passphraseRequired && (
            <>
              <dt>Passphrase KDF</dt>
              <dd>PBKDF2-SHA256, 600 000 iterations</dd>
            </>
          )}
          <dt>Expiry</dt>        <dd>Auto-purge after retention window</dd>
        </dl>
      </section>
    </div>
  )
}

export default Download
