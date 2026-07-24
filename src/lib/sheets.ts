import { google } from "googleapis";
import { getAuthorizedClient } from "./googleAuth";
import { mergeEmails } from "./recipients";

// Same spreadsheet the n8n workflow reads/writes ("warmup testing").
const SPREADSHEET_ID = "1_3Ymc656AVtPGfGkTA3dOftlvpVn1mhf8-SBRFfZQAk";
const ACCOUNTS_SHEET_NAME = "Accounts";
const ACCOUNTS_SHEET_ID = 814125981;
const SENDING_LOG_SHEET_NAME = "Sending Log";
const REPLIES_SHEET_NAME = "Replies";
const RECIPIENTS_SHEET_NAME = "Recipients";

function sheetsClient() {
  const auth = getAuthorizedClient();
  return google.sheets({ version: "v4", auth });
}

export async function listAccounts(): Promise<string[]> {
  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${ACCOUNTS_SHEET_NAME}!A2:A`,
  });

  return (res.data.values ?? [])
    .map((row) => row[0])
    .filter((email): email is string => Boolean(email));
}

export async function addAccount(email: string): Promise<void> {
  const sheets = sheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${ACCOUNTS_SHEET_NAME}!A:A`,
    valueInputOption: "RAW",
    requestBody: { values: [[email]] },
  });
}

export async function removeAccount(email: string): Promise<void> {
  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${ACCOUNTS_SHEET_NAME}!A:A`,
  });

  const rows = res.data.values ?? [];
  const rowIndex = rows.findIndex((row) => row[0] === email);
  if (rowIndex === -1) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: ACCOUNTS_SHEET_ID,
              dimension: "ROWS",
              startIndex: rowIndex,
              endIndex: rowIndex + 1,
            },
          },
        },
      ],
    },
  });
}

export type SendingLogEntry = {
  sender: string;
  recipient: string;
  subject: string;
  timestamp: string;
};

export async function listSendingLog(): Promise<SendingLogEntry[]> {
  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SENDING_LOG_SHEET_NAME}!A2:D`,
  });

  return (res.data.values ?? []).map((row) => ({
    sender: row[0] ?? "",
    recipient: row[1] ?? "",
    subject: row[2] ?? "",
    timestamp: row[3] ?? "",
  }));
}

// Blanks every data row below the header, leaving the header and sheet
// itself intact. Note: n8n's randomizer reads this sheet to avoid
// re-emailing the same recipient within 24h, so clearing it resets that
// cooldown tracking too.
export async function clearSendingLog(): Promise<void> {
  const sheets = sheetsClient();
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SENDING_LOG_SHEET_NAME}!A2:D`,
  });
}

export type ReplyEntry = {
  originalSender: string;
  replier: string;
  subject: string;
  replySnippet: string;
  timestamp: string;
};

export async function listReplies(): Promise<ReplyEntry[]> {
  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${REPLIES_SHEET_NAME}!A2:E`,
  });

  return (res.data.values ?? []).map((row) => ({
    originalSender: row[0] ?? "",
    replier: row[1] ?? "",
    subject: row[2] ?? "",
    replySnippet: row[3] ?? "",
    timestamp: row[4] ?? "",
  }));
}

// Blanks every data row below the header, leaving the header and sheet
// itself intact.
export async function clearReplies(): Promise<void> {
  const sheets = sheetsClient();
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: `${REPLIES_SHEET_NAME}!A2:E`,
  });
}

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
