# Runbook

What this tool is, how it fits together, and the problems we have actually hit
with their fixes. Written 2026-07-24.

---

## What the tool does

A small internal dashboard that fires an n8n email-warmup workflow on demand,
and shows what that workflow has been doing.

The n8n workflow reads a Google Sheet and emails **everyone it finds in the
`Accounts` tab**. It has no concept of picking recipients. The app works around
that: it keeps its own master list and rewrites `Accounts` with only the
selected addresses immediately before firing the webhook. n8n itself is
unmodified.

Live at `https://octane-8-warming-tool.vercel.app`.

### Pages

- `/` — the dashboard. Two trigger cards, one per sender. A count stepper and a
  Trigger button, plus a 15-second lockout after each run to stop double-fires.
- `/accounts` — recipient manager plus read-only views of the Sending Log and
  Replies. This is where addresses are added and ticked.
- `/login` — single shared username/password gate. Everything except the login
  routes and the n8n completion callback sits behind it (`src/middleware.ts`).

### Spreadsheet tabs

| Tab | Who writes it | Notes |
|---|---|---|
| `Recipients` | the app | The durable master list. **Never cleared automatically.** Created and seeded from `Accounts` the first time the Accounts page loads. |
| `Accounts` | the app, every trigger | n8n's input. **Overwritten on each trigger** with just the selected addresses. Do not hand-edit; changes are lost on the next run. |
| `Sending Log` | n8n | Also read by n8n's randomiser to avoid re-emailing someone within 24h. |
| `Replies` | n8n | |

The spreadsheet ID is hardcoded at `src/lib/sheets.ts:5`.

### Environment variables

All are set in Vercel for Production and Preview.

| Variable | Purpose |
|---|---|
| `APP_USERNAME`, `APP_PASSWORD` | The shared login. |
| `AUTH_SESSION_SECRET` | Salts the session cookie value. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Identify the OAuth *app*, not the account. |
| `GOOGLE_REDIRECT_URI` | Must exactly equal `https://octane-8-warming-tool.vercel.app/api/auth/google/callback` **and** be registered in Cloud Console. |
| `GOOGLE_REFRESH_TOKEN` | Identifies the *account*. This is the one that expires. |
| `N8N_WEBHOOK_URL` | Where a trigger POSTs. |
| `N8N_COMPLETE_SECRET` | Guards the callback n8n uses to unlock a sender early. |

**Vercel bakes environment variables at build time.** Editing a variable does
nothing until you redeploy. This has cost us time more than once.

---

## Diagnosing a 500 from the API

Every Sheets-backed route (`/api/recipients`, `/api/replies`,
`/api/sending-log`) goes through the same auth layer, so they fail together.
Seeing all three fail at once points at credentials, not at any one feature.

**Read the response body, not the status code.** The browser console only shows
`500`; the body carries Google's actual error. DevTools → Network → click the
request → Response.

Then check `https://octane-8-warming-tool.vercel.app/api/auth/google/status`,
which reports whether `GOOGLE_REFRESH_TOKEN` reaches the runtime at all —
independent of whether it is still valid. Those two facts together identify the
problem:

| `status` | Body contains | Cause | Fix |
|---|---|---|---|
| `connected: false` | `GOOGLE_REFRESH_TOKEN is not set` | Variable never reached the running build | Redeploy |
| `connected: true` | `invalid_grant` | Token expired or revoked | Re-authorise, and publish the consent screen |
| `connected: true` | `invalid_client` | Token does not match the client ID/secret | OAuth client was rotated or replaced |
| `connected: true` | `caller does not have permission` | Token valid, but that account cannot open the sheet | Share the sheet with it as **Editor** |
| `connected: true` | `Requested entity was not found` | Wrong spreadsheet ID for that account | Check `sheets.ts:5` |

---

## Issues we have actually hit

### Everything returned `invalid_grant` after six days

**Symptom.** All three Sheets routes returned 500. `status` said
`connected: true`, so the variable was present; the body said `invalid_grant`.

**Cause.** The credentials were added Jul 18 and broke Jul 24. Google expires
refresh tokens after **7 days** when the OAuth consent screen is still in
**Testing** mode.

**Fix.** Publish the consent screen — Cloud Console → APIs & Services → OAuth
consent screen → **Publish app** (Testing → In production) — *then* re-authorise.
Publishing first matters: a token minted while still in Testing dies in another
7 days. With only the `spreadsheets` scope on your own data, publishing does not
require Google's verification review; you get a clickable "unverified app"
warning.

**Watch for.** n8n holds its own separate Google credential, very likely
connected on the same day and expiring on the same clock. Publishing fixes the
root cause for both, but n8n still has to be reconnected once.

### OAuth redirected to `localhost:3000`

**Symptom.** Starting the connect flow on production bounced to
`localhost:3000`, and the callback then failed with `?error=missing_code`.

**Cause.** `GOOGLE_REDIRECT_URI` in Vercel still pointed at localhost. Adding the
production URL to Cloud Console does **not** fix this — Cloud Console is only an
allowlist of permitted destinations. The URL actually requested comes from the
env var, which `googleAuth.ts` passes into the OAuth client and
`generateAuthUrl()` embeds as `redirect_uri`.

**Fix.** Set the env var to the production callback URL, register the same
string in Cloud Console, and **redeploy**.

**How to verify quickly.** On Google's consent screen, look at the address bar.
The `redirect_uri=` parameter shows exactly where the app is sending you.

### `?error=missing_code`

The callback ran without a `code` parameter. Almost always because the callback
URL was opened directly. Start at `/api/auth/google/login` instead — the
callback is the destination, not the entry point.

Also note the callback is **not** in the middleware's public paths, so you must
be logged into the app in the same browser, or Google's redirect lands on
`/login` and the token page is never rendered.

### `The caller does not have permission`

The token was valid but the authorising account had no access to the
spreadsheet, which lives in a different account.

**Fix.** Share the spreadsheet with the authorising account as **Editor** — not
Viewer. The app creates the `Recipients` tab and writes to `Accounts`, so reads
would succeed and the first write would fail. No redeploy needed; permissions
are evaluated per request.

### `/favicon.ico` 404 in the console

Harmless. There is no `public/` directory and no `src/app/icon.*`, so the
browser's automatic favicon request 404s. It is a clean 404 rather than a
redirect to `/login`, which confirms the middleware matcher correctly excludes
static asset paths.

### The cooldown progress bar flickered

**Cause.** Run state was stored in a JSON file in the OS temp directory. On
serverless that file is per-instance, so a 5-second poll alternated between an
instance that knew about the run and instances that answered `idle` — the bar
mounted and unmounted repeatedly. A 5-second tick across a 30-minute window also
moved it about one pixel at a time, so it looked frozen even when visible.

**Resolution.** The polling loop and the progress bar were removed entirely in
favour of a short fixed lockout. `src/lib/workflowStatus.ts` still uses the temp
file, but nothing now depends on it being consistent across instances.

**Generalise this.** Vercel's filesystem is read-only except `/tmp`, and `/tmp`
is per-instance and wiped on redeploy. Never store anything there that needs to
survive.

### `package-lock.json` churn stripping `libc`

Running `npm install` with a newer npm dropped the `libc` metadata from every
optional Linux binary, including `@next/swc-linux-*`. `npm ci` uses the
os/cpu/libc triplet to pick platform binaries without hitting the registry, so
this risked the wrong variant on Vercel's build image. Restored deliberately.

If a lockfile diff shows mass `libc` removals unrelated to what you installed,
do not commit them.

---

## Known limitations

- **Selection is per-browser.** It lives in `localStorage`, so ticking addresses
  on your laptop does not affect anyone else's browser. The trigger route
  cross-checks the selection against the `Recipients` master list and rejects
  anything stale, so this cannot email someone who was deleted — but two people
  can hold different selections.
- **`count` still caps the send.** The stepper was deliberately left unchanged.
  If n8n picks `count` addresses at random from the sheet, then selecting 10
  people with the stepper on 3 emails only 3. Set the stepper at or above the
  number selected to reach everyone ticked.
- **Do not trigger both senders at once.** The run lock is per-sender but both
  write the same `Accounts` tab. Triggering the second sender while the first
  run is still reading it rewrites that input mid-run. Recorded in a comment in
  `src/app/api/trigger/route.ts`.
- **The seed happens once.** `Recipients` is created and populated from
  `Accounts` on first load of the Accounts page. Confirm it captured everything
  **before** the first trigger, since that trigger begins overwriting `Accounts`.

## Open security issues

Two fail-open authentication bugs are documented in `imp.md` and remain
unfixed — empty credentials authenticate when the env vars are unset, and the
n8n callback secret check is skipped when the secret is unset. Both are real.
