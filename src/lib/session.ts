// Single-shared-credential session for this internal tool. Uses Web Crypto
// (not Node's `crypto` module) so the same code runs in both API routes
// (Node runtime) and middleware (Edge runtime).

export const SESSION_COOKIE = "octane8_session";

export async function computeSessionToken(): Promise<string> {
  const secret = process.env.AUTH_SESSION_SECRET ?? "";
  const password = process.env.APP_PASSWORD ?? "";
  const data = new TextEncoder().encode(`${password}:${secret}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function checkCredentials(username: string, password: string): boolean {
  return (
    username === (process.env.APP_USERNAME ?? "") &&
    password === (process.env.APP_PASSWORD ?? "")
  );
}
