// Per-sender run status, persisted to a JSON file in the OS temp directory.
//
// Next.js dev mode compiles API routes lazily on first hit, and the first
// compile of a *new* route can reset plain in-memory module state shared
// with already-compiled routes. Persisting to disk sidesteps that entirely
// (and survives a dev server restart as a bonus).
//
// The temp dir (not process.cwd()) is deliberate: serverless platforms
// (Vercel, etc.) ship a read-only filesystem everywhere except /tmp. This
// state is instance-scoped there — fine for a soft, best-effort cooldown
// lock, but not a source of truth you can rely on across cold starts or
// multiple concurrent instances.

import fs from "fs";
import os from "os";
import path from "path";

type Status = "idle" | "running";
type SenderState = { status: Status; startedAt: number | null };
type StatusFile = Record<string, SenderState>;

// Primary unlock mechanism: each trigger locks its sender for this long.
// n8n can also unlock early via the completion callback (POST route).
const COOLDOWN_MINUTES = 30;

const STATUS_PATH = path.join(os.tmpdir(), "octane8-workflow-status.json");

function readAll(): StatusFile {
  try {
    return JSON.parse(fs.readFileSync(STATUS_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function writeAll(data: StatusFile): void {
  fs.writeFileSync(STATUS_PATH, JSON.stringify(data, null, 2));
}

function expireIfDone(entry: SenderState): SenderState {
  if (
    entry.status === "running" &&
    entry.startedAt !== null &&
    Date.now() - entry.startedAt > COOLDOWN_MINUTES * 60_000
  ) {
    return { status: "idle", startedAt: null };
  }
  return entry;
}

export function getStatus(sender: string): {
  status: Status;
  startedAt: number | null;
  availableAt: number | null;
} {
  const all = readAll();
  const entry = expireIfDone(all[sender] ?? { status: "idle", startedAt: null });

  return {
    status: entry.status,
    startedAt: entry.startedAt,
    availableAt:
      entry.status === "running" && entry.startedAt !== null
        ? entry.startedAt + COOLDOWN_MINUTES * 60_000
        : null,
  };
}

export function markRunning(sender: string): void {
  const all = readAll();
  all[sender] = { status: "running", startedAt: Date.now() };
  writeAll(all);
}

export function markIdle(sender: string): void {
  const all = readAll();
  all[sender] = { status: "idle", startedAt: null };
  writeAll(all);
}

export function markAllIdle(): void {
  const all = readAll();
  for (const sender of Object.keys(all)) {
    all[sender] = { status: "idle", startedAt: null };
  }
  writeAll(all);
}
