"use client";

import { useEffect, useState } from "react";
import { BoltIcon } from "@/components/icons";

type TriggerStatus = "idle" | "loading" | "error";
type Accent = "blue" | "purple";

const MIN_COUNT = 1;
const MAX_COUNT = 20;
// Matches the server's COOLDOWN_SECONDS in workflowStatus.ts — used only as
// a fallback if a response somehow doesn't include the server's own
// availableAt.
const DEFAULT_LOCKOUT_MS = 15_000;

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
  const [unlockAt, setUnlockAt] = useState<number | null>(null);
  const [triggerStatus, setTriggerStatus] = useState<TriggerStatus>("idle");
  const [message, setMessage] = useState("");
  const [lastPayload, setLastPayload] = useState("");
  const [now, setNow] = useState(() => Date.now());

  // One-shot check on load — e.g. someone else just triggered this sender
  // from another browser. Deliberately NOT a repeating poll: reconciling
  // with server run-state on an interval is what caused the flicker before,
  // since that state lives in a per-instance temp file on serverless. A
  // short fixed lockout after a successful trigger is enough on its own.
  useEffect(() => {
    let cancelled = false;

    fetch(`/api/workflow-status?sender=${encodeURIComponent(senderEmail)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.status === "running" && typeof data.availableAt === "number") {
          setUnlockAt(data.availableAt);
        }
      })
      .catch(() => {
        // Ignore; worst case the button is enabled and a real lock still
        // guarding server-side surfaces as a 409 on click.
      });

    return () => {
      cancelled = true;
    };
  }, [senderEmail]);

  // Only tick while actually counting down.
  useEffect(() => {
    if (unlockAt === null) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= unlockAt) setUnlockAt(null);
    }, 1000);
    return () => clearInterval(id);
  }, [unlockAt]);

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
        setUnlockAt(data.run?.availableAt ?? Date.now() + DEFAULT_LOCKOUT_MS);
        setMessage(`Triggered for ${label} (count: ${count}).`);
      } else {
        setTriggerStatus("error");
        setMessage(data.error || `Request failed with status ${res.status}`);
        // A 409 means the server knows about a lock we lost track of; adopt it.
        if (res.status === 409 && typeof data.run?.availableAt === "number") {
          setUnlockAt(data.run.availableAt);
        }
      }
    } catch (err) {
      setTriggerStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  const remainingSeconds =
    unlockAt !== null ? Math.max(0, Math.ceil((unlockAt - now) / 1000)) : 0;
  const isLocked = unlockAt !== null && remainingSeconds > 0;
  const isBusy = isLocked || triggerStatus === "loading";

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

      <span className={`status-pill ${isLocked ? "running" : "idle"}`}>
        <span className="status-dot" />
        {isLocked ? `Available in ${remainingSeconds}s` : "Ready"}
      </span>

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
          : isLocked
          ? `Wait ${remainingSeconds}s`
          : `Trigger ${label}`}
      </button>

      {triggerStatus === "error" && (
        <div className="banner banner-error">{message}</div>
      )}
      {triggerStatus === "idle" && message && (
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
