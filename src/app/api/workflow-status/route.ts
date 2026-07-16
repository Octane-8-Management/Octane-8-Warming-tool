import { NextRequest, NextResponse } from "next/server";
import { getStatus, markAllIdle, markIdle } from "@/lib/workflowStatus";

export async function GET(request: NextRequest) {
  const sender = request.nextUrl.searchParams.get("sender");

  if (!sender) {
    return NextResponse.json({ error: "sender query param is required" }, { status: 400 });
  }

  return NextResponse.json(getStatus(sender));
}

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.N8N_COMPLETE_SECRET;
  const providedSecret = request.nextUrl.searchParams.get("secret");

  if (expectedSecret && providedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  // If n8n tells us which sender finished, unlock just that one early.
  // Otherwise (old-style callback with no sender), unlock everyone as a safe fallback.
  const sender = request.nextUrl.searchParams.get("sender");
  if (sender) {
    markIdle(sender);
  } else {
    markAllIdle();
  }

  return NextResponse.json({ ok: true });
}
