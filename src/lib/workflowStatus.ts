// In-memory run status, shared across API routes within this server process.
// Good enough for a single-instance local app; not durable across server restarts.

type Status = "idle" | "running";

// Safety net: if n8n's completion callback never arrives (crash, node removed,
// n8n restarted mid-run), don't leave the button stuck forever.
const MAX_RUN_MINUTES = 60;

let status: Status = "idle";
let startedAt: number | null = null;

function isStale(): boolean {
  return (
    status === "running" &&
    startedAt !== null &&
    Date.now() - startedAt > MAX_RUN_MINUTES * 60_000
  );
}

export function getStatus(): { status: Status; startedAt: number | null } {
  if (isStale()) {
    status = "idle";
    startedAt = null;
  }
  return { status, startedAt };
}

export function markRunning(): void {
  status = "running";
  startedAt = Date.now();
}

export function markIdle(): void {
  status = "idle";
  startedAt = null;
}
