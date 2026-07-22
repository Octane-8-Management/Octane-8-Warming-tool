import { NextResponse } from "next/server";
import { clearReplies, listReplies } from "@/lib/sheets";

export async function GET() {
  try {
    const replies = await listReplies();
    return NextResponse.json({ replies });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load replies" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    await clearReplies();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to clear replies" },
      { status: 500 }
    );
  }
}
