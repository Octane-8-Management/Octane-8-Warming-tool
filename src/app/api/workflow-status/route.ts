import { NextRequest, NextResponse } from "next/server";
import { getStatus, markIdle } from "@/lib/workflowStatus";

export async function GET() {
  const { status, startedAt } = getStatus();
  return NextResponse.json({ status, startedAt });
}

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.N8N_COMPLETE_SECRET;
  const providedSecret = request.nextUrl.searchParams.get("secret");

  if (expectedSecret && providedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  markIdle();
  return NextResponse.json({ ok: true });
}
