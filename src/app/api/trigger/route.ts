import { NextResponse } from "next/server";
import { getStatus, markRunning } from "@/lib/workflowStatus";

export async function POST() {
  const { status } = getStatus();

  if (status === "running") {
    return NextResponse.json(
      { error: "Workflow is currently running. Please wait for it to finish." },
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

  try {
    const res = await fetch(webhookUrl, { method: "GET" });
    const text = await res.text();

    if (res.ok) {
      markRunning();
    }

    return NextResponse.json(
      { ok: res.ok, status: res.status, body: text },
      { status: res.ok ? 200 : 502 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to reach webhook" },
      { status: 502 }
    );
  }
}
