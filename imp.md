# Known issues to fix

Findings from a review on 2026-07-21. Ordered by severity. Nothing here is
fixed yet except where noted.

---

## 1. CRITICAL — Empty credentials authenticate

`src/lib/session.ts`

```ts
username === (process.env.APP_USERNAME ?? "") &&
password === (process.env.APP_PASSWORD ?? "")
```

If `APP_USERNAME` / `APP_PASSWORD` are missing on a deploy, both sides collapse
to `""` and a POST of `{"username": "", "password": ""}` logs straight in.

Worse, `computeSessionToken()` then hashes `":"` — a fixed, publicly derivable
value. An attacker who guesses the app is misconfigured can forge the session
cookie directly without touching the login form.

**A misconfigured deploy is silently a public deploy.**

Fix: refuse all authentication when either env var is unset, and fail loudly at
startup rather than serving in an open state.

---

## 2. CRITICAL — The n8n unlock secret is optional

`src/app/api/workflow-status/route.ts`

```ts
if (expectedSecret && providedSecret !== expectedSecret) { ... 401 }
```

When `N8N_COMPLETE_SECRET` is unset the check is skipped entirely, so anyone can
POST to this route and clear cooldown locks for any sender. The route is in
`PUBLIC_PATHS`, so it is reachable without a session by design.

Fix: reject the request when the secret is not configured. Move the secret out
of the query string into a header — query strings end up in access logs.

---

## 3. HIGH — The session token is a constant, not a session

`src/lib/session.ts` — the cookie value is `SHA-256(password:secret)`, identical
for every user and every login, permanently. Consequences:

- Logout only clears the cookie in that one browser. A copied cookie keeps
  working indefinitely.
- No expiry or rotation (the 30-day `maxAge` is cosmetic — the value never
  changes).
- Revoking one person's access means changing `APP_PASSWORD` for everyone.

Fix: issue a random session ID per login and track it server-side.

---

## 4. MEDIUM — Cookie hardening and login brute force

- No `secure` flag on the session cookie, so it travels over plaintext HTTP if
  anything downgrades. Set `secure` in production.
- No rate limiting or lockout on `/api/auth/login`. A single shared password is
  exactly what brute force is good at.
- Password comparison is `===`, not constant-time.

---

## 5. MEDIUM — Run state in `/tmp` is not shared storage

`src/lib/workflowStatus.ts` stores per-sender run state in a JSON file in the OS
temp dir. On serverless that file is **per-instance**, which causes two problems:

- **The cooldown lock is unreliable.** A trigger can double-fire if it lands on
  an instance that never saw the first run.
- **The countdown UI flickered.** The 5s poll round-robins across instances, so
  it alternated `running` and `idle` and the progress bar mounted/unmounted.

The UI symptom is worked around client-side (see below), but the lock itself is
still soft. Real fix: move run state to shared storage — Vercel KV, Upstash, or
the Google Sheet already in use.

**Partially addressed** — the client now derives the cooldown from
`startedAt + 30min`, mirrors it to `localStorage`, and requires 3 consecutive
`idle` polls before clearing. Known residual: if every instance recycles
mid-run, the cooldown ends early.

---

## 6. LOW — No audit trail

One shared credential means there is no way to tell which team member triggered
a given run. Acceptable for a two-person internal tool, but it is a deliberate
trade rather than something the current design covers.

---

## 7. LOW — `/favicon.ico` returns 404

There is no `public/` directory and no `src/app/icon.*`, so every page load logs
a 404 in the browser console. Harmless. Converting
`src/components/OctaneLogoMark.tsx` into `src/app/icon.svg` would fix it and
give the tab a real icon.
