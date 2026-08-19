import { useState } from 'react'
import { Sheet } from './ui/Sheet'
import { Button, Field, Input, Segmented } from './ui/primitives'
import { signIn } from '../lib/sync'
import { useStore } from '../lib/store'

/**
 * Sign-in / sign-up for cross-device sync.
 *
 * One account, one person. There is no email and no password reset — losing the passcode
 * means losing the cloud copy, which is why the sheet points at the JSON backup too.
 */
export function AccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const auth = useStore((s) => s.auth)
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [username, setUsername] = useState('')
  const [passcode, setPasscode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const validUsername = /^[a-zA-Z0-9._-]{3,32}$/.test(username.trim())
  const validPasscode = passcode.length >= 6
  const canSubmit = validUsername && validPasscode && !busy

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await signIn(username.trim().toLowerCase(), passcode, mode)
      setPasscode('')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  if (auth.token) {
    return (
      <Sheet open={open} onClose={onClose} title="Account">
        <div className="pt-2 pb-4">
          <p className="text-[15px]">
            Signed in as <span className="font-bold">{auth.username}</span>.
          </p>
          <p className="text-[13px] text-muted mt-2 leading-relaxed">
            Your shifts sync automatically whenever you have a connection. Sign in with the same
            username and passcode on your other device to see the same data there.
          </p>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={mode === 'login' ? 'Sign in' : 'Create account'}
      footer={
        <Button size="lg" className="w-full" onClick={() => void submit()} disabled={!canSubmit}>
          {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pt-1">
        <Segmented
          options={[
            { value: 'login', label: 'Sign in' },
            { value: 'signup', label: 'Create account' },
          ]}
          value={mode}
          onChange={(v) => {
            setMode(v)
            setError(null)
          }}
        />

        <p className="text-[13px] text-muted leading-relaxed">
          {mode === 'signup'
            ? 'Pick any username and passcode. There is no email and no password reset, so write the passcode down somewhere safe.'
            : 'Use the same details on every device to keep them in sync.'}
        </p>

        <Field
          label="Username"
          hint={username && !validUsername ? '3–32 letters, numbers, dot, dash or underscore' : undefined}
        >
          <Input
            type="text"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="username"
            placeholder="shay"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </Field>

        <Field label="Passcode" hint={passcode && !validPasscode ? 'At least 6 characters' : undefined}>
          <Input
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            placeholder="••••••"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit()
            }}
          />
        </Field>

        {error ? (
          <div className="text-[13px] text-red bg-[#FDE8E8] rounded-[var(--radius-inner)] px-3 py-2.5">
            {error}
          </div>
        ) : null}

        <p className="text-[12px] text-faint leading-relaxed">
          Your data stays on this device either way — signing in only adds a synced copy so your
          phone and laptop stay in step.
        </p>
      </div>
    </Sheet>
  )
}
