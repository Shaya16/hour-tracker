# Hour Tracker

A personal hour- and pay-tracker for people working more than one hourly job. Runs
offline, installs to your phone home screen, and syncs the same data between your phone
and your laptop. Free to host on Cloudflare.

---

## What it does

- **Timer** — one tap to clock in, with break/resume and a live earnings ticker that is
  already overtime-aware.
- **Shifts** — a week strip and day timeline; add or correct shifts by hand, because you
  *will* forget to press Start.
- **Quick log** — the app learns the shifts you work regularly and offers them as one-tap
  buttons, with undo. No templates to set up: the suggestions come from your own history,
  so they stay right when your schedule changes.
- **Reports** — hours and pay by week, month, or pay period, split by job, with a CSV
  export for checking against a payslip.
- **Overtime, done properly** — per job, per day. Two 5-hour shifts at the same job cross
  the 8-hour threshold; 5 hours at each of two jobs does not, because they are separate
  employers. This is the whole reason the app exists.
- **Offline-first** — everything is stored on the device and works with no signal. Sync
  is a background extra that can fail without ever blocking you.
- **Light and dark** — follows your system appearance, with a palette built for each
  rather than one filtered into the other.

---

## Quick start (local)

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173. The first screen asks for your jobs and rates.

Run the tests — the pay maths is the part that must be right:

```bash
npm test
```

---

## Deploying

See **[DEPLOY.md](DEPLOY.md)** for step-by-step instructions.

The short version: `npm run build`, then drag the `dist` folder onto the Cloudflare
dashboard. No CLI and no GitHub account needed — the sync API is compiled into
`dist/_worker.js`, which drag-and-drop supports (a `functions/` folder is not).

**A note on Node:** you are on Node 20.16.0. The app builds and runs fine there — that is
why it is pinned to Vite 6. But Cloudflare's `wrangler` CLI requires Node 22+, so the CLI
deploy route is unavailable until you upgrade. The drag-and-drop and GitHub routes both
work today.

## Install on your phone

Open the deployed URL in the phone browser and use **Add to Home Screen** (Share menu on
iOS, the ⋮ menu on Android). It then launches full-screen and works offline.

---

## How sync works

Every record carries an `id`, an `updatedAt`, and a `deleted` tombstone — nothing is ever
hard-deleted, so removals propagate instead of reappearing. On each sync the client pushes
what changed locally and pulls what changed on the server; both sides resolve conflicts by
**last-write-wins on `updatedAt`**, per record. Editing a Tuesday shift on your phone
never clobbers a Wednesday shift edited on your laptop.

The server keeps two timestamps per row, and the distinction is load-bearing:

- `updated_at` — the client's clock, used **only** to decide which version wins.
- `server_seq` — the server's clock at write time, used **only** as the pull cursor.

If the pull cursor used the client's own timestamp, a phone that had been offline for a
week would push edits stamped last Tuesday, the laptop's cursor would already be past
that, and those edits would never arrive. `server_seq` guarantees that anything newly
written is newly visible, no matter what any device thinks the time is.

Your passcode is stored only as a PBKDF2-SHA256 hash (100,000 iterations, random 16-byte
salt). There is no email and **no password reset** — if you lose the passcode you lose the
cloud copy, so keep a JSON backup (**Settings → Backup**).

---

## Cost

Comfortably inside Cloudflare's free tier, with no card required:

| | Free allowance | Two jobs, realistically |
| --- | --- | --- |
| D1 storage | 5 GB | a few MB after years |
| D1 rows written | 100,000/day | tens |
| D1 rows read | 5,000,000/day | hundreds |
| Pages Functions | 100,000 requests/day | tens |
| Static requests | unlimited | — |

---

## Project layout

```
src/lib/pay.ts        the pay & overtime engine — pure functions, heavily tested
src/lib/dates.ts      Sunday-start weeks, pay periods, DST-safe day keys
src/lib/store.ts      zustand store, persisted to localStorage
src/lib/sync.ts       background delta sync
src/lib/quicklog.ts   derives your usual shifts from history
src/screens/          Timer, Shifts, Reports, Settings
src/components/       UI primitives, charts, edit sheets
worker/               the sync API, bundled to dist/_worker.js at build time
migrations/           D1 schema
public/inter.woff2    Inter, subset to the glyphs the app uses
scripts/gen-icons.mjs regenerates the PWA icons
scripts/subset-font.py re-subsets Inter if the glyph set ever changes
```

## Adjusting overtime

**Settings → Jobs → (a job)**. Defaults are the Israeli norm — first 2 hours past 8h/day at
125%, beyond 10h/day at 150% — but every threshold and multiplier is editable, and
overtime can be switched off per job entirely.

Shabbat and holiday premium rates are **not** calculated automatically. Use the per-shift
**Extra pay** field for those.

---

## A caveat worth repeating

The figures are an estimate from the rates you type in. They do not model tax, national
insurance, pension deductions, or your employer's own rounding rules. Treat them as a way
to *check* a payslip and spot a discrepancy worth asking about — not as the payslip.

---

## Licence and credits

The app code is yours to do as you like with.

The bundled typeface is [Inter](https://github.com/rsms/inter) by Rasmus Andersson, used
under the SIL Open Font License 1.1 — full text in
[`public/inter-LICENSE.txt`](public/inter-LICENSE.txt). `public/inter.woff2` is a subset of
the original, produced by `scripts/subset-font.py`.
