import { google } from "googleapis";

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

// Serverless deployments (Vercel, etc.) have a read-only filesystem, so the
// token can't be written to disk. Instead this exchanges the OAuth code for
// a refresh token and hands it back so it can be set as the
// GOOGLE_REFRESH_TOKEN environment variable — from then on, access tokens are
// derived from it in memory on each request, nothing is ever persisted to disk.
export async function exchangeCodeForRefreshToken(code: string): Promise<string> {
  const client = createOAuth2Client();
  const { tokens } = await client.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error(
      "Google did not return a refresh token. This usually means the app already has a granted session — revoke access at https://myaccount.google.com/permissions and try connecting again."
    );
  }

  return tokens.refresh_token;
}

export function isConnected(): boolean {
  return Boolean(process.env.GOOGLE_REFRESH_TOKEN);
}

export function getAuthorizedClient() {
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!refreshToken) {
    throw new Error("Google account not connected yet (GOOGLE_REFRESH_TOKEN is not set)");
  }

  const client = createOAuth2Client();
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}
