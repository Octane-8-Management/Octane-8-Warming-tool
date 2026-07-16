import { NextRequest, NextResponse } from "next/server";
import { computeSessionToken, SESSION_COOKIE } from "@/lib/session";

// Bypass the login gate for: the login page/API itself (else redirect loop),
// and /api/workflow-status (n8n's own completion callback has no browser
// session — it's protected instead by its own `secret` query param).
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/workflow-status"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  const expected = await computeSessionToken();

  if (cookie && cookie === expected) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
