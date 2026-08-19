/**
 * Hour Tracker sync API — three endpoints: POST /api/signup, /api/login, /api/sync.
 *
 * Single-user-per-account by design. There is no email, no reset flow and no sharing,
 * so the whole surface is one password hash and one merge routine.
 *
 * Exposed as a plain (request, env) handler so it can be mounted inside `_worker.js`.
 * That matters practically: a `functions/` folder is only compiled by Wrangler or the
 * Git integration, whereas a bundled `_worker.js` also works with dashboard
 * drag-and-drop — the one deploy route that needs no CLI and no GitHub account.
 */

import { derivePasscode, fromBase64, makeToken, timingSafeEqual, toBase64, verifyToken } from './auth'

export interface Env {
  DB: D1Database
  /** Static asset server, bound automatically in _worker.js advanced mode. */
  ASSETS: { fetch: (request: Request) => Promise<Response> }
  /** HMAC key for session tokens. Set in the dashboard under Variables and Secrets. */
  AUTH_SECRET?: string
}

const MAX_FAILED_ATTEMPTS = 10
const LOCKOUT_MS = 15 * 60 * 1000
/** Guards against a malformed or hostile client pushing an unbounded payload. */
const MAX_RECORDS_PER_SYNC = 5000

// ---- helpers ---------------------------------------------------------------

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

const fail = (message: string, status: number) => json({ error: message }, status)

function authSecret(env: Env): string | null {
  const s = env.AUTH_SECRET
  return s && s.length >= 16 ? s : null
}

async function requireUser(request: Request, secret: string): Promise<string | null> {
  const header = request.headers.get('Authorization') ?? ''
  if (!header.startsWith('Bearer ')) return null
  return verifyToken(secret, header.slice(7))
}

async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T
  } catch {
    return null
  }
}

// ---- record shapes ---------------------------------------------------------

interface SyncRecord {
  id: string
  updatedAt: number
  [key: string]: unknown
}

/**
 * Reject anything that is not a usable record before it reaches SQL.
 * The ids become primary keys, so an empty or absurdly long one is a real problem.
 */
function validRecords(input: unknown): SyncRecord[] {
  if (!Array.isArray(input)) return []
  const out: SyncRecord[] = []
  for (const r of input) {
    if (!r || typeof r !== 'object') continue
    const rec = r as SyncRecord
    if (typeof rec.id !== 'string' || rec.id.length === 0 || rec.id.length > 128) continue
    if (typeof rec.updatedAt !== 'number' || !Number.isFinite(rec.updatedAt)) continue
    out.push(rec)
    if (out.length >= MAX_RECORDS_PER_SYNC) break
  }
  return out
}

// ---- handlers --------------------------------------------------------------

async function handleAuth(request: Request, env: Env, mode: 'signup' | 'login'): Promise<Response> {
  const secret = authSecret(env)
  if (!secret) {
    return fail(
      'Server is missing AUTH_SECRET. Run: wrangler pages secret put AUTH_SECRET',
      500,
    )
  }

  const body = await readJson<{ username?: unknown; passcode?: unknown }>(request)
  const username = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : ''
  const passcode = typeof body?.passcode === 'string' ? body.passcode : ''

  if (!/^[a-z0-9._-]{3,32}$/.test(username)) return fail('Invalid username', 400)
  if (passcode.length < 6 || passcode.length > 256) {
    return fail('Passcode must be at least 6 characters', 400)
  }

  const db = env.DB
  const existing = await db
    .prepare('SELECT id, salt, hash, failed_attempts, locked_until FROM users WHERE username = ?')
    .bind(username)
    .first<{
      id: string
      salt: string
      hash: string
      failed_attempts: number
      locked_until: number
    }>()

  if (mode === 'signup') {
    if (existing) return fail('That username is taken', 409)
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const hash = await derivePasscode(passcode, salt)
    const id = crypto.randomUUID()
    await db
      .prepare('INSERT INTO users (id, username, salt, hash, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(id, username, toBase64(salt), hash, Date.now())
      .run()
    return json({ token: await makeToken(secret, id), username })
  }

  // Same message whether the user exists or the passcode is wrong, so the response
  // cannot be used to enumerate accounts.
  const invalid = () => fail('Wrong username or passcode', 401)
  if (!existing) return invalid()

  if (existing.locked_until > Date.now()) {
    const mins = Math.ceil((existing.locked_until - Date.now()) / 60_000)
    return fail(`Too many attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`, 429)
  }

  const attempt = await derivePasscode(passcode, fromBase64(existing.salt))
  if (!timingSafeEqual(attempt, existing.hash)) {
    const attempts = existing.failed_attempts + 1
    const lockUntil = attempts >= MAX_FAILED_ATTEMPTS ? Date.now() + LOCKOUT_MS : 0
    await db
      .prepare('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?')
      .bind(attempts >= MAX_FAILED_ATTEMPTS ? 0 : attempts, lockUntil, existing.id)
      .run()
    return invalid()
  }

  if (existing.failed_attempts !== 0 || existing.locked_until !== 0) {
    await db
      .prepare('UPDATE users SET failed_attempts = 0, locked_until = 0 WHERE id = ?')
      .bind(existing.id)
      .run()
  }

  return json({ token: await makeToken(secret, existing.id), username })
}

async function handleSync(request: Request, env: Env): Promise<Response> {
  const secret = authSecret(env)
  if (!secret) return fail('Server is missing AUTH_SECRET', 500)

  const userId = await requireUser(request, secret)
  if (!userId) return fail('Not signed in', 401)

  const body = await readJson<{
    since?: unknown
    jobs?: unknown
    shifts?: unknown
    settings?: unknown
  }>(request)
  if (!body) return fail('Invalid request body', 400)

  const since = typeof body.since === 'number' && Number.isFinite(body.since) ? body.since : 0
  const jobs = validRecords(body.jobs)
  const shifts = validRecords(body.shifts)
  const db = env.DB
  const nowTs = Date.now()

  // --- push -----------------------------------------------------------------
  // The WHERE clause is the conflict resolution: an older edit arriving late is
  // written only if nothing newer is already stored.
  const statements: D1PreparedStatement[] = []

  const upsert = (table: 'jobs' | 'shifts', rec: SyncRecord) =>
    db
      .prepare(
        `INSERT INTO ${table} (id, user_id, data, updated_at, server_seq)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT (user_id, id) DO UPDATE SET
           data = excluded.data,
           updated_at = excluded.updated_at,
           server_seq = excluded.server_seq
         WHERE excluded.updated_at > ${table}.updated_at`,
      )
      .bind(rec.id, userId, JSON.stringify(rec), rec.updatedAt, nowTs)

  for (const j of jobs) statements.push(upsert('jobs', j))
  for (const s of shifts) statements.push(upsert('shifts', s))

  const settings = body.settings
  if (settings && typeof settings === 'object') {
    const rec = settings as { updatedAt?: unknown }
    if (typeof rec.updatedAt === 'number' && Number.isFinite(rec.updatedAt)) {
      statements.push(
        db
          .prepare(
            `INSERT INTO settings (user_id, data, updated_at, server_seq)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT (user_id) DO UPDATE SET
               data = excluded.data,
               updated_at = excluded.updated_at,
               server_seq = excluded.server_seq
             WHERE excluded.updated_at > settings.updated_at`,
          )
          .bind(userId, JSON.stringify(settings), rec.updatedAt, nowTs),
      )
    }
  }

  if (statements.length > 0) await db.batch(statements)

  // --- pull -----------------------------------------------------------------
  // `>=` rather than `>` deliberately: it re-sends whatever sits exactly on the cursor,
  // which is a handful of rows, in exchange for never dropping a write that landed in
  // the same millisecond as the previous response. Re-delivery is harmless because the
  // client merges by last-write-wins.
  const [jobRows, shiftRows, settingsRow] = await Promise.all([
    db
      .prepare('SELECT data FROM jobs WHERE user_id = ? AND server_seq >= ?')
      .bind(userId, since)
      .all<{ data: string }>(),
    db
      .prepare('SELECT data FROM shifts WHERE user_id = ? AND server_seq >= ?')
      .bind(userId, since)
      .all<{ data: string }>(),
    db
      .prepare('SELECT data FROM settings WHERE user_id = ? AND server_seq >= ?')
      .bind(userId, since)
      .first<{ data: string }>(),
  ])

  const parse = (rows: { data: string }[]) => {
    const out: unknown[] = []
    for (const r of rows) {
      try {
        out.push(JSON.parse(r.data))
      } catch {
        // A corrupt row must not take the whole sync down.
      }
    }
    return out
  }

  let parsedSettings: unknown = null
  if (settingsRow) {
    try {
      parsedSettings = JSON.parse(settingsRow.data)
    } catch {
      parsedSettings = null
    }
  }

  return json({
    now: nowTs,
    jobs: parse(jobRows.results ?? []),
    shifts: parse(shiftRows.results ?? []),
    settings: parsedSettings,
  })
}

// ---- router ----------------------------------------------------------------

/** Handles /api/*. Returns null when the path is not an API route. */
export async function handleApi(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/api/') && url.pathname !== '/api') return null

  const path = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '')

  if (request.method !== 'POST') return fail('Method not allowed', 405)
  if (!env.DB) return fail('Server is missing its D1 binding. See the README setup steps.', 500)

  try {
    if (path === 'signup') return await handleAuth(request, env, 'signup')
    if (path === 'login') return await handleAuth(request, env, 'login')
    if (path === 'sync') return await handleSync(request, env)
    return fail('Not found', 404)
  } catch (err) {
    console.error('api error', err)
    return fail('Server error', 500)
  }
}
