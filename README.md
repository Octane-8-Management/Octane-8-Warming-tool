# Octane-8-Warming-tool

## Spreadsheet tabs

- **Recipients** — the master list of addresses. Edited from the app's Accounts
  page, or directly in the sheet. Never cleared automatically.
- **Accounts** — n8n's input. Overwritten on every trigger with just the
  addresses selected in the app. Do not edit by hand; changes are lost on the
  next trigger.
- **Sending Log**, **Replies** — written by n8n.

The Recipients tab is created automatically, seeded from Accounts, the first
time the Accounts page is opened.