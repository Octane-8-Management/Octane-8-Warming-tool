import { NextResponse } from "next/server";
import { clearSendingLog, listSendingLog } from "@/lib/sheets";

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

export async function DELETE() {
  try {
    await clearSendingLog();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to clear sending log" },
      { status: 500 }
    );
  }
}
