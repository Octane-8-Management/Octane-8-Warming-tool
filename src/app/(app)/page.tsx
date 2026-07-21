"use client";

import { useEffect, useRef, useState } from "react";
import { BoltIcon } from "@/components/icons";

type TriggerStatus = "idle" | "loading" | "error";
type RunStatus = "idle" | "running";
type Accent = "blue" | "purple";

const POLL_INTERVAL_MS = 5000;
const TICK_INTERVAL_MS = 1000;
const MIN_COUNT = 1;
const MAX_COUNT = 20;
const COOLDOWN_MINUTES = 30;
const COOLDOWN_MS = COOLDOWN_MINUTES * 60_000;

// Server run state lives in /tmp, which is per-instance on serverless: a poll
// can land on an instance that never saw the trigger and answer "idle" while
// the run is very much alive. Treat a lone idle reply as noise and only drop
// the cooldown after this many in a row, so the bar stops flickering while
// n8n's early-unlock callback still lands within ~15s.
const IDLE_CONFIRMATIONS = 3;

function TriggerCard({
  label,
  senderEmail,
  accent,
}: {
  label: string;
  senderEmail: string;
  accent: Accent;
}) {
  const [count, setCount] = useState(5);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [triggerStatus, setTriggerStatus] = useState<TriggerStatus>("idle");
  const [message, setMessage] = useState("");
  const [lastPayload, setLastPayload] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idleStreak = useRef(0);

  // The cooldown is a pure function of startedAt, so the client can run it on
  // its own and survive both a page reload and an amnesiac server instance.
  const storageKey = `octane8:cooldown:${senderEmail}`;

  function beginCooldown(ts: number) {
    idleStreak.current = 0;
    setStartedAt(ts);
    try {
      localStorage.setItem(storageKey, String(ts));
    } catch {
      // Private mode / storage disabled: in-memory state still works.
    }
  }

  function endCooldown() {
    idleStreak.current = 0;
    setStartedAt(null);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Ignore.
    }
  }

  async function pollStatus() {
    try {
      const res = await fetch(
        `/api/workflow-status?sender=${encodeURIComponent(senderEmail)}`
      );
      const data = await res.json();

      if (data.status === "running" && typeof data.startedAt === "number") {
        beginCooldown(data.startedAt);
        return;
      }

      idleStreak.current += 1;
      if (idleStreak.current >= IDLE_CONFIRMATIONS) endCooldown();
    } catch {
      // Ignore transient poll failures; next tick will retry.
    }
  }

  useEffect(() => {
    const stored = Number(localStorage.getItem(storageKey));
    if (Number.isFinite(stored) && stored > 0 && Date.now() - stored < COOLDOWN_MS) {
      setStartedAt(stored);
    }

    idleStreak.current = 0;
    pollStatus();
    pollRef.current = setInterval(pollStatus, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [senderEmail]);

  // Only tick while something is actually counting down, and expire the run
  // locally at 30 minutes rather than waiting for the server to agree.
  useEffect(() => {
    if (startedAt === null) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t - startedAt >= COOLDOWN_MS) endCooldown();
    }, TICK_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt]);

  async function handleTrigger() {
    setTriggerStatus("loading");
    setMessage("");

    const payload = { sender: senderEmail, count };
    setLastPayload(JSON.stringify(payload, null, 2));

    try {
      const res = await fetch("/api/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.ok) {
        setTriggerStatus("idle");
        beginCooldown(data.run?.startedAt ?? Date.now());
        setMessage(`Triggered for ${label} (count: ${count}).`);
      } else {
        setTriggerStatus("error");
        setMessage(data.error || `Request failed with status ${res.status}`);
        // A 409 means the server knows about a run we lost track of; adopt it.
        if (res.status === 409) pollStatus();
      }
    } catch (err) {
      setTriggerStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  const availableAt = startedAt !== null ? startedAt + COOLDOWN_MS : null;
  const remainingMs = availableAt !== null ? availableAt - now : 0;
  const runStatus: RunStatus = remainingMs > 0 ? "running" : "idle";
  const isBusy = runStatus === "running" || triggerStatus === "loading";

  const remainingLabel =
    remainingMs >= 60_000
      ? `Available in ${Math.ceil(remainingMs / 60_000)} min`
      : "Available in under a minute";

  const cooldownPercent = Math.max(
    0,
    Math.min(100, (remainingMs / COOLDOWN_MS) * 100)
  );

  function setClampedCount(next: number) {
    setCount(Math.min(MAX_COUNT, Math.max(MIN_COUNT, next)));
  }

  function handleCountChange(value: string) {
    const parsed = parseInt(value, 10);
    setClampedCount(Number.isNaN(parsed) ? MIN_COUNT : parsed);
  }

  return (
    <div className="card trigger-card">
      <div className="trigger-card-head">
        <span className={`trigger-avatar icon-chip-${accent}`}>
          {label.charAt(0)}
        </span>
        <div>
          <p className="trigger-name">{label}</p>
          <p className="trigger-email">{senderEmail}</p>
        </div>
      </div>

      <span className={`status-pill ${runStatus}`}>
        <span className="status-dot" />
        {runStatus === "running" ? remainingLabel : "Ready"}
      </span>

      {runStatus === "running" && (
        <div className="cooldown-track" title={`${COOLDOWN_MINUTES}-minute cooldown`}>
          <div className="cooldown-fill" style={{ width: `${cooldownPercent}%` }} />
        </div>
      )}

      <div className="count-field">
        <label htmlFor={`count-${senderEmail}`}>How many emails to send</label>
        <div className="stepper">
          <button
            type="button"
            className="stepper-btn"
            disabled={isBusy || count <= MIN_COUNT}
            onClick={() => setClampedCount(count - 1)}
            aria-label={`Decrease count for ${label}`}
          >
            −
          </button>
          <input
            id={`count-${senderEmail}`}
            type="number"
            className="stepper-input"
            min={MIN_COUNT}
            max={MAX_COUNT}
            value={count}
            disabled={isBusy}
            onChange={(e) => handleCountChange(e.target.value)}
          />
          <button
            type="button"
            className="stepper-btn"
            disabled={isBusy || count >= MAX_COUNT}
            onClick={() => setClampedCount(count + 1)}
            aria-label={`Increase count for ${label}`}
          >
            +
          </button>
        </div>
      </div>

      <button onClick={handleTrigger} disabled={isBusy} className="btn btn-lg">
        {triggerStatus === "loading" ? (
          <span className="spinner" />
        ) : (
          <BoltIcon size={16} />
        )}
        {triggerStatus === "loading"
          ? "Triggering..."
          : runStatus === "running"
          ? "Running..."
          : `Trigger ${label}`}
      </button>

      {triggerStatus === "error" && (
        <div className="banner banner-error">{message}</div>
      )}
      {triggerStatus === "idle" && runStatus === "running" && message && (
        <div className="banner banner-success">{message}</div>
      )}

      {lastPayload && (
        <details className="payload-preview">
          <summary>Last webhook request ▾</summary>
          <code>{lastPayload}</code>
        </details>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <main className="page">
      <div className="shell">
        <div className="topbar">
          <div className="brand">
            <p className="brand-title">Trigger Warmup</p>
            <p className="brand-subtitle">
              Kick off the account warmup n8n workflow, per sender
            </p>
          </div>
        </div>

        <div className="trigger-grid">
          <TriggerCard
            label="Saim"
            senderEmail="saim@octane8studio.com"
            accent="blue"
          />
          <TriggerCard
            label="Sohaib"
            senderEmail="sohaib@octane8studio.com"
            accent="purple"
          />
        </div>
      </div>
    </main>
  );
}
