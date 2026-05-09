import { DEFAULT_RECORD_SIZE, SALT_LENGTH, KEY_LENGTH, TAG_LENGTH } from '../types'

/**
 * RFC 8188 — Encrypted Content-Encoding for HTTP — client-side implementation
 * using the Web Crypto API.
 *
 * Wire format (v2):
 *   - Header: salt(16) || rs(4 BE) || idlen(1) || keyid(idlen)
 *   - Records: each record on the wire is exactly `rs` octets except possibly
 *     the final record, which may be shorter.
 *   - Each record's plaintext is `data || delimiter || zero-or-more 0x00`.
 *     delimiter = 0x01 for non-terminal records, 0x02 for the terminal record.
 *   - We use idlen = 0 (no key-id field).
 *
 * Key derivation (RFC 8188 §2.2, HKDF-SHA-256):
 *   PRK   = HKDF-Extract(salt, IKM)
 *   CEK   = HKDF-Expand(PRK, "Content-Encoding: aes128gcm\0", 16)
 *   NONCE = HKDF-Expand(PRK, "Content-Encoding: nonce\0",     12)
 *
 * Per-record nonce: NONCE XOR SEQ where SEQ is a 96-bit big-endian counter
 * starting at 0 and incremented for each record.
 *
 * Filename and MIME type are carried inside the encrypted envelope as a
 * length-prefixed JSON header at the start of the plaintext stream:
 *
 *     [ 4-byte BE length N ] [ N bytes of UTF-8 JSON metadata ] [ file bytes ]
 *
 * The server therefore sees only opaque ciphertext; the URL fragment carries
 * only the key and salt (base64url encoded).
 */

const ALGORITHM = 'AES-GCM'
const ENCODER = new TextEncoder()
const DECODER = new TextDecoder()
const INFO_CONTENT_ENCODING = ENCODER.encode('Content-Encoding: aes128gcm\0')
const INFO_NONCE            = ENCODER.encode('Content-Encoding: nonce\0')

export interface EnvelopeMetadata {
  filename: string
  contentType: string
}

export class ClientCrypto {
  // ────────────────────────────────────────────────────────────────────────
  // Random + key generation
  // ────────────────────────────────────────────────────────────────────────

  static generateRandomBytes(length: number): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(length))
  }

  static async generateKeys(): Promise<{ key: Uint8Array; salt: Uint8Array }> {
    return {
      key:  this.generateRandomBytes(KEY_LENGTH),
      salt: this.generateRandomBytes(SALT_LENGTH),
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // HKDF + per-record nonce derivation
  // ────────────────────────────────────────────────────────────────────────

  /** HKDF-SHA-256 (Extract+Expand combined) via Web Crypto. */
  private static async hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
    const k = await crypto.subtle.importKey('raw', ikm as BufferSource, { name: 'HKDF' }, false, ['deriveBits'])
    const bits = await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: info as BufferSource },
      k, length * 8,
    )
    return new Uint8Array(bits)
  }

  private static deriveCEK(salt: Uint8Array, key: Uint8Array): Promise<Uint8Array> {
    return this.hkdf(salt, key, INFO_CONTENT_ENCODING, KEY_LENGTH)
  }

  private static deriveNonceBase(salt: Uint8Array, key: Uint8Array): Promise<Uint8Array> {
    return this.hkdf(salt, key, INFO_NONCE, 12)
  }

  /** Per-record nonce: NONCE XOR SEQ (96-bit big-endian). */
  private static recordNonce(base: Uint8Array, seq: number): Uint8Array {
    const nonce = new Uint8Array(base)
    // SEQ is 96 bits; we represent it as 32-bit zero || 64-bit big-endian.
    // For seq < 2^64 (effectively forever) the upper 4 bytes are zero, so we
    // only need to XOR the trailing 8 bytes.
    const buf = new ArrayBuffer(8)
    new DataView(buf).setBigUint64(0, BigInt(seq), false)
    const seqBytes = new Uint8Array(buf)
    for (let i = 0; i < 8; i++) nonce[4 + i] ^= seqBytes[i]
    return nonce
  }

  // ────────────────────────────────────────────────────────────────────────
  // Encryption
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Encrypt a plaintext byte stream into RFC 8188 records. Yields the header
   * first, then one Uint8Array per encrypted record. The final record always
   * carries the 0x02 terminal delimiter (even when the plaintext is empty).
   */
  static async *encryptStream(
    plaintext: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
    key: Uint8Array,
    salt: Uint8Array,
    rs: number = DEFAULT_RECORD_SIZE,
    onBytes?: (bytes: number) => void,
  ): AsyncGenerator<Uint8Array, void, unknown> {
    if (rs < 18) throw new Error('record size must be >= 18 (RFC 8188 §2)')
    const cek       = await this.deriveCEK(salt, key)
    const nonceBase = await this.deriveNonceBase(salt, key)
    const cryptoKey = await crypto.subtle.importKey('raw', cek as BufferSource, { name: ALGORITHM }, false, ['encrypt'])

    // Header: salt || rs || idlen=0
    const header = new Uint8Array(SALT_LENGTH + 5)
    header.set(salt, 0)
    new DataView(header.buffer, SALT_LENGTH, 4).setUint32(0, rs, false)
    header[SALT_LENGTH + 4] = 0
    yield header

    // Per record: plaintext = data || delimiter, ciphertext = plaintext + 16 (tag)
    // We aim for ciphertext == rs, so plaintext budget = rs - 16, of which we
    // reserve 1 byte for the delimiter, leaving rs - 17 bytes for data.
    const dataBudget = rs - TAG_LENGTH - 1
    const plain = new Uint8Array(rs - TAG_LENGTH) // filled as data || delimiter (no 0x00 padding)
    let dataInPlain = 0
    let seq = 0
    let totalBytes = 0

    const flush = async (isLast: boolean): Promise<Uint8Array> => {
      plain[dataInPlain] = isLast ? 2 : 1
      // .slice() copies; .subarray() would share the underlying buffer with
      // `plain`, which we mutate before the encrypt promise's microtask runs.
      const recordPlain = plain.slice(0, dataInPlain + 1)
      const nonce = this.recordNonce(nonceBase, seq)
      const encrypted = await crypto.subtle.encrypt(
        { name: ALGORITHM, iv: nonce as BufferSource },
        cryptoKey,
        recordPlain as BufferSource,
      )
      seq++
      dataInPlain = 0
      return new Uint8Array(encrypted)
    }

    for await (const chunk of plaintext) {
      let offset = 0
      while (offset < chunk.length) {
        const space = dataBudget - dataInPlain
        const take  = Math.min(space, chunk.length - offset)
        plain.set(chunk.subarray(offset, offset + take), dataInPlain)
        dataInPlain += take
        offset      += take
        totalBytes  += take
        if (dataInPlain === dataBudget) {
          yield await flush(false)
          if (onBytes) onBytes(totalBytes)
        }
      }
    }

    // Always emit a terminal record (may be empty).
    yield await flush(true)
    if (onBytes) onBytes(totalBytes)
  }

  /**
   * Encrypt a File. Prepends a length-prefixed JSON metadata block to the
   * plaintext stream so the recipient learns the filename and MIME type only
   * after successful decryption (the server never sees them).
   */
  static async *encryptFileStream(
    file: File,
    metadata: EnvelopeMetadata,
    key: Uint8Array,
    salt: Uint8Array,
    rs: number = DEFAULT_RECORD_SIZE,
    onProgress?: (progress: number) => void,
  ): AsyncGenerator<Uint8Array, void, unknown> {
    const metaBytes = ENCODER.encode(JSON.stringify(metadata))
    if (metaBytes.length > 0xffffffff) throw new Error('metadata too large')
    const prefix = new Uint8Array(4 + metaBytes.length)
    new DataView(prefix.buffer).setUint32(0, metaBytes.length, false)
    prefix.set(metaBytes, 4)

    const totalPlaintextBytes = prefix.length + file.size
    const onBytes = onProgress
      ? (b: number) => onProgress(totalPlaintextBytes ? (b / totalPlaintextBytes) * 100 : 100)
      : undefined

    const fileChunks = (async function* () {
      yield prefix
      let offset = 0
      const sliceSize = rs // size of file slices read into memory at a time
      while (offset < file.size) {
        const end = Math.min(offset + sliceSize, file.size)
        yield new Uint8Array(await file.slice(offset, end).arrayBuffer())
        offset = end
      }
    })()

    yield* this.encryptStream(fileChunks, key, salt, rs, onBytes)
  }

  // ────────────────────────────────────────────────────────────────────────
  // Decryption
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Streaming decryption. Reads the header from the stream, validates the
   * salt against the URL's salt, then decrypts records one at a time. Calls
   * `sink.onChunk(plaintext)` with the data portion of each record (without
   * delimiter or padding), then `sink.onComplete()` at end of stream.
   *
   * Throws on:
   *   - salt mismatch
   *   - invalid record size in header
   *   - record with delimiter other than 0x01 or 0x02
   *   - stream that ends without a terminal (0x02) record
   */
  static async decryptToSink(
    stream: ReadableStream<Uint8Array>,
    key: Uint8Array,
    salt: Uint8Array,
    sink: {
      onChunk: (chunk: Uint8Array) => Promise<void> | void
      onComplete?: () => Promise<void> | void
    },
    onProgress?: (downloaded: number, decrypted: number) => void,
  ): Promise<void> {
    const reader = stream.getReader()
    let buffer = new Uint8Array(0)
    const append = (data: Uint8Array) => {
      const merged = new Uint8Array(buffer.length + data.length)
      merged.set(buffer)
      merged.set(data, buffer.length)
      buffer = merged
    }

    let headerParsed = false
    let rs = 0
    let cryptoKey: CryptoKey | null = null
    let nonceBase: Uint8Array | null = null
    let seq = 0
    let totalDownloaded = 0
    let totalDecrypted = 0
    let sawTerminal = false

    const decryptRecord = async (encrypted: Uint8Array): Promise<{ data: Uint8Array; isLast: boolean }> => {
      const nonce = this.recordNonce(nonceBase!, seq)
      const decrypted = new Uint8Array(await crypto.subtle.decrypt(
        { name: ALGORITHM, iv: nonce as BufferSource },
        cryptoKey!,
        encrypted as BufferSource,
      ))
      const idx = seq
      seq++
      // Strip trailing 0x00 padding, then expect a delimiter.
      let end = decrypted.length
      while (end > 0 && decrypted[end - 1] === 0) end--
      if (end === 0) throw new Error(`record ${idx} has no delimiter`)
      const delimiter = decrypted[end - 1]
      if (delimiter !== 1 && delimiter !== 2) {
        throw new Error(`record ${idx} has invalid delimiter 0x${delimiter.toString(16)}`)
      }
      return { data: decrypted.subarray(0, end - 1), isLast: delimiter === 2 }
    }

    while (true) {
      const { done, value } = await reader.read()
      if (value) {
        append(value)
        totalDownloaded += value.length
      }

      // Parse the header once enough bytes are buffered.
      if (!headerParsed && buffer.length >= SALT_LENGTH + 5) {
        const headerSalt = buffer.subarray(0, SALT_LENGTH)
        rs = new DataView(buffer.buffer, buffer.byteOffset + SALT_LENGTH, 4).getUint32(0, false)
        if (rs < 18) throw new Error(`invalid record size in header: ${rs}`)
        const idlen = buffer[SALT_LENGTH + 4]
        const headerLength = SALT_LENGTH + 5 + idlen
        if (buffer.length >= headerLength) {
          if (headerSalt.length !== salt.length) throw new Error('salt length mismatch')
          for (let i = 0; i < salt.length; i++) {
            if (headerSalt[i] !== salt[i]) throw new Error('salt mismatch')
          }
          const cek = await this.deriveCEK(salt, key)
          nonceBase = await this.deriveNonceBase(salt, key)
          cryptoKey = await crypto.subtle.importKey('raw', cek as BufferSource, { name: ALGORITHM }, false, ['decrypt'])
          headerParsed = true
          buffer = buffer.slice(headerLength)
        }
      }

      // Process complete records.
      if (headerParsed && cryptoKey && nonceBase) {
        while (!sawTerminal && buffer.length >= rs) {
          const enc = buffer.slice(0, rs)
          const { data, isLast } = await decryptRecord(enc)
          totalDecrypted += data.length
          await sink.onChunk(data)
          buffer = buffer.slice(rs)
          if (isLast) sawTerminal = true
          if (onProgress) onProgress(totalDownloaded, totalDecrypted)
        }
      }

      if (done) {
        // Final record may be shorter than rs.
        if (headerParsed && cryptoKey && nonceBase && !sawTerminal && buffer.length > TAG_LENGTH) {
          const { data, isLast } = await decryptRecord(buffer)
          totalDecrypted += data.length
          await sink.onChunk(data)
          buffer = new Uint8Array(0)
          if (!isLast) throw new Error('stream ended without terminal record')
          sawTerminal = true
          if (onProgress) onProgress(totalDownloaded, totalDecrypted)
        }
        if (!sawTerminal) throw new Error('stream ended without terminal record')
        if (sink.onComplete) await sink.onComplete()
        return
      }
    }
  }

  /**
   * Decrypt a stream and split out the embedded metadata (filename + MIME type)
   * from the file bytes. Calls `onMetadata` once after the metadata header has
   * been read in full, then `onChunk` for each subsequent file-data chunk.
   */
  static async decryptEnvelopeToSink(
    stream: ReadableStream<Uint8Array>,
    key: Uint8Array,
    salt: Uint8Array,
    callbacks: {
      onMetadata: (metadata: EnvelopeMetadata) => Promise<void> | void
      onChunk:    (chunk: Uint8Array) => Promise<void> | void
      onComplete?: () => Promise<void> | void
    },
    onProgress?: (downloaded: number, decrypted: number) => void,
  ): Promise<void> {
    const lengthPrefix = new Uint8Array(4)
    let lengthFilled = 0
    let metadataLen = -1
    let metadataBuf: Uint8Array | null = null
    let metadataFilled = 0

    await this.decryptToSink(stream, key, salt, {
      onChunk: async (data) => {
        let offset = 0

        if (metadataLen < 0) {
          // Still reading the 4-byte length prefix.
          const need = 4 - lengthFilled
          const take = Math.min(need, data.length - offset)
          lengthPrefix.set(data.subarray(offset, offset + take), lengthFilled)
          lengthFilled += take
          offset += take
          if (lengthFilled === 4) {
            metadataLen = new DataView(lengthPrefix.buffer).getUint32(0, false)
            if (metadataLen > 0x40000) throw new Error(`metadata length implausibly large: ${metadataLen}`)
            metadataBuf = new Uint8Array(metadataLen)
          }
        }

        if (metadataLen >= 0 && metadataBuf && metadataFilled < metadataLen) {
          const need = metadataLen - metadataFilled
          const take = Math.min(need, data.length - offset)
          metadataBuf.set(data.subarray(offset, offset + take), metadataFilled)
          metadataFilled += take
          offset += take
          if (metadataFilled === metadataLen) {
            const json = DECODER.decode(metadataBuf)
            let parsed: EnvelopeMetadata
            try {
              parsed = JSON.parse(json) as EnvelopeMetadata
            } catch (e: any) {
              throw new Error(`metadata JSON parse failed: ${e.message}`)
            }
            await callbacks.onMetadata(parsed)
          }
        }

        if (offset < data.length && metadataBuf && metadataFilled === metadataLen) {
          await callbacks.onChunk(data.subarray(offset))
        }
      },
      onComplete: callbacks.onComplete,
    }, onProgress)

    if (metadataLen < 0 || metadataFilled < metadataLen) {
      throw new Error('stream ended before metadata header was complete')
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // URL fragment encoding (key + salt)
  // ────────────────────────────────────────────────────────────────────────

  /** Encode bytes as base64url with no padding. */
  static toBase64Url(bytes: Uint8Array): string {
    let s = ''
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }

  /** Decode base64url back to bytes (tolerates missing padding). */
  static fromBase64Url(s: string): Uint8Array {
    const pad = s.length % 4 === 0 ? 0 : 4 - (s.length % 4)
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad)
    const bin = atob(b64)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  }

  /**
   * Build a share URL. Key + salt go in the fragment (never sent to the
   * server). Filename and content-type are inside the encrypted envelope.
   * Format: `<base>/download/<id>#v=2&k=<base64url>&s=<base64url>`
   */
  static generateShareUrl(fileId: string, key: Uint8Array, salt: Uint8Array, baseUrl: string): string {
    const k = this.toBase64Url(key)
    const s = this.toBase64Url(salt)
    return `${baseUrl}/download/${fileId}#v=2&k=${k}&s=${s}`
  }

  /**
   * Read the v2 key + salt from the current URL fragment.
   * Returns `null` if the fragment is missing, malformed, or a v1 (legacy)
   * link from before the wire-format migration.
   */
  static extractKeysFromUrl(): { key: Uint8Array; salt: Uint8Array } | null {
    const fragment = window.location.hash.substring(1)
    const params = new URLSearchParams(fragment)
    if (params.get('v') !== '2') return null
    const k = params.get('k')
    const s = params.get('s')
    if (!k || !s) return null
    try {
      const key  = this.fromBase64Url(k)
      const salt = this.fromBase64Url(s)
      if (key.length !== KEY_LENGTH || salt.length !== SALT_LENGTH) return null
      return { key, salt }
    } catch {
      return null
    }
  }
}
