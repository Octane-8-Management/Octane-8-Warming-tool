# Recipient Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user pick which addresses a warmup run emails, by rewriting the `Accounts` tab with only the selected addresses immediately before firing the n8n webhook.

**Architecture:** A new `Recipients` tab in the existing spreadsheet holds the master list and is auto-created and seeded from `Accounts` on first access. Selection state lives in browser `localStorage` so both the Accounts page (which edits it) and the dashboard (which sends it) can read it. The trigger route writes the selection over `Accounts`, clears any trailing rows, then calls n8n — which is itself unmodified.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, `googleapis` Sheets v4, vitest (added by Task 1).

## Global Constraints

- The dev server picks 3001 when 3000 is taken. Set `PORT` to whatever `npm run dev` printed before running any `curl` below: `export PORT=3001`.

- Spreadsheet ID `1_3Ymc656AVtPGfGkTA3dOftlvpVn1mhf8-SBRFfZQAk`, already defined in `src/lib/sheets.ts`. Do not duplicate it.
- Master list tab name: `Recipients`. n8n input tab name: `Accounts`.
- `localStorage` key for selection: `octane8:selected-recipients`. It stores a JSON array of email strings.
- The count stepper on the trigger card is unchanged. `count` is still sent to n8n exactly as today.
- Emails are normalised to lowercase and trimmed everywhere.
- No authentication or security work. The two fail-open bugs in `imp.md` stay out of scope.
- No Google credentials exist locally. Any step that would call Sheets is verified by typecheck and by the non-Sheets branches only.
- Write-then-clear when replacing `Accounts`, never clear-then-write.

---

### Task 1: Pure recipient helpers

Pure functions for parsing pasted text, validating, and merging. No Next.js, no Sheets, no browser — fully testable.

**Files:**
- Create: `src/lib/recipients.ts`
- Create: `src/lib/recipients.test.ts`
- Modify: `package.json` (add vitest and a `test` script)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `isValidEmail(value: string): boolean`
  - `parseEmailList(raw: string): string[]`
  - `mergeEmails(existing: string[], incoming: string[]): { merged: string[]; added: string[]; invalid: string[] }`

- [ ] **Step 1: Add vitest**

```bash
npm install --save-dev vitest@^2
```

Then add to the `scripts` block in `package.json`:

```json
"test": "vitest run"
```

- [ ] **Step 2: Write the failing tests**

Create `src/lib/recipients.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isValidEmail, mergeEmails, parseEmailList } from "./recipients";

describe("isValidEmail", () => {
  it("accepts a normal address", () => {
    expect(isValidEmail("alice@example.com")).toBe(true);
  });

  it("rejects text with no @", () => {
    expect(isValidEmail("alice.example.com")).toBe(false);
  });

  it("rejects a domain with no dot", () => {
    expect(isValidEmail("alice@example")).toBe(false);
  });

  it("rejects an address containing whitespace", () => {
    expect(isValidEmail("ali ce@example.com")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidEmail("")).toBe(false);
  });
});

describe("parseEmailList", () => {
  it("splits on newlines", () => {
    expect(parseEmailList("a@x.com\nb@x.com")).toEqual(["a@x.com", "b@x.com"]);
  });

  it("splits on commas and semicolons", () => {
    expect(parseEmailList("a@x.com, b@x.com; c@x.com")).toEqual([
      "a@x.com",
      "b@x.com",
      "c@x.com",
    ]);
  });

  it("lowercases and trims", () => {
    expect(parseEmailList("  Alice@Example.COM  ")).toEqual([
      "alice@example.com",
    ]);
  });

  it("drops empty fragments from trailing separators", () => {
    expect(parseEmailList("a@x.com,\n\n,")).toEqual(["a@x.com"]);
  });

  it("returns an empty array for blank input", () => {
    expect(parseEmailList("   \n  ")).toEqual([]);
  });
});

describe("mergeEmails", () => {
  it("appends new addresses after existing ones", () => {
    const result = mergeEmails(["a@x.com"], ["b@x.com"]);
    expect(result.merged).toEqual(["a@x.com", "b@x.com"]);
    expect(result.added).toEqual(["b@x.com"]);
    expect(result.invalid).toEqual([]);
  });

  it("does not re-add an address already present", () => {
    const result = mergeEmails(["a@x.com"], ["a@x.com"]);
    expect(result.merged).toEqual(["a@x.com"]);
    expect(result.added).toEqual([]);
  });

  it("de-duplicates within the incoming batch", () => {
    const result = mergeEmails([], ["a@x.com", "a@x.com"]);
    expect(result.merged).toEqual(["a@x.com"]);
    expect(result.added).toEqual(["a@x.com"]);
  });

  it("separates invalid addresses instead of merging them", () => {
    const result = mergeEmails([], ["a@x.com", "nope"]);
    expect(result.merged).toEqual(["a@x.com"]);
    expect(result.invalid).toEqual(["nope"]);
  });

  it("leaves existing untouched when incoming is empty", () => {
    const result = mergeEmails(["a@x.com"], []);
    expect(result.merged).toEqual(["a@x.com"]);
    expect(result.added).toEqual([]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./recipients"`.

- [ ] **Step 4: Write the implementation**

Create `src/lib/recipients.ts`:

```ts
// Pure helpers for the recipient master list. No Sheets, no browser APIs —
// everything here is deliberately testable in isolation.

// Deliberately loose. The goal is catching paste accidents (stray words,
// missing @), not enforcing RFC 5322.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}

// Accepts whatever the user pasted — newline-separated, comma-separated,
// semicolon-separated, or a mix — and normalises to lowercase.
export function parseEmailList(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

export function mergeEmails(
  existing: string[],
  incoming: string[]
): { merged: string[]; added: string[]; invalid: string[] } {
  const seen = new Set(existing);
  const merged = [...existing];
  const added: string[] = [];
  const invalid: string[] = [];

  for (const email of incoming) {
    if (!isValidEmail(email)) {
      invalid.push(email);
      continue;
    }
    if (seen.has(email)) continue;

    seen.add(email);
    merged.push(email);
    added.push(email);
  }

  return { merged, added, invalid };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 15 tests across 3 suites.

- [ ] **Step 6: Commit**

```bash
git add src/lib/recipients.ts src/lib/recipients.test.ts package.json package-lock.json
git commit -m "Add pure helpers for parsing and merging recipient lists"
```

---

### Task 2: Selection storage helpers

Reads and writes the selected-address list in `localStorage`. Shared by the Accounts page and the dashboard, which is the whole reason it is a module rather than inline state.

**Files:**
- Create: `src/lib/selection.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `SELECTION_KEY: string`
  - `readSelection(): string[]`
  - `writeSelection(emails: string[]): void`

- [ ] **Step 1: Write the implementation**

Create `src/lib/selection.ts`:

```ts
// Which recipients are ticked. Lives in localStorage rather than the sheet
// because it is a per-person choice that changes on every run — and because
// the dashboard (which fires the trigger) and the Accounts page (which edits
// the list) are separate routes that both need to see it.

export const SELECTION_KEY = "octane8:selected-recipients";

export function readSelection(): string[] {
  try {
    const raw = localStorage.getItem(SELECTION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    // Storage disabled or corrupt value — behave as if nothing is selected.
    return [];
  }
}

export function writeSelection(emails: string[]): void {
  try {
    localStorage.setItem(SELECTION_KEY, JSON.stringify(emails));
  } catch {
    // Private mode / storage full. In-memory state still drives this session.
  }
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: exit 0, no output.

- [ ] **Step 3: Commit**

```bash
git add src/lib/selection.ts
git commit -m "Add localStorage helpers for recipient selection"
```

---

### Task 3: Sheets access for the Recipients tab

Adds the master-list tab, its CRUD, and the `Accounts` overwrite used by the trigger.

**Files:**
- Modify: `src/lib/sheets.ts`

**Interfaces:**
- Consumes: `listAccounts()` from `src/lib/sheets.ts` (existing, used for seeding).
- Produces:
  - `listRecipients(): Promise<string[]>`
  - `addRecipients(emails: string[]): Promise<string[]>` — returns the full merged list
  - `removeRecipient(email: string): Promise<void>`
  - `replaceAccounts(emails: string[]): Promise<void>`

- [ ] **Step 1: Add the tab constant**

In `src/lib/sheets.ts`, below the existing `REPLIES_SHEET_NAME` declaration, add:

```ts
const RECIPIENTS_SHEET_NAME = "Recipients";
```

- [ ] **Step 2: Add tab creation and seeding**

Append to `src/lib/sheets.ts`:

```ts
// Creates the Recipients tab if it is missing, seeding it from whatever is
// currently in Accounts. Seeding matters: once a trigger starts overwriting
// Accounts, that tab is no longer a complete record of every address.
async function ensureRecipientsSheet(): Promise<void> {
  const sheets = sheetsClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });

  const exists = (meta.data.sheets ?? []).some(
    (sheet) => sheet.properties?.title === RECIPIENTS_SHEET_NAME
  );
  if (exists) return;

  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          { addSheet: { properties: { title: RECIPIENTS_SHEET_NAME } } },
        ],
      },
    });
  } catch (err) {
    // Two concurrent first-loads can race here; the loser gets "already
    // exists", which is the state we wanted anyway.
    const message = err instanceof Error ? err.message : "";
    if (!message.includes("already exists")) throw err;
    return;
  }

  const seed = await listAccounts();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${RECIPIENTS_SHEET_NAME}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [["Email"], ...seed.map((email) => [email])] },
  });
}
```

- [ ] **Step 3: Add the read**

Append to `src/lib/sheets.ts`:

```ts
export async function listRecipients(): Promise<string[]> {
  await ensureRecipientsSheet();

  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${RECIPIENTS_SHEET_NAME}!A2:A`,
  });

  return (res.data.values ?? [])
    .map((row) => (typeof row[0] === "string" ? row[0].trim().toLowerCase() : ""))
    .filter((email) => email.length > 0);
}
```

- [ ] **Step 4: Add the writes**

Append to `src/lib/sheets.ts`. Note the `mergeEmails` import must go at the top of the file with the other imports:

```ts
import { mergeEmails } from "./recipients";
```

```ts
// Returns the full list after merging, so the caller does not need a re-read.
export async function addRecipients(emails: string[]): Promise<string[]> {
  const existing = await listRecipients();
  const { merged, added } = mergeEmails(existing, emails);

  if (added.length === 0) return merged;

  const sheets = sheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${RECIPIENTS_SHEET_NAME}!A:A`,
    valueInputOption: "RAW",
    requestBody: { values: added.map((email) => [email]) },
  });

  return merged;
}

export async function removeRecipient(email: string): Promise<void> {
  const remaining = (await listRecipients()).filter(
    (entry) => entry !== email.trim().toLowerCase()
  );

  const sheets = sheetsClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${RECIPIENTS_SHEET_NAME}!A2`,
    valueInputOption: "RAW",
    requestBody: { values: remaining.map((entry) => [entry]) },
  });

  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: `${RECIPIENTS_SHEET_NAME}!A${remaining.length + 2}:A`,
  });
}
```

- [ ] **Step 5: Add the Accounts overwrite**

Append to `src/lib/sheets.ts`:

```ts
// Replaces the Accounts tab — n8n's input — with exactly these addresses.
//
// Write first, then clear the tail. Clearing first would leave a window where
// Accounts is empty, and a failure in the write would then have destroyed the
// sheet while sending nothing. This ordering means the worst case is a stale
// trailing row, never an empty sheet.
export async function replaceAccounts(emails: string[]): Promise<void> {
  const sheets = sheetsClient();

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${ACCOUNTS_SHEET_NAME}!A2`,
    valueInputOption: "RAW",
    requestBody: { values: emails.map((email) => [email]) },
  });

  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: `${ACCOUNTS_SHEET_NAME}!A${emails.length + 2}:A`,
  });
}
```

- [ ] **Step 6: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: exit 0, no output.

- [ ] **Step 7: Commit**

```bash
git add src/lib/sheets.ts
git commit -m "Add Recipients tab access and Accounts overwrite"
```

---

### Task 4: Recipients API route

**Files:**
- Create: `src/app/api/recipients/route.ts`

**Interfaces:**
- Consumes: `listRecipients`, `addRecipients`, `removeRecipient` from `src/lib/sheets.ts`; `parseEmailList` from `src/lib/recipients.ts`.
- Produces: `GET /api/recipients` → `{ recipients: string[] }`; `POST /api/recipients` with `{ text: string }` → `{ recipients: string[] }`; `DELETE /api/recipients?email=…` → `{ ok: true }`.

- [ ] **Step 1: Write the route**

Create `src/app/api/recipients/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { addRecipients, listRecipients, removeRecipient } from "@/lib/sheets";
import { parseEmailList } from "@/lib/recipients";

export async function GET() {
  try {
    const recipients = await listRecipients();
    return NextResponse.json({ recipients });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load recipients" },
      { status: 500 }
    );
  }
}

// Accepts a blob of pasted text rather than a single address, so one paste of
// many addresses is one request.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text : "";
  const emails = parseEmailList(text);

  if (emails.length === 0) {
    return NextResponse.json(
      { error: "No email addresses found in that text" },
      { status: 400 }
    );
  }

  try {
    const recipients = await addRecipients(emails);
    return NextResponse.json({ recipients });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to add recipients" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const email = request.nextUrl.searchParams.get("email");

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  try {
    await removeRecipient(email);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to remove recipient" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verify the validation branch without Sheets**

Start the dev server if it is not already running (`npm run dev`), then run:

```bash
curl -s -b /tmp/o8.cookies -X POST http://localhost:$PORT/api/recipients \
  -H 'Content-Type: application/json' -d '{"text":"   "}' -w "\n%{http_code}\n"
```

Expected: `{"error":"No email addresses found in that text"}` and `400`. This
branch returns before any Sheets call, so it works without credentials.

If `/tmp/o8.cookies` does not exist, create it first:

```bash
curl -s -c /tmp/o8.cookies -X POST http://localhost:$PORT/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"octane8","password":"local-dev"}'
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/recipients/route.ts
git commit -m "Add recipients API route"
```

---

### Task 5: Trigger writes the sheet before firing n8n

**Files:**
- Modify: `src/app/api/trigger/route.ts`

**Interfaces:**
- Consumes: `replaceAccounts` from `src/lib/sheets.ts`; `isValidEmail` from `src/lib/recipients.ts`.
- Produces: `POST /api/trigger` now requires `recipients: string[]` alongside `sender` and `count`.

- [ ] **Step 1: Add imports**

At the top of `src/app/api/trigger/route.ts`, below the existing
`workflowStatus` import, add:

```ts
import { replaceAccounts } from "@/lib/sheets";
import { isValidEmail } from "@/lib/recipients";
```

- [ ] **Step 2: Parse and validate recipients**

In `src/app/api/trigger/route.ts`, immediately after the existing `const count = Number(body?.count);` line, add:

```ts
  const recipients: string[] = Array.isArray(body?.recipients)
    ? body.recipients
        .filter((entry: unknown): entry is string => typeof entry === "string")
        .map((entry: string) => entry.trim().toLowerCase())
        .filter((entry: string) => entry.length > 0)
    : [];
```

Then, after the existing `count` range check and **before** the `getStatus` lockout check, add:

```ts
  if (recipients.length === 0) {
    return NextResponse.json(
      { error: "Select at least one recipient before triggering." },
      { status: 400 }
    );
  }

  const invalid = recipients.filter((email) => !isValidEmail(email));
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `Invalid email address: ${invalid[0]}` },
      { status: 400 }
    );
  }
```

- [ ] **Step 3: Write the sheet before the webhook**

In `src/app/api/trigger/route.ts`, after the `webhookUrl` missing check and
**before** `const requestBody = { sender, count };`, add:

```ts
  // Narrow n8n's input to just the selected addresses. If this fails we must
  // not fire the webhook — n8n would email whoever the sheet still holds.
  try {
    await replaceAccounts(recipients);
  } catch (err) {
    return NextResponse.json(
      {
        error: `Could not update the Accounts sheet, so nothing was sent: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
      },
      { status: 502 }
    );
  }
```

- [ ] **Step 4: Include the recipient count in the response**

In `src/app/api/trigger/route.ts`, change the existing success response object
so it reports how many addresses were written. Replace:

```ts
        requestBody,
        run: getStatus(sender),
```

with:

```ts
        requestBody,
        recipientCount: recipients.length,
        run: getStatus(sender),
```

- [ ] **Step 5: Verify validation rejects an empty selection**

Run:

```bash
curl -s -b /tmp/o8.cookies -X POST http://localhost:$PORT/api/trigger \
  -H 'Content-Type: application/json' \
  -d '{"sender":"saim@octane8studio.com","count":5,"recipients":[]}' \
  -w "\n%{http_code}\n"
```

Expected: `{"error":"Select at least one recipient before triggering."}` and `400`.

Then verify a malformed address is caught:

```bash
curl -s -b /tmp/o8.cookies -X POST http://localhost:$PORT/api/trigger \
  -H 'Content-Type: application/json' \
  -d '{"sender":"saim@octane8studio.com","count":5,"recipients":["nope"]}' \
  -w "\n%{http_code}\n"
```

Expected: `{"error":"Invalid email address: nope"}` and `400`.

Both branches return before any Sheets call, so they work without credentials.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/trigger/route.ts
git commit -m "Write selected recipients to Accounts before firing n8n"
```

---

### Task 6: Recipient manager UI

Replaces the single-email input on the Accounts tab with a checkbox list and a bulk paste box.

**Files:**
- Modify: `src/app/(app)/accounts/page.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `GET/POST/DELETE /api/recipients`; `readSelection`, `writeSelection` from `src/lib/selection.ts`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add imports and selection state**

In `src/app/(app)/accounts/page.tsx`, add to the imports:

```ts
import { readSelection, writeSelection } from "@/lib/selection";
```

Add alongside the existing `useState` declarations in `AccountsPage`:

```ts
  const [selected, setSelected] = useState<string[]>([]);
  const [pasteText, setPasteText] = useState("");
```

- [ ] **Step 2: Load selection on mount and prune it**

Add this effect to `AccountsPage`, after the existing data-loading effects.
`accounts` holds the recipient list rendered by this page.

```ts
  // Drop anything selected that has since been removed from the master list,
  // so a stale localStorage entry can never be written to the sheet.
  useEffect(() => {
    if (accounts.length === 0) return;
    const valid = readSelection().filter((email) => accounts.includes(email));
    setSelected(valid);
    writeSelection(valid);
  }, [accounts]);
```

- [ ] **Step 3: Add the toggle handlers**

Add to `AccountsPage`:

```ts
  function persistSelection(next: string[]) {
    setSelected(next);
    writeSelection(next);
  }

  function toggleOne(email: string) {
    persistSelection(
      selected.includes(email)
        ? selected.filter((entry) => entry !== email)
        : [...selected, email]
    );
  }

  function selectAll() {
    persistSelection([...accounts]);
  }

  function selectNone() {
    persistSelection([]);
  }
```

- [ ] **Step 4: Add the bulk paste handler**

Add to `AccountsPage`. Newly added addresses default to selected, matching the
current behaviour where every address receives mail:

```ts
  async function handlePaste() {
    if (!pasteText.trim()) return;

    setBusy(true);
    setError("");

    try {
      const res = await fetch("/api/recipients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pasteText }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to add recipients");
        return;
      }

      setAccounts(data.recipients);
      const added = data.recipients.filter(
        (email: string) => !accounts.includes(email)
      );
      persistSelection([...selected, ...added]);
      setPasteText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add recipients");
    } finally {
      setBusy(false);
    }
  }
```

- [ ] **Step 5: Render the paste box and selection controls**

In the accounts tab section of the JSX, above the list of addresses, add:

```tsx
<div className="recipient-controls">
  <textarea
    className="paste-box"
    rows={4}
    placeholder="Paste emails here — one per line, or comma separated"
    value={pasteText}
    onChange={(e) => setPasteText(e.target.value)}
    disabled={busy}
  />
  <div className="recipient-actions">
    <button className="btn" onClick={handlePaste} disabled={busy || !pasteText.trim()}>
      Add to list
    </button>
    <span className="selection-count">
      {selected.length} of {accounts.length} selected
    </span>
    <button className="btn btn-secondary" onClick={selectAll} disabled={busy}>
      Select all
    </button>
    <button className="btn btn-secondary" onClick={selectNone} disabled={busy}>
      Select none
    </button>
  </div>
</div>
```

- [ ] **Step 6: Add a checkbox to each row**

In the existing map that renders each address row, add as the first child of
the row element:

```tsx
<input
  type="checkbox"
  className="recipient-checkbox"
  checked={selected.includes(email)}
  onChange={() => toggleOne(email)}
  aria-label={`Select ${email}`}
/>
```

- [ ] **Step 7: Point the page at the recipients endpoint**

There are three call sites in `src/app/(app)/accounts/page.tsx`. All three must
change, or the page will read one tab and write another.

- **Line 132** — `fetch("/api/accounts")` in the parallel initial load. Change
  to `fetch("/api/recipients")`, and where the response is unpacked into
  `nextAccounts` (near line 158), read `data.recipients` instead of
  `data.accounts`.
- **Line 251** — the single-email add. Change the URL to `/api/recipients` and
  the body from `{ email }` to `{ text: email }`, since the new route takes a
  text blob. On success set `setAccounts(data.recipients)` rather than
  re-fetching.
- **Line 275** — the delete. Change to
  `/api/recipients?email=${encodeURIComponent(email)}`.

The `sessionStorage` cache at line 231 keeps its existing shape; the
`accounts` field now holds the recipient list. No change needed there.

- [ ] **Step 8: Add the styles**

Append to `src/app/globals.css`:

```css
.recipient-controls {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.paste-box {
  width: 100%;
  padding: 0.65rem 0.8rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font-family: inherit;
  font-size: 0.9rem;
  resize: vertical;
  outline: none;
}

.paste-box:focus {
  border-color: var(--accent);
}

.recipient-actions {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.selection-count {
  font-size: 0.82rem;
  color: var(--text-muted);
  margin-right: auto;
}

.recipient-checkbox {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
  cursor: pointer;
  flex: 0 0 auto;
}
```

`--accent` is defined at `src/app/globals.css:10`.

- [ ] **Step 9: Verify it typechecks and renders**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `curl -s -b /tmp/o8.cookies -o /dev/null -w "%{http_code}\n" http://localhost:$PORT/accounts`
Expected: `200`.

- [ ] **Step 10: Commit**

```bash
git add "src/app/(app)/accounts/page.tsx" src/app/globals.css
git commit -m "Add recipient selection and bulk paste to the accounts page"
```

---

### Task 7: Dashboard sends the selection

**Files:**
- Modify: `src/app/(app)/page.tsx`

**Interfaces:**
- Consumes: `readSelection` from `src/lib/selection.ts`.
- Produces: nothing.

- [ ] **Step 1: Add the import**

In `src/app/(app)/page.tsx`, add:

```ts
import { readSelection } from "@/lib/selection";
```

- [ ] **Step 2: Track the selection**

Add to `TriggerCard`, alongside the existing `useState` declarations:

```ts
  const [selectedCount, setSelectedCount] = useState(0);
```

Add this effect. It re-reads on focus because the user selects on the Accounts
page and then navigates back here:

```ts
  useEffect(() => {
    const sync = () => setSelectedCount(readSelection().length);
    sync();
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, []);
```

- [ ] **Step 3: Send recipients with the trigger**

In `handleTrigger`, replace:

```ts
    const payload = { sender: senderEmail, count };
```

with:

```ts
    const payload = { sender: senderEmail, count, recipients: readSelection() };
```

- [ ] **Step 4: Block the trigger when nothing is selected**

Replace the existing `isBusy` declaration:

```ts
  const isBusy = isLocked || triggerStatus === "loading";
```

with:

```ts
  const hasSelection = selectedCount > 0;
  const isBusy = isLocked || triggerStatus === "loading" || !hasSelection;
```

Then update the trigger button label so a disabled button explains itself.
Replace:

```tsx
        {triggerStatus === "loading"
          ? "Triggering..."
          : isLocked
          ? `Wait ${remainingSeconds}s`
          : `Trigger ${label}`}
```

with:

```tsx
        {triggerStatus === "loading"
          ? "Triggering..."
          : isLocked
          ? `Wait ${remainingSeconds}s`
          : !hasSelection
          ? "No recipients selected"
          : `Trigger ${label} (${selectedCount})`}
```

- [ ] **Step 5: Verify it typechecks and renders**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `curl -s -b /tmp/o8.cookies -o /dev/null -w "%{http_code}\n" http://localhost:$PORT/`
Expected: `200`.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/page.tsx"
git commit -m "Send the selected recipients with each trigger"
```

---

### Task 8: Retire the old accounts route and document the change

The `/api/accounts` route wrote to the `Accounts` tab, which is now overwritten
on every trigger. Leaving it in place would let a user add an address that the
next trigger silently destroys.

**Files:**
- Delete: `src/app/api/accounts/route.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Confirm nothing still calls it**

Run: `grep -rn "api/accounts" src/`
Expected: no output. If anything is found, repoint it at `/api/recipients`
before continuing.

- [ ] **Step 2: Delete the route**

```bash
git rm src/app/api/accounts/route.ts
```

- [ ] **Step 3: Document the tab layout**

Append to `README.md`:

```markdown
## Spreadsheet tabs

- **Recipients** — the master list of addresses. Edited from the app's Accounts
  page, or directly in the sheet. Never cleared automatically.
- **Accounts** — n8n's input. Overwritten on every trigger with just the
  addresses selected in the app. Do not edit by hand; changes are lost on the
  next trigger.
- **Sending Log**, **Replies** — written by n8n.

The Recipients tab is created automatically, seeded from Accounts, the first
time the Accounts page is opened.
```

- [ ] **Step 4: Verify the build**

Run: `npx tsc --noEmit && npm test`
Expected: tsc exit 0; 15 tests passing.

- [ ] **Step 5: Commit**

```bash
git add README.md src/app/api/accounts/route.ts
git commit -m "Retire the accounts route and document the tab layout"
```

---

## Manual verification after deploy

None of the Sheets paths can be exercised locally without credentials. After
pushing, in this order:

1. Open the Accounts page. Confirm the `Recipients` tab now exists in the
   spreadsheet and contains every address that was in `Accounts`.
2. **Do not trigger yet.** If the seed is wrong, fix it in the sheet first —
   the first trigger overwrites `Accounts`.
3. Paste a couple of addresses into the box, confirm they appear in both the
   list and the `Recipients` tab.
4. Deselect all but one address. Hit Trigger.
5. Confirm `Accounts` now holds only that one address, and that n8n emailed
   only that recipient.
