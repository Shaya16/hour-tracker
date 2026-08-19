import { describe, expect, it } from 'vitest'
import {
  derivePasscode,
  fromBase64,
  hmac,
  makeToken,
  timingSafeEqual,
  toBase64,
  TOKEN_TTL_MS,
  verifyToken,
} from './auth'

const SECRET = 'test-secret-at-least-16-chars-long'
const OTHER_SECRET = 'a-completely-different-secret-key'
const USER = '5f8d0c1e-2a3b-4c5d-6e7f-8a9b0c1d2e3f'

describe('base64 round-trip', () => {
  it('survives arbitrary bytes', () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255, 42, 200])
    expect([...fromBase64(toBase64(bytes))]).toEqual([...bytes])
  })

  it('handles random salts of the size we actually use', () => {
    const salt = crypto.getRandomValues(new Uint8Array(16))
    expect([...fromBase64(toBase64(salt))]).toEqual([...salt])
  })
})

describe('timingSafeEqual', () => {
  it('matches identical strings', () => {
    expect(timingSafeEqual('abc123', 'abc123')).toBe(true)
  })

  it('rejects different strings of equal length', () => {
    expect(timingSafeEqual('abc123', 'abc124')).toBe(false)
  })

  it('rejects different lengths', () => {
    expect(timingSafeEqual('abc', 'abcd')).toBe(false)
  })

  it('rejects a correct prefix', () => {
    expect(timingSafeEqual('secret', 'secret-more')).toBe(false)
  })
})

describe('derivePasscode', () => {
  it('is deterministic for the same passcode and salt', async () => {
    const salt = new Uint8Array(16).fill(7)
    expect(await derivePasscode('hunter2!', salt)).toBe(await derivePasscode('hunter2!', salt))
  })

  it('differs for a different passcode', async () => {
    const salt = new Uint8Array(16).fill(7)
    expect(await derivePasscode('hunter2!', salt)).not.toBe(await derivePasscode('hunter3!', salt))
  })

  it('differs for the same passcode under a different salt', async () => {
    const a = await derivePasscode('hunter2!', new Uint8Array(16).fill(1))
    const b = await derivePasscode('hunter2!', new Uint8Array(16).fill(2))
    expect(a).not.toBe(b)
  })

  it('produces a 256-bit digest', async () => {
    const hash = await derivePasscode('x', new Uint8Array(16))
    expect(fromBase64(hash).length).toBe(32)
  })
})

describe('hmac', () => {
  it('never emits a dot, which would break token parsing', async () => {
    // Tokens are split on '.', so a signature containing one would silently corrupt
    // the userId/expiry split and could be exploitable.
    for (let i = 0; i < 50; i++) {
      const sig = await hmac(SECRET, `payload-${i}-${Math.random()}`)
      expect(sig).not.toContain('.')
      expect(sig).toMatch(/^[A-Za-z0-9_-]+$/)
    }
  })

  it('changes with the secret', async () => {
    expect(await hmac(SECRET, 'msg')).not.toBe(await hmac(OTHER_SECRET, 'msg'))
  })
})

describe('token round-trip', () => {
  it('verifies a freshly minted token', async () => {
    const token = await makeToken(SECRET, USER)
    expect(await verifyToken(SECRET, token)).toBe(USER)
  })

  it('rejects a token signed with a different secret', async () => {
    const token = await makeToken(OTHER_SECRET, USER)
    expect(await verifyToken(SECRET, token)).toBeNull()
  })

  it('rejects a tampered user id', async () => {
    const token = await makeToken(SECRET, USER)
    const [, expiry, sig] = token.split('.')
    const forged = `attacker-id.${expiry}.${sig}`
    expect(await verifyToken(SECRET, forged)).toBeNull()
  })

  it('rejects an extended expiry', async () => {
    // The obvious attack: keep the signature, push the expiry out.
    const token = await makeToken(SECRET, USER)
    const [id, , sig] = token.split('.')
    const forged = `${id}.${Date.now() + 10 * TOKEN_TTL_MS}.${sig}`
    expect(await verifyToken(SECRET, forged)).toBeNull()
  })

  it('rejects a flipped signature byte', async () => {
    const token = await makeToken(SECRET, USER)
    const [id, expiry, sig] = token.split('.')
    const flipped = (sig![0] === 'A' ? 'B' : 'A') + sig!.slice(1)
    expect(await verifyToken(SECRET, `${id}.${expiry}.${flipped}`)).toBeNull()
  })

  it('rejects an expired token', async () => {
    const issuedAt = Date.now() - 2 * TOKEN_TTL_MS
    const token = await makeToken(SECRET, USER, issuedAt)
    expect(await verifyToken(SECRET, token)).toBeNull()
  })

  it('accepts a token that has not quite expired', async () => {
    const issuedAt = Date.now() - TOKEN_TTL_MS + 60_000
    const token = await makeToken(SECRET, USER, issuedAt)
    expect(await verifyToken(SECRET, token)).toBe(USER)
  })

  it.each([
    ['empty', ''],
    ['no separators', 'garbage'],
    ['too few parts', 'a.b'],
    ['too many parts', 'a.b.c.d'],
    ['empty fields', '..'],
    ['non-numeric expiry', `${USER}.not-a-number.sig`],
  ])('rejects a malformed token (%s)', async (_label, token) => {
    expect(await verifyToken(SECRET, token)).toBeNull()
  })
})
