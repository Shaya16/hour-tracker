# Putting Hour Tracker on Cloudflare

Three ways to do this. **Option A needs no CLI, no GitHub account, and works on your
current Node version** — start there.

Everything below is free. No card required.

---

## Option A — Drag and drop (10 minutes, no CLI)

### Step 1 — Build the app

In the project folder:

```bash
npm run build
```

That produces a `dist` folder. It contains the whole app *and* `_worker.js`, which is the
sync API compiled into a single file — that file is why drag-and-drop can give you working
sync, which a normal Pages setup cannot.

### Step 2 — Create the Pages project

1. Go to **dash.cloudflare.com** and sign up or log in.
2. Left sidebar → **Compute (Workers & Pages)**.
3. **Create** → **Pages** tab → **Upload assets**.
4. Name it `hour-tracker` → **Create project**.
5. Drag the whole **`dist` folder** onto the upload area.
6. **Deploy site**.

You now have a live URL like `hour-tracker.pages.dev`. **Open it — the app already works.**
Timer, shifts, reports, CSV export: all of it, on the device you opened it on.

The remaining steps only add sync between your phone and laptop.

### Step 3 — Create the database

1. Sidebar → **Storage & Databases** → **D1 SQL Database**.
2. **Create database**, name it `hour-tracker`, **Create**.
3. Open it → **Console** tab.
4. Open `migrations/0001_init.sql` from the project, copy **all** of it, paste it into the
   console, and run it.

You should see the tables `users`, `jobs`, `shifts`, `settings` appear under **Tables**.

### Step 4 — Connect the database to the app

1. Sidebar → **Compute (Workers & Pages)** → your `hour-tracker` project.
2. **Settings** → **Bindings** → **Add** → **D1 database**.
3. Variable name: **`DB`** — exactly that, uppercase. The code looks for `env.DB`, and any
   other name silently fails at sign-in.
4. D1 database: `hour-tracker` → **Save**.

### Step 5 — Add the secret

Still in **Settings** → **Variables and Secrets** → **Add**:

- Type: **Secret** (not plaintext)
- Name: **`AUTH_SECRET`**
- Value: a long random string. Generate one:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Save.

### Step 6 — Redeploy so the bindings take effect

Bindings only attach to *new* deployments. Go to **Deployments**, find the latest one, and
use **Retry deployment** — or just drag `dist` in again.

### Step 7 — Sign in

Open your URL → **Settings** → **Sync across devices** → **Create account**. Pick any
username and passcode. Then do the same on your phone with the *same* details, and the two
stay in step.

### Updating later

Re-run `npm run build`, then drag `dist` in again. The database, binding and secret all
persist — you never repeat steps 3–5.

---

## Option B — GitHub, auto-deploy on every commit

Better once you are changing the app regularly: push, and it deploys itself.

```bash
git init && git add -A && git commit -m "Hour Tracker"
```

Create an empty repo on GitHub, then:

```bash
git remote add origin https://github.com/YOUR-NAME/hour-tracker.git && git branch -M main && git push -u origin main
```

In the dashboard: **Compute** → **Create** → **Pages** → **Connect to Git**, pick the repo,
and set:

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Build output directory | `dist` |

Then follow **Steps 3–6** above to add the database, binding and secret.

The repo includes `.node-version` pinning Node 22, so Cloudflare's builder uses a version
that satisfies every dependency — regardless of what you have locally.

---

## Option C — Wrangler CLI

**Requires Node 22+. You are on 20.16.0, so this will not run until you upgrade.**

```bash
npx wrangler d1 create hour-tracker
```

Paste the printed `database_id` into `wrangler.toml`, then:

```bash
npx wrangler d1 migrations apply hour-tracker --remote
```

```bash
npx wrangler pages secret put AUTH_SECRET
```

```bash
npm run pages:deploy
```

---

## Install it on your phone

Open the deployed URL in your phone's browser:

- **iPhone** — Share button → **Add to Home Screen**
- **Android** — ⋮ menu → **Install app** / **Add to Home screen**

It then opens full-screen with no browser chrome, and works with no signal.

---

## If something goes wrong

**"Server is missing its D1 binding"** on sign-in
The binding is missing or misnamed. It must be exactly `DB`, and you must redeploy after
adding it (Step 6).

**"Server is missing AUTH_SECRET"**
Step 5 was skipped, the value is under 16 characters, or you added it after the last
deployment. Add it, then redeploy.

**Sign-in does nothing / network error**
Confirm `_worker.js` is present in the `dist` folder you uploaded. If it is missing, the
build did not finish — re-run `npm run build` and check for errors.

**Sync works on one device but not the other**
Both devices need the *same* username and passcode. There is no password reset, so if the
passcode is lost, use **Settings → Backup → Export backup** on the working device and
restore it on the other.

**The app works but the phone shows old data**
Pull down to refresh, or close and reopen it. The service worker updates in the background
and applies on next launch.
