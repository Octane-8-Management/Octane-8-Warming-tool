import { NextRequest, NextResponse } from "next/server";
import { addRecipients, listRecipients, removeRecipient } from "@/lib/sheets";
import { parseEmailList } from "@/lib/recipients";

export async function GET() {
  try {
    const recipients = await listRecipients();
    return NextResponse.json({ recipients });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load recipients" },
      { status: 500 }
    );
  }
}

// Accepts a blob of pasted text rather than a single address, so one paste of
// many addresses is one request.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text : "";
  const emails = parseEmailList(text);

  if (emails.length === 0) {
    return NextResponse.json(
      { error: "No email addresses found in that text" },
      { status: 400 }
    );
  }

  try {
    const recipients = await addRecipients(emails);
    return NextResponse.json({ recipients });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to add recipients" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const email = request.nextUrl.searchParams.get("email");

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  try {
    await removeRecipient(email);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to remove recipient" },
      { status: 500 }
    );
  }
}
