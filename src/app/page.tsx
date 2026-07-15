"use client";

import { useEffect, useRef, useState } from "react";

type TriggerStatus = "idle" | "loading" | "error";
type RunStatus = "idle" | "running";

const POLL_INTERVAL_MS = 5000;

export default function Home() {
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [triggerStatus, setTriggerStatus] = useState<TriggerStatus>("idle");
  const [message, setMessage] = useState<string>("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function pollStatus() {
    try {
      const res = await fetch("/api/workflow-status");
      const data = await res.json();
      setRunStatus(data.status === "running" ? "running" : "idle");
    } catch {
      // Ignore transient poll failures; next tick will retry.
    }
  }

  useEffect(() => {
    pollStatus();
    pollRef.current = setInterval(pollStatus, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function handleTrigger() {
    setTriggerStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/trigger", { method: "POST" });
      const data = await res.json();

      if (res.ok) {
        setTriggerStatus("idle");
        setRunStatus("running");
        setMessage("Workflow triggered successfully.");
      } else {
        setTriggerStatus("error");
        setMessage(data.error || `Request failed with status ${data.status}`);
        if (res.status === 409) {
          setRunStatus("running");
        }
      }
    } catch (err) {
      setTriggerStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  const isBusy = runStatus === "running" || triggerStatus === "loading";

  return (
    <main className="page">
      <div className="shell">
        <div className="topbar">
          <div className="brand">
            <p className="brand-title">Trigger Warmup</p>
            <p className="brand-subtitle">
              Kick off the account warmup n8n workflow
            </p>
          </div>
        </div>

        <div className="card trigger-card">
          <span className={`status-pill ${runStatus}`}>
            <span className="status-dot" />
            {runStatus === "running" ? "Workflow running" : "Ready"}
          </span>

          <button
            onClick={handleTrigger}
            disabled={isBusy}
            className="btn btn-lg"
          >
            {triggerStatus === "loading" && <span className="spinner" />}
            {triggerStatus === "loading"
              ? "Triggering..."
              : runStatus === "running"
              ? "Workflow is currently running..."
              : "Trigger Warmup Workflow"}
          </button>

          {triggerStatus === "error" && (
            <div className="banner banner-error">{message}</div>
          )}
          {triggerStatus === "idle" && runStatus === "idle" && message && (
            <div className="banner banner-success">{message}</div>
          )}
        </div>
      </div>
    </main>
  );
}
