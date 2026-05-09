import { ClientCrypto } from './rfc8188'

/**
 * Optional sender identity — a long-lived Ed25519 keypair stored in
 * `localStorage`, used to sign an attestation over each upload. Recipients
 * see the sender's public-key fingerprint when verification succeeds and
 * can build trust over time by associating the fingerprint with a name
 * out-of-band ("the box that always sends me builds is Andrei's box").
 *
 * The identity is per-browser; uploading from a different browser/profile
 * yields a different identity unless the user explicitly exports/imports.
 *
 * Not a substitute for a real PKI. Useful as a "this came from the same
 * person who sent the previous link" signal when paired with a manually
 * verified first-contact fingerprint.
 */

const STORAGE_KEY = 'whirlcryptSenderIdentity'

export interface SenderIdentity {
  privateJwk: JsonWebKey
  publicJwk:  JsonWebKey
  pubkey:     Uint8Array  // raw 32-byte Ed25519 public key
}

interface StoredIdentity {
  privateJwk: JsonWebKey
  publicJwk:  JsonWebKey
  pubkeyB64u: string
  createdAt:  string
}

/** Load the sender identity from `localStorage`, or `null` if none exists. */
export async function loadSenderIdentity(): Promise<SenderIdentity | null> {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const stored = JSON.parse(raw) as StoredIdentity
    return {
      privateJwk: stored.privateJwk,
      publicJwk:  stored.publicJwk,
      pubkey:     ClientCrypto.fromBase64Url(stored.pubkeyB64u),
    }
  } catch {
    return null
  }
}

/** Create and persist a fresh Ed25519 identity. */
export async function createSenderIdentity(): Promise<SenderIdentity> {
  const keypair = (await crypto.subtle.generateKey(
    { name: 'Ed25519' } as any,
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair
  const privateJwk = await crypto.subtle.exportKey('jwk', keypair.privateKey)
  const publicJwk  = await crypto.subtle.exportKey('jwk', keypair.publicKey)
  if (!publicJwk.x) throw new Error('Ed25519 public JWK missing x')
  const pubkey = ClientCrypto.fromBase64Url(publicJwk.x)
  const stored: StoredIdentity = {
    privateJwk,
    publicJwk,
    pubkeyB64u: publicJwk.x,
    createdAt:  new Date().toISOString(),
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
  return { privateJwk, publicJwk, pubkey }
}

/** Get the existing identity, or create one if none exists. */
export async function loadOrCreateSenderIdentity(): Promise<SenderIdentity> {
  const existing = await loadSenderIdentity()
  if (existing) return existing
  return createSenderIdentity()
}

/** Permanently delete the local identity (e.g., for "rotate keys" UX). */
export function clearSenderIdentity(): void {
  localStorage.removeItem(STORAGE_KEY)
}

/**
 * Build the canonical attestation bytes that get signed/verified.
 * The pubkey is included to prevent signature reuse with a different
 * pubkey in the URL fragment.
 */
function attestationBytes(fileId: string, pubkey: Uint8Array): Uint8Array {
  const message = `whirlcrypt:v2|${fileId}|${ClientCrypto.toBase64Url(pubkey)}`
  return new TextEncoder().encode(message)
}

/** Sign an attestation over (fileId, pubkey) with the sender identity. */
export async function signAttestation(
  identity: SenderIdentity,
  fileId: string,
): Promise<Uint8Array> {
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    identity.privateJwk,
    { name: 'Ed25519' } as any,
    false,
    ['sign'],
  )
  const payload = attestationBytes(fileId, identity.pubkey)
  const sig = await crypto.subtle.sign('Ed25519', privateKey, payload as BufferSource)
  return new Uint8Array(sig)
}

/** Verify an attestation. Returns `true` iff the signature is valid. */
export async function verifyAttestation(
  fileId: string,
  pubkey: Uint8Array,
  signature: Uint8Array,
): Promise<boolean> {
  if (pubkey.length !== 32) return false
  if (signature.length !== 64) return false
  try {
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      { kty: 'OKP', crv: 'Ed25519', x: ClientCrypto.toBase64Url(pubkey) },
      { name: 'Ed25519' } as any,
      false,
      ['verify'],
    )
    const payload = attestationBytes(fileId, pubkey)
    return crypto.subtle.verify(
      'Ed25519',
      publicKey,
      signature as BufferSource,
      payload as BufferSource,
    )
  } catch {
    return false
  }
}

/**
 * Compute a stable display fingerprint for a pubkey: the first 8 bytes of
 * SHA-256, formatted as 4 groups of 4 hex characters separated by dashes
 * (e.g. `9b3e-4f12-a07c-d551`). 64 bits is enough for casual recognition.
 */
export async function fingerprint(pubkey: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', pubkey as BufferSource)
  const bytes = new Uint8Array(hash)
  let hex = ''
  for (let i = 0; i < 8; i++) hex += bytes[i].toString(16).padStart(2, '0')
  return hex.match(/.{4}/g)!.join('-')
}
