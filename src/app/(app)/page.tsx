"use client";

import { useEffect, useRef, useState } from "react";
import { BoltIcon } from "@/components/icons";

type TriggerStatus = "idle" | "loading" | "error";
type RunStatus = "idle" | "running";
type Accent = "blue" | "purple";

const POLL_INTERVAL_MS = 5000;
const TICK_INTERVAL_MS = 5000;
const MIN_COUNT = 1;
const MAX_COUNT = 20;
const COOLDOWN_MINUTES = 30;

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
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [availableAt, setAvailableAt] = useState<number | null>(null);
  const [triggerStatus, setTriggerStatus] = useState<TriggerStatus>("idle");
  const [message, setMessage] = useState("");
  const [lastPayload, setLastPayload] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function pollStatus() {
    try {
      const res = await fetch(
        `/api/workflow-status?sender=${encodeURIComponent(senderEmail)}`
      );
      const data = await res.json();
      setRunStatus(data.status === "running" ? "running" : "idle");
      setStartedAt(data.startedAt ?? null);
      setAvailableAt(data.availableAt ?? null);
    } catch {
      // Ignore transient poll failures; next tick will retry.
    }
  }

  useEffect(() => {
    pollStatus();
    pollRef.current = setInterval(pollStatus, POLL_INTERVAL_MS);
    tickRef.current = setInterval(() => setNow(Date.now()), TICK_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [senderEmail]);

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
        setRunStatus("running");
        setStartedAt(data.run?.startedAt ?? Date.now());
        setAvailableAt(data.run?.availableAt ?? null);
        setMessage(`Triggered for ${label} (count: ${count}).`);
      } else {
        setTriggerStatus("error");
        setMessage(data.error || `Request failed with status ${res.status}`);
        if (res.status === 409) setRunStatus("running");
      }
    } catch (err) {
      setTriggerStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  const isBusy = runStatus === "running" || triggerStatus === "loading";

  const remainingMin =
    runStatus === "running" && availableAt
      ? Math.max(1, Math.ceil((availableAt - now) / 60000))
      : null;

  const cooldownPercent =
    runStatus === "running" && startedAt && availableAt
      ? Math.max(
          0,
          Math.min(100, ((availableAt - now) / (availableAt - startedAt)) * 100)
        )
      : 0;

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
        {runStatus === "running" ? `Available in ${remainingMin} min` : "Ready"}
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
