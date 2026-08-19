/**
 * Auth primitives for the sync API.
 *
 * Split out from the route handler so they can be unit-tested directly — token forgery
 * and expiry are exactly the kind of thing that must not be verified by eyeballing it.
 *
 * The leading underscore keeps Pages from treating this file as a route.
 */

export const TOKEN_TTL_MS = 365 * 24 * 3600 * 1000
export const PBKDF2_ITERATIONS = 100_000

const enc = new TextEncoder()

export function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

/**
 * Constant-time string comparison.
 *
 * A plain `===` returns as soon as it finds a differing byte, so the time it takes leaks
 * how many leading characters were right — enough to reconstruct a token byte by byte.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function derivePasscode(passcode: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(passcode), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  )
  return toBase64(new Uint8Array(bits))
}

export async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  // base64url: no '+', '/' or '=' — and critically no '.', which is the token separator.
  return toBase64(new Uint8Array(sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function makeToken(secret: string, userId: string, now = Date.now()): Promise<string> {
  const payload = `${userId}.${now + TOKEN_TTL_MS}`
  return `${payload}.${await hmac(secret, payload)}`
}

/** Returns the user id, or null if the token is malformed, forged or expired. */
export async function verifyToken(
  secret: string,
  token: string,
  now = Date.now(),
): Promise<string | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [userId, expiryStr, sig] = parts as [string, string, string]
  if (!userId || !expiryStr || !sig) return null
  const payload = `${userId}.${expiryStr}`
  if (!timingSafeEqual(sig, await hmac(secret, payload))) return null
  const expiry = Number(expiryStr)
  if (!Number.isFinite(expiry) || expiry < now) return null
  return userId
}
