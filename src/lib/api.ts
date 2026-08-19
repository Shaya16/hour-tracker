import type { Invoice, Job, Settings, Shift } from './types'

export interface AuthResponse {
  token: string
  username: string
}

export interface SyncResponse {
  now: number
  jobs: Job[]
  shifts: Shift[]
  invoices: Invoice[]
  settings: Settings | null
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, body: unknown, token?: string | null): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })
  } catch {
    // fetch only rejects on a transport failure, so this is genuinely "no network".
    throw new ApiError('No connection', 0)
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const data = (await res.json()) as { error?: string }
      if (data.error) message = data.error
    } catch {
      // Non-JSON error body — the status-based message is good enough.
    }
    throw new ApiError(message, res.status)
  }

  return (await res.json()) as T
}

export const api = {
  signup: (username: string, passcode: string) =>
    request<AuthResponse>('/api/signup', { username, passcode }),

  login: (username: string, passcode: string) =>
    request<AuthResponse>('/api/login', { username, passcode }),

  sync: (
    token: string,
    payload: {
      since: number
      jobs: Job[]
      shifts: Shift[]
      invoices: Invoice[]
      settings: Settings | null
    },
  ) => request<SyncResponse>('/api/sync', payload, token),
}
