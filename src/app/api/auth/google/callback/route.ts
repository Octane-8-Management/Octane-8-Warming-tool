import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForRefreshToken } from "@/lib/googleAuth";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/accounts?error=${encodeURIComponent(error)}`, request.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/accounts?error=missing_code", request.url)
    );
  }

  try {
    const refreshToken = await exchangeCodeForRefreshToken(code);

    // Nothing can be persisted to disk or to env vars from a serverless
    // request — show the value once so it can be copied into
    // GOOGLE_REFRESH_TOKEN (locally in .env.local, and in the hosting
    // platform's environment variable settings for production).
    return new NextResponse(
      `<!doctype html>
<html>
  <body style="font-family: system-ui, sans-serif; padding: 2rem; max-width: 640px; margin: 0 auto; line-height: 1.5;">
    <h2>Google connected</h2>
    <p>
      Copy this value into the <code>GOOGLE_REFRESH_TOKEN</code> environment
      variable &mdash; locally in <code>.env.local</code>, and in your
      hosting platform's project settings for production. Restart the dev
      server (or redeploy) afterward.
    </p>
    <pre style="background:#f4f4f4; padding:1rem; border-radius:8px; overflow-x:auto; user-select:all;">${refreshToken}</pre>
  </body>
</html>`,
      { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "auth_failed";
    return NextResponse.redirect(
      new URL(`/accounts?error=${encodeURIComponent(message)}`, request.url)
    );
  }
}
