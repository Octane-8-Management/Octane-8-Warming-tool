import fs from "fs";
import path from "path";
import { google } from "googleapis";

const TOKEN_PATH = path.join(process.cwd(), ".google-token.json");
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function getAuthUrl(): string {
  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
}

export async function exchangeCodeForTokens(code: string): Promise<void> {
  const client = createOAuth2Client();
  const { tokens } = await client.getToken(code);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
}

export function isConnected(): boolean {
  return fs.existsSync(TOKEN_PATH);
}

export function disconnect(): void {
  if (fs.existsSync(TOKEN_PATH)) {
    fs.unlinkSync(TOKEN_PATH);
  }
}

export function getAuthorizedClient() {
  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error("Google account not connected yet");
  }

  const storedTokens = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
  const client = createOAuth2Client();
  client.setCredentials(storedTokens);

  // Persist a rotated access token (and refresh token, if Google issues a new one)
  // so the next request doesn't have to re-authenticate.
  client.on("tokens", (newTokens) => {
    const merged = { ...storedTokens, ...newTokens };
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));
  });

  return client;
}
