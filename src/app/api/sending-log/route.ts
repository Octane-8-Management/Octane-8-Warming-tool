import { NextResponse } from "next/server";
import { listSendingLog } from "@/lib/sheets";

export async function GET() {
  try {
    const log = await listSendingLog();
    return NextResponse.json({ log });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load sending log" },
      { status: 500 }
    );
  }
}
