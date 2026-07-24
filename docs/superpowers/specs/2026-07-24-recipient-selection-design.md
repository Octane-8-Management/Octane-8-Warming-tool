# Recipient selection before trigger

Design, 2026-07-24.

## Problem

The n8n workflow reads the `Accounts` tab of the warmup spreadsheet and emails
everyone it finds there. There is no way to run the workflow against a subset,
so every trigger reaches every address on the list.

## Solution

Make the app own the recipient list and rewrite `Accounts` at trigger time so it
contains only the selected addresses. n8n is not modified: it still emails
everyone in `Accounts` — that set is just narrowed to the current selection
before the webhook fires.

## Storage

A new `Recipients` tab in the same spreadsheet holds the master list.

- Column A, header `Email` in A1.
- Created automatically via `batchUpdate` / `addSheet` on first access if
  missing, so no manual spreadsheet work is required.
- On creation it is **seeded from the current `Accounts` contents**, so the
  existing addresses are preserved before anything clears `Accounts`.
- The trigger never clears this tab.

`Accounts` becomes purely n8n's input and is overwritten on every trigger.

Rejected: a JSON file on the server. Vercel's filesystem is read-only apart from
`/tmp`, which is per-instance and wiped on redeploy, so the list would disappear
at random. `src/lib/workflowStatus.ts` already hit this.

Rejected: master list in `localStorage` only. Once the trigger starts clearing
`Accounts`, the sheet no longer holds the full list, so clearing browser data
would destroy every address permanently.

## Selection

Which addresses are ticked is stored in browser `localStorage` under
`octane8:selected-recipients`. It is a per-person UI choice that changes on
every run, so it does not belong in the shared sheet.

- Newly added addresses default to **selected**, matching current behavior where
  everyone receives mail.
- Addresses in `localStorage` that no longer exist in `Recipients` are ignored.

## UI

The Accounts tab of the dashboard becomes the recipient manager:

- A checkbox per address.
- A bulk paste box accepting many addresses at once, split on newlines and
  commas, trimmed, de-duplicated against the existing list.
- Select all / select none.
- An "N of M selected" counter.
- Existing add and remove actions repoint from `Accounts` to `Recipients`.

The count stepper on the trigger card is **unchanged**. `count` continues to be
sent to n8n exactly as it is today.

## Trigger flow

`POST /api/trigger` gains a `recipients: string[]` field alongside the existing
`sender` and `count`.

1. Validate: `recipients` is non-empty and every entry looks like an email
   address. Reject with 400 otherwise.
2. Write the selected addresses over `Accounts` rows 2 through N+1.
3. Clear any leftover rows below N+1.
4. Fire the n8n webhook.

Write-then-clear, not clear-then-write. Clearing first leaves a window where
`Accounts` is empty; if the write then fails, the sheet has been destroyed and
nothing was sent. Writing first never leaves the sheet empty.

Steps 2 and 3 are not atomic — the Sheets API offers no transaction. The
ordering above means the worst case is a stale trailing row, not an empty sheet.

## Error handling

- Sheet write fails → return 502, **do not fire the webhook**, and state plainly
  that nothing was sent.
- Webhook fails after a successful write → report that `Accounts` was updated but
  the workflow did not start. The sheet is left as written; the next trigger
  overwrites it.
- Empty selection → 400 before any sheet call, so a stray click cannot wipe
  `Accounts`.

The existing 15-second post-trigger lockout is unchanged.

## Out of scope

- The two fail-open authentication bugs in `imp.md`. Still unfixed.
- Any security work on the recipient list, per explicit instruction.
- Sharing selection state between browsers.

## Verification

No Google credentials are available in the development environment, so the
Sheets paths cannot be exercised locally. Verification is limited to
typechecking, the validation and error branches that do not reach Sheets, and
the UI. End-to-end confirmation against the real spreadsheet happens on Vercel,
where the credentials already exist.

First deploy carries one irreversible step: the seed of `Recipients` from
`Accounts`. Confirm the `Recipients` tab is correctly populated **before**
running a trigger, because the first trigger overwrites `Accounts`.
