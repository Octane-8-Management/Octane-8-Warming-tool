import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/googleAuth";

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
    await exchangeCodeForTokens(code);
    return NextResponse.redirect(new URL("/accounts", request.url));
  } catch (err) {
    const message = err instanceof Error ? err.message : "auth_failed";
    return NextResponse.redirect(
      new URL(`/accounts?error=${encodeURIComponent(message)}`, request.url)
    );
  }
}
