import { NextRequest, NextResponse } from "next/server";
import { getStatus, markRunning } from "@/lib/workflowStatus";
import { replaceAccounts } from "@/lib/sheets";
import { isValidEmail } from "@/lib/recipients";

const ALLOWED_SENDERS = ["saim@octane8studio.com", "sohaib@octane8studio.com"];
const MIN_COUNT = 1;
const MAX_COUNT = 20;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const sender = typeof body?.sender === "string" ? body.sender : "";
  const count = Number(body?.count);
  const recipients: string[] = Array.isArray(body?.recipients)
    ? body.recipients
        .filter((entry: unknown): entry is string => typeof entry === "string")
        .map((entry: string) => entry.trim().toLowerCase())
        .filter((entry: string) => entry.length > 0)
    : [];

  if (!ALLOWED_SENDERS.includes(sender)) {
    return NextResponse.json({ error: "Unknown sender" }, { status: 400 });
  }

  if (!Number.isInteger(count) || count < MIN_COUNT || count > MAX_COUNT) {
    return NextResponse.json(
      { error: `Count must be an integer between ${MIN_COUNT} and ${MAX_COUNT}` },
      { status: 400 }
    );
  }

  if (recipients.length === 0) {
    return NextResponse.json(
      { error: "Select at least one recipient before triggering." },
      { status: 400 }
    );
  }

  const invalid = recipients.filter((email) => !isValidEmail(email));
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `Invalid email address: ${invalid[0]}` },
      { status: 400 }
    );
  }

  const currentStatus = getStatus(sender);
  if (currentStatus.status === "running") {
    return NextResponse.json(
      {
        error: `${sender} already has a run in progress. Please wait for the cooldown to finish.`,
        run: currentStatus,
      },
      { status: 409 }
    );
  }

  const webhookUrl = process.env.N8N_WEBHOOK_URL;

  if (!webhookUrl) {
    return NextResponse.json(
      { error: "N8N_WEBHOOK_URL is not configured" },
      { status: 500 }
    );
  }

  // Narrow n8n's input to just the selected addresses. If this fails we must
  // not fire the webhook — n8n would email whoever the sheet still holds.
  try {
    await replaceAccounts(recipients);
  } catch (err) {
    return NextResponse.json(
      {
        error: `Could not update the Accounts sheet, so nothing was sent: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
      },
      { status: 502 }
    );
  }

  const requestBody = { sender, count };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    const text = await res.text();

    if (res.ok) {
      markRunning(sender);
    }

    return NextResponse.json(
      {
        ok: res.ok,
        status: res.status,
        body: text,
        requestBody,
        recipientCount: recipients.length,
        run: getStatus(sender),
      },
      { status: res.ok ? 200 : 502 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to reach webhook", requestBody },
      { status: 502 }
    );
  }
}
