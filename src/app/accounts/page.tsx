"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type SendingLogEntry = {
  sender: string;
  recipient: string;
  subject: string;
  timestamp: string;
};

type ReplyEntry = {
  originalSender: string;
  replier: string;
  subject: string;
  replySnippet: string;
  timestamp: string;
};

type Tab = "accounts" | "log" | "replies";

function formatTimestamp(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AccountsPage() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("accounts");

  const [accounts, setAccounts] = useState<string[]>([]);
  const [log, setLog] = useState<SendingLogEntry[]>([]);
  const [replies, setReplies] = useState<ReplyEntry[]>([]);

  const [newEmail, setNewEmail] = useState("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function loadAll() {
    const statusRes = await fetch("/api/auth/google/status");
    const statusData = await statusRes.json();
    setConnected(statusData.connected);

    if (!statusData.connected) {
      setLoading(false);
      return;
    }

    const [accountsRes, logRes, repliesRes] = await Promise.all([
      fetch("/api/accounts"),
      fetch("/api/sending-log"),
      fetch("/api/replies"),
    ]);
    const accountsData = await accountsRes.json();
    const logData = await logRes.json();
    const repliesData = await repliesRes.json();

    if (accountsRes.ok) {
      setAccounts(accountsData.accounts);
    } else {
      setError(accountsData.error || "Failed to load accounts");
    }

    if (logRes.ok) {
      setLog(logData.log.slice().reverse());
    }

    if (repliesRes.ok) {
      setReplies(repliesData.replies.slice().reverse());
    }

    setLoading(false);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlError = params.get("error");
    if (urlError) setError(urlError);

    loadAll();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail.trim()) return;

    setBusy(true);
    setError("");

    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail.trim() }),
      });
      const data = await res.json();

      if (res.ok) {
        setNewEmail("");
        await loadAll();
      } else {
        setError(data.error || "Failed to add account");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(email: string) {
    setBusy(true);
    setError("");

    try {
      const res = await fetch(
        `/api/accounts?email=${encodeURIComponent(email)}`,
        { method: "DELETE" }
      );
      const data = await res.json();

      if (res.ok) {
        await loadAll();
      } else {
        setError(data.error || "Failed to remove account");
      }
    } finally {
      setBusy(false);
    }
  }

  if (connected === null || loading) {
    return (
      <main className="page">
        <div className="shell">
          <div className="card skeleton">Loading dashboard...</div>
        </div>
      </main>
    );
  }

  if (!connected) {
    return (
      <main className="page">
        <div className="shell">
          <div className="card connect-card">
            <div className="connect-icon">G</div>
            <h1 className="brand-title">Connect Google Account</h1>
            <p className="brand-subtitle">
              Connect the account that owns the “warmup testing” sheet to
              manage accounts and view activity here.
            </p>
            {error && <div className="banner banner-error">{error}</div>}
            <a href="/api/auth/google/login" className="btn btn-lg">
              Connect Google Account
            </a>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="shell">
        <div className="topbar">
          <div className="brand">
            <p className="brand-title">Warmup Dashboard</p>
            <p className="brand-subtitle">
              Synced with the “warmup testing” Google Sheet
            </p>
          </div>
          <Link href="/" className="nav-link">
            ← Trigger
          </Link>
        </div>

        {error && <div className="banner banner-error">{error}</div>}

        <div className="card" style={{ padding: 0 }}>
          <div className="tabs">
            <button
              className={`tab ${tab === "accounts" ? "active" : ""}`}
              onClick={() => setTab("accounts")}
            >
              Accounts
              <span className="tab-count">{accounts.length}</span>
            </button>
            <button
              className={`tab ${tab === "log" ? "active" : ""}`}
              onClick={() => setTab("log")}
            >
              Sending Log
              <span className="tab-count">{log.length}</span>
            </button>
            <button
              className={`tab ${tab === "replies" ? "active" : ""}`}
              onClick={() => setTab("replies")}
            >
              Replies
              <span className="tab-count">{replies.length}</span>
            </button>
          </div>

          <div style={{ padding: "1.5rem" }}>
            {tab === "accounts" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <form onSubmit={handleAdd} className="form-row">
                  <input
                    type="email"
                    required
                    placeholder="new.employee@example.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="input"
                  />
                  <button type="submit" disabled={busy} className="btn">
                    Add
                  </button>
                </form>

                {accounts.length === 0 ? (
                  <p className="empty-state">No accounts yet.</p>
                ) : (
                  <ul className="list">
                    {accounts.map((email) => (
                      <li key={email} className="list-row">
                        <span className="list-row-email">{email}</span>
                        <button
                          onClick={() => handleRemove(email)}
                          disabled={busy}
                          className="btn btn-danger"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {tab === "log" && (
              <div className="table-wrap">
                {log.length === 0 ? (
                  <p className="empty-state">No sends logged yet.</p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>Sender</th>
                        <th>Recipient</th>
                        <th>Subject</th>
                      </tr>
                    </thead>
                    <tbody>
                      {log.map((entry, i) => (
                        <tr key={i}>
                          <td className="cell-mono">
                            {formatTimestamp(entry.timestamp)}
                          </td>
                          <td>{entry.sender}</td>
                          <td>{entry.recipient}</td>
                          <td className="cell-truncate">{entry.subject}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {tab === "replies" && (
              <div className="table-wrap">
                {replies.length === 0 ? (
                  <p className="empty-state">No replies yet.</p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>Original Sender</th>
                        <th>Replier</th>
                        <th>Subject</th>
                        <th>Snippet</th>
                      </tr>
                    </thead>
                    <tbody>
                      {replies.map((entry, i) => (
                        <tr key={i}>
                          <td className="cell-mono">
                            {formatTimestamp(entry.timestamp)}
                          </td>
                          <td>{entry.originalSender}</td>
                          <td>{entry.replier}</td>
                          <td className="cell-truncate">{entry.subject}</td>
                          <td className="cell-truncate">
                            {entry.replySnippet}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
