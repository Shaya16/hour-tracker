import { useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { AccountSheet } from '../components/AccountSheet'
import { ConfirmSheet } from '../components/ui/Sheet'
import {
  BriefcaseIcon,
  ChevronRight,
  CloudIcon,
  DownloadIcon,
  PlusIcon,
  UploadIcon,
} from '../components/ui/icons'
import {
  Button,
  Card,
  Divider,
  EmptyState,
  Field,
  Header,
  Input,
  Row,
  Screen,
  SectionTitle,
  Select,
  cx,
} from '../components/ui/primitives'
import { downloadFile, shiftsToCsv } from '../lib/csv'
import { money, parseNum } from '../lib/format'
import { computeBreakdowns } from '../lib/pay'
import { signOut, syncNow } from '../lib/sync'
import { allLiveJobs, jobsById, liveShifts, useStore } from '../lib/store'
import { useJobColors } from '../lib/hooks'
import { DEFAULT_SETTINGS, type Invoice, type Job, type PayPeriodKind, type Settings, type Shift } from '../lib/types'

const CURRENCIES = [
  { symbol: '₪', code: 'ILS', label: '₪ Shekel (ILS)' },
  { symbol: '$', code: 'USD', label: '$ Dollar (USD)' },
  { symbol: '€', code: 'EUR', label: '€ Euro (EUR)' },
  { symbol: '£', code: 'GBP', label: '£ Pound (GBP)' },
]

export function SettingsScreen({ onEditJob }: { onEditJob: (id: string) => void }) {
  const jobs = useStore((s) => s.jobs)
  const shifts = useStore((s) => s.shifts)
  const invoices = useStore((s) => s.invoices)
  const settings = useStore((s) => s.settings)
  const auth = useStore((s) => s.auth)
  const syncStatus = useStore((s) => s.syncStatus)
  const syncError = useStore((s) => s.syncError)
  const lastSyncedAt = useStore((s) => s.lastSyncedAt)
  const updateSettings = useStore((s) => s.updateSettings)
  const replaceAll = useStore((s) => s.replaceAll)
  const reset = useStore((s) => s.reset)

  const colors = useJobColors()
  const [accountOpen, setAccountOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const jobList = useMemo(() => allLiveJobs(jobs), [jobs])
  const byId = useMemo(() => jobsById(jobs), [jobs])
  const shiftCount = useMemo(() => liveShifts(shifts).length, [shifts])

  function exportJson() {
    const payload = {
      version: 2,
      exportedAt: new Date().toISOString(),
      jobs: jobs.filter((j) => !j.deleted),
      shifts: shifts.filter((s) => !s.deleted),
      invoices: invoices.filter((i) => !i.deleted),
      settings,
    }
    downloadFile(
      `hour-tracker-backup-${format(Date.now(), 'yyyy-MM-dd')}.json`,
      JSON.stringify(payload, null, 2),
      'application/json',
    )
  }

  function exportAllCsv() {
    const all = liveShifts(shifts)
    const breakdowns = computeBreakdowns(all, byId, Date.now())
    downloadFile(`hour-tracker-all-${format(Date.now(), 'yyyy-MM-dd')}.csv`, shiftsToCsv(all, breakdowns, byId, settings))
  }

  async function importJson(file: File) {
    try {
      const text = await file.text()
      const data = JSON.parse(text) as {
        jobs?: Job[]
        shifts?: Shift[]
        invoices?: Invoice[]
        settings?: Settings
      }
      if (!Array.isArray(data.jobs) || !Array.isArray(data.shifts)) {
        setImportMsg('That file does not look like a Hour Tracker backup.')
        return
      }
      replaceAll({
        jobs: data.jobs,
        shifts: data.shifts,
        // Backups written before invoicing existed simply have none.
        invoices: data.invoices ?? [],
        settings: data.settings ? { ...DEFAULT_SETTINGS, ...data.settings } : undefined,
      })
      setImportMsg(`Restored ${data.jobs.length} jobs and ${data.shifts.length} shifts.`)
    } catch {
      setImportMsg('Could not read that file.')
    }
  }

  const syncLabel =
    syncStatus === 'syncing'
      ? 'Syncing…'
      : syncStatus === 'offline'
        ? 'Offline — will sync later'
        : syncStatus === 'error'
          ? (syncError ?? 'Sync error')
          : lastSyncedAt > 0
            ? `Last synced ${format(lastSyncedAt, 'MMM d, HH:mm')}`
            : 'Not synced yet'

  return (
    <Screen>
      <Header title="Settings" />

      {/* Jobs */}
      <SectionTitle
        action={
          <Button size="sm" variant="soft" onClick={() => onEditJob('new')}>
            <PlusIcon size={16} /> Add
          </Button>
        }
      >
        Jobs
      </SectionTitle>
      <Card className="px-4">
        {jobList.length === 0 ? (
          <EmptyState
            icon={<BriefcaseIcon size={36} />}
            title="No jobs yet"
            body="Add each job with its hourly rate so your pay can be worked out."
            action={
              <Button onClick={() => onEditJob('new')}>
                <PlusIcon size={18} /> Add a job
              </Button>
            }
          />
        ) : (
          jobList.map((j, i) => (
            <div key={j.id}>
              {i > 0 ? <Divider /> : null}
              <Row
                label={
                  <span className="flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-full shrink-0"
                      style={{ background: colors[j.color].hex }}
                    />
                    {j.name}
                  </span>
                }
                sub={`${money(j.rateAgorot, settings.currencySymbol)}/hr${
                  j.overtimeEnabled
                    ? ` · OT after ${j.otTier1AfterMins / 60}h`
                    : ' · no overtime'
                }`}
                onClick={() => onEditJob(j.id)}
              >
                <ChevronRight size={18} className="text-faint" />
              </Row>
            </div>
          ))
        )}
      </Card>

      {/* Sync */}
      <SectionTitle>Sync across devices</SectionTitle>
      <Card className="px-4">
        <Row
          label={auth.token ? `Signed in as ${auth.username}` : 'Not signed in'}
          sub={auth.token ? syncLabel : 'Sign in to use the same data on your phone and laptop'}
          onClick={() => setAccountOpen(true)}
        >
          <span
            className={cx(
              'size-2.5 rounded-full',
              syncStatus === 'ok'
                ? 'bg-green'
                : syncStatus === 'syncing'
                  ? 'bg-orange animate-pulse'
                  : syncStatus === 'error'
                    ? 'bg-red'
                    : 'bg-faint',
            )}
          />
          <ChevronRight size={18} className="text-faint" />
        </Row>
        {auth.token ? (
          <>
            <Divider />
            <div className="flex gap-2 py-3">
              <Button variant="soft" className="flex-1" onClick={() => void syncNow(true)}>
                <CloudIcon size={18} /> Sync now
              </Button>
              <Button variant="ghost" onClick={signOut}>
                Sign out
              </Button>
            </div>
          </>
        ) : null}
      </Card>

      {/* Preferences */}
      <SectionTitle>Preferences</SectionTitle>
      <Card className="p-4 flex flex-col gap-4">
        <Field label="Currency">
          <Select
            value={settings.currencyCode}
            onChange={(e) => {
              const c = CURRENCIES.find((x) => x.code === e.target.value)
              if (c) updateSettings({ currencySymbol: c.symbol, currencyCode: c.code })
            }}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Week starts on">
          <Select
            value={String(settings.weekStartsOn)}
            onChange={(e) => updateSettings({ weekStartsOn: e.target.value === '1' ? 1 : 0 })}
          >
            <option value="0">Sunday</option>
            <option value="1">Monday</option>
          </Select>
        </Field>

        <Field label="Pay period">
          <Select
            value={settings.payPeriod}
            onChange={(e) => updateSettings({ payPeriod: e.target.value as PayPeriodKind })}
          >
            <option value="weekly">Weekly</option>
            <option value="biweekly">Every 2 weeks</option>
            <option value="monthly">Monthly</option>
          </Select>
        </Field>

        {settings.payPeriod === 'biweekly' ? (
          <Field label="A period started on" hint="Used to line the 2-week cycle up with your payroll">
            <Input
              type="date"
              value={settings.payPeriodAnchor}
              onChange={(e) => updateSettings({ payPeriodAnchor: e.target.value })}
            />
          </Field>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Weekly goal (hours)">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              value={settings.weeklyGoalHours}
              onChange={(e) => updateSettings({ weeklyGoalHours: Math.max(0, parseNum(e.target.value, 0)) })}
            />
          </Field>
          <Field label="Target shift (hours)" hint="Drives the timer ring">
            <Input
              type="number"
              inputMode="decimal"
              min={1}
              value={settings.targetShiftHours}
              onChange={(e) =>
                updateSettings({ targetShiftHours: Math.max(1, parseNum(e.target.value, 8)) })
              }
            />
          </Field>
        </div>
      </Card>

      {/* Backup */}
      <SectionTitle>Backup</SectionTitle>
      <Card className="p-4 flex flex-col gap-2">
        <Button variant="soft" className="w-full" onClick={exportJson}>
          <DownloadIcon size={18} /> Export backup (JSON)
        </Button>
        <Button variant="soft" className="w-full" onClick={exportAllCsv}>
          <DownloadIcon size={18} /> Export all shifts (CSV)
        </Button>
        <Button variant="soft" className="w-full" onClick={() => fileRef.current?.click()}>
          <UploadIcon size={18} /> Restore from backup
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void importJson(f)
            e.target.value = ''
          }}
        />
        {importMsg ? <p className="t-small text-muted px-1 pt-1">{importMsg}</p> : null}
        <p className="t-small text-muted px-1 pt-1 leading-relaxed">
          Restoring replaces everything currently on this device.
        </p>
      </Card>

      {/* Danger zone */}
      <Card className="px-4 mt-4">
        <Row label="Erase all data" sub={`${jobList.length} jobs · ${shiftCount} shifts`}>
          <Button variant="danger" size="sm" onClick={() => setConfirmReset(true)}>
            Erase
          </Button>
        </Row>
      </Card>

      <p className="t-small text-muted text-center mt-8">Hour Tracker · v1.0</p>

      <AccountSheet open={accountOpen} onClose={() => setAccountOpen(false)} />

      <ConfirmSheet
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={reset}
        title="Erase everything?"
        body="All jobs and shifts on this device will be deleted. Export a backup first if you might want them back."
        confirmLabel="Erase all"
      />
    </Screen>
  )
}
