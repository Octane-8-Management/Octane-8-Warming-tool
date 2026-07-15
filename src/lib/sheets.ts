import { google } from "googleapis";
import { getAuthorizedClient } from "./googleAuth";

// Same spreadsheet the n8n workflow reads/writes ("warmup testing").
const SPREADSHEET_ID = "1_3Ymc656AVtPGfGkTA3dOftlvpVn1mhf8-SBRFfZQAk";
const ACCOUNTS_SHEET_NAME = "Accounts";
const ACCOUNTS_SHEET_ID = 814125981;
const SENDING_LOG_SHEET_NAME = "Sending Log";
const REPLIES_SHEET_NAME = "Replies";

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
