"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckIcon,
  MailIcon,
  PeopleIcon,
  RefreshIcon,
  ReplyIcon,
  TrendingUpIcon,
} from "@/components/icons";

const JUST_REFRESHED_DISPLAY_MS = 1600;
// Silently re-pull the sheet on this cadence so new sends/replies that n8n
// writes show up without the user hitting Refresh.
const AUTO_REFRESH_MS = 15_000;

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
type SortDir = "asc" | "desc";
type DetailItem =
  | { kind: "log"; entry: SendingLogEntry }
  | { kind: "reply"; entry: ReplyEntry };

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

function formatFullTimestamp(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function dayKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

const DAYS_IN_TIMELINE = 14;
const CACHE_KEY = "warmup-dashboard-cache-v1";

type CachedDashboard = {
  connected: boolean;
  accounts: string[];
  log: SendingLogEntry[];
  replies: ReplyEntry[];
  lastSynced: string;
};

function readCache(): CachedDashboard | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(data: CachedDashboard): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // Ignore (private browsing / storage disabled) — just skip caching.
  }
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
  const [refreshing, setRefreshing] = useState(false);
  const [justRefreshed, setJustRefreshed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const justRefreshedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [logSearch, setLogSearch] = useState("");
  const [logSortDir, setLogSortDir] = useState<SortDir>("desc");
  const [replySearch, setReplySearch] = useState("");
  const [replySortDir, setReplySortDir] = useState<SortDir>("desc");

  const [detail, setDetail] = useState<DetailItem | null>(null);
  const [confirmClear, setConfirmClear] = useState<"log" | "replies" | null>(null);
  const [clearing, setClearing] = useState(false);

  async function loadAll(isRefresh = false) {
    if (isRefresh) setRefreshing(true);

    // Fire all four requests together instead of waiting on auth-status
    // first — shaves a full round trip off every load.
    const [statusRes, accountsRes, logRes, repliesRes] = await Promise.all([
      fetch("/api/auth/google/status"),
      fetch("/api/accounts"),
      fetch("/api/sending-log"),
      fetch("/api/replies"),
    ]);

    const statusData = await statusRes.json();
    setConnected(statusData.connected);

    if (!statusData.connected) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const [accountsData, logData, repliesData] = await Promise.all([
      accountsRes.json(),
      logRes.json(),
      repliesRes.json(),
    ]);

    let nextAccounts = accounts;
    let nextLog = log;
    let nextReplies = replies;

    if (accountsRes.ok) {
      nextAccounts = accountsData.accounts;
      setAccounts(nextAccounts);
    } else {
      setError(accountsData.error || "Failed to load accounts");
    }

    if (logRes.ok) {
      nextLog = logData.log;
      setLog(nextLog);
    }
    if (repliesRes.ok) {
      nextReplies = repliesData.replies;
      setReplies(nextReplies);
    }

    const syncedAt = new Date();
    setLastSynced(syncedAt);
    setLoading(false);
    setRefreshing(false);

    writeCache({
      connected: true,
      accounts: nextAccounts,
      log: nextLog,
      replies: nextReplies,
      lastSynced: syncedAt.toISOString(),
    });
  }

  async function handleManualRefresh() {
    await loadAll(true);
    setJustRefreshed(true);

    if (justRefreshedTimeoutRef.current) {
      clearTimeout(justRefreshedTimeoutRef.current);
    }
    justRefreshedTimeoutRef.current = setTimeout(() => {
      setJustRefreshed(false);
    }, JUST_REFRESHED_DISPLAY_MS);
  }

  // Keep a live handle to the latest loadAll so the auto-refresh interval
  // below always calls the current closure instead of a stale one.
  const loadAllRef = useRef(loadAll);
  loadAllRef.current = loadAll;

  useEffect(() => {
    return () => {
      if (justRefreshedTimeoutRef.current) {
        clearTimeout(justRefreshedTimeoutRef.current);
      }
    };
  }, []);

  // Auto-refresh once connected: a silent loadAll (no spinner, no "Updated"
  // pulse, no entrance-animation replay) so the tables and counts reflect
  // new rows n8n writes to the sheet on their own.
  useEffect(() => {
    if (connected !== true) return;
    const id = setInterval(() => loadAllRef.current(false), AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [connected]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlError = params.get("error");
    if (urlError) setError(urlError);

    // Show cached data instantly (if we have it from a previous visit this
    // session), then silently revalidate in the background — avoids the
    // full loading skeleton every time you navigate back to this page.
    const cached = readCache();
    if (cached) {
      setConnected(cached.connected);
      setAccounts(cached.accounts);
      setLog(cached.log);
      setReplies(cached.replies);
      setLastSynced(new Date(cached.lastSynced));
      setLoading(false);
      loadAll(true);
    } else {
      loadAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  async function handleClearAll() {
    if (!confirmClear) return;
    const kind = confirmClear;

    setClearing(true);
    setError("");

    try {
      const res = await fetch(kind === "log" ? "/api/sending-log" : "/api/replies", {
        method: "DELETE",
      });
      const data = await res.json();

      if (res.ok) {
        if (kind === "log") setLog([]);
        else setReplies([]);
        setConfirmClear(null);
      } else {
        setError(data.error || `Failed to clear ${kind === "log" ? "Sending Log" : "Replies"}`);
      }
    } finally {
      setClearing(false);
    }
  }

  // ---- Derived stats ----

  const replyRate = log.length > 0 ? (replies.length / log.length) * 100 : 0;

  const senderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    log.forEach((entry) => {
      counts.set(entry.sender, (counts.get(entry.sender) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
  }, [log]);

  const maxSenderCount = Math.max(1, ...senderCounts.map(([, count]) => count));
  const seriesColors = ["var(--series-1)", "var(--series-2)", "#eda100", "#008300"];

  const timeline = useMemo(() => {
    const counts = new Map<string, number>();
    log.forEach((entry) => {
      const key = dayKey(entry.timestamp);
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    });

    const days: { key: string; count: number }[] = [];
    const today = new Date();
    for (let i = DAYS_IN_TIMELINE - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({ key, count: counts.get(key) ?? 0 });
    }
    return days;
  }, [log]);

  const maxDayCount = Math.max(1, ...timeline.map((d) => d.count));

  const accountActivity = useMemo(() => {
    const map = new Map<string, { sent: number; received: number }>();
    accounts.forEach((email) => map.set(email, { sent: 0, received: 0 }));
    log.forEach((entry) => {
      if (map.has(entry.sender)) map.get(entry.sender)!.sent += 1;
      if (map.has(entry.recipient)) map.get(entry.recipient)!.received += 1;
    });
    return map;
  }, [accounts, log]);

  const filteredLog = useMemo(() => {
    const term = logSearch.trim().toLowerCase();
    const rows = !term
      ? log
      : log.filter(
          (entry) =>
            entry.sender.toLowerCase().includes(term) ||
            entry.recipient.toLowerCase().includes(term) ||
            entry.subject.toLowerCase().includes(term)
        );
    return rows.slice().sort((a, b) => {
      const diff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      return logSortDir === "asc" ? diff : -diff;
    });
  }, [log, logSearch, logSortDir]);

  const filteredReplies = useMemo(() => {
    const term = replySearch.trim().toLowerCase();
    const rows = !term
      ? replies
      : replies.filter(
          (entry) =>
            entry.originalSender.toLowerCase().includes(term) ||
            entry.replier.toLowerCase().includes(term) ||
            entry.subject.toLowerCase().includes(term) ||
            entry.replySnippet.toLowerCase().includes(term)
        );
    return rows.slice().sort((a, b) => {
      const diff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      return replySortDir === "asc" ? diff : -diff;
    });
  }, [replies, replySearch, replySortDir]);

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
            <div className="connect-icon">!</div>
            <h1 className="brand-title">Dashboard data unavailable</h1>
            <p className="brand-subtitle">
              The Google Sheets connection isn&apos;t set up yet. Contact the
              site admin to get this connected.
            </p>
            {error && <div className="banner banner-error">{error}</div>}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="shell dash-pop">
        <div className="topbar">
          <div className="brand">
            <p className="brand-title">Warmup Dashboard</p>
            <p className="brand-subtitle">
              {lastSynced
                ? `Synced ${lastSynced.toLocaleTimeString()} · “warmup testing” sheet`
                : "Synced with the “warmup testing” sheet"}
            </p>
          </div>
          <button
            className={`icon-btn ${justRefreshed ? "just-refreshed" : ""}`}
            onClick={handleManualRefresh}
            disabled={refreshing}
            title="Refresh dashboard data"
          >
            {justRefreshed ? (
              <CheckIcon size={16} />
            ) : (
              <RefreshIcon
                size={16}
                className={`refresh-icon ${refreshing ? "spinning" : ""}`}
              />
            )}
            {refreshing ? "Refreshing…" : justRefreshed ? "Updated" : "Refresh"}
          </button>
        </div>

        {error && <div className="banner banner-error">{error}</div>}

        <div className="stats-grid">
          <div className="stat-tile">
            <div className="stat-tile-head">
              <p className="stat-label">Accounts in rotation</p>
              <span className="icon-chip icon-chip-blue">
                <PeopleIcon size={18} />
              </span>
            </div>
            <div className="stat-value">{accounts.length}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile-head">
              <p className="stat-label">Emails sent</p>
              <span className="icon-chip icon-chip-green">
                <MailIcon size={18} />
              </span>
            </div>
            <div className="stat-value">{log.length}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile-head">
              <p className="stat-label">Replies received</p>
              <span className="icon-chip icon-chip-purple">
                <ReplyIcon size={18} />
              </span>
            </div>
            <div className="stat-value">{replies.length}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile-head">
              <p className="stat-label">Reply rate</p>
              <span className="icon-chip icon-chip-orange">
                <TrendingUpIcon size={18} />
              </span>
            </div>
            <div className="stat-value">{replyRate.toFixed(0)}%</div>
            <p className={`stat-caption ${replyRate >= 50 ? "good" : "warn"}`}>
              replies ÷ emails sent
            </p>
          </div>
        </div>

        <div className="charts-row">
          <div className="card">
            <p className="chart-title">Sends — last {DAYS_IN_TIMELINE} days</p>
            <div className="timeline">
              {timeline.map((d) => (
                <div className="timeline-bar-wrap" key={d.key}>
                  {d.count > 0 && (
                    <div className="timeline-tooltip">
                      {d.count} on{" "}
                      {new Date(d.key).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                  )}
                  <div
                    className="timeline-bar"
                    style={{ height: `${(d.count / maxDayCount) * 100}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="timeline-axis">
              <span>
                {new Date(timeline[0]?.key).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
              <span>Today</span>
            </div>
          </div>

          <div className="card">
            <p className="chart-title">Sends by sender</p>
            {senderCounts.length === 0 ? (
              <p className="empty-state" style={{ padding: "1.5rem 0" }}>
                No sends yet.
              </p>
            ) : (
              <div className="bar-compare">
                {senderCounts.map(([sender, count], i) => (
                  <div className="bar-compare-row" key={sender}>
                    <span className="bar-compare-label" title={sender}>
                      {sender}
                    </span>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{
                          width: `${(count / maxSenderCount) * 100}%`,
                          background: seriesColors[i % seriesColors.length],
                        }}
                      />
                    </div>
                    <span className="bar-compare-value">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

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
                    {accounts.map((email) => {
                      const activity = accountActivity.get(email);
                      const hasActivity =
                        activity && (activity.sent > 0 || activity.received > 0);
                      return (
                        <li key={email} className="list-row">
                          <span className="list-row-main">
                            <span className="avatar">{email.charAt(0)}</span>
                            <span className="list-row-text">
                              <span className="list-row-email">{email}</span>
                              {hasActivity && (
                                <p className="list-row-caption">
                                  sent {activity!.sent} · received{" "}
                                  {activity!.received}
                                </p>
                              )}
                            </span>
                          </span>
                          <button
                            onClick={() => handleRemove(email)}
                            disabled={busy}
                            className="link-action"
                          >
                            Remove
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {tab === "log" && (
              <>
                <div className="toolbar">
                  <input
                    className="input search-input"
                    placeholder="Search sender, recipient, or subject…"
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                  />
                  <span className="stat-caption">
                    {filteredLog.length} of {log.length} shown · click a row for details
                  </span>
                  <button
                    className="link-action"
                    onClick={() => setConfirmClear("log")}
                    disabled={log.length === 0}
                  >
                    Clear all
                  </button>
                </div>
                <div className="table-wrap">
                  {filteredLog.length === 0 ? (
                    <p className="empty-state">
                      {log.length === 0 ? "No sends logged yet." : "No matches."}
                    </p>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th
                            className="th-sort"
                            onClick={() =>
                              setLogSortDir((d) => (d === "asc" ? "desc" : "asc"))
                            }
                          >
                            Timestamp
                            <span className="sort-arrow">
                              {logSortDir === "asc" ? "▲" : "▼"}
                            </span>
                          </th>
                          <th>Sender</th>
                          <th>Recipient</th>
                          <th>Subject</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredLog.map((entry, i) => (
                          <tr
                            key={i}
                            className="row-clickable"
                            onClick={() => setDetail({ kind: "log", entry })}
                          >
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
              </>
            )}

            {tab === "replies" && (
              <>
                <div className="toolbar">
                  <input
                    className="input search-input"
                    placeholder="Search sender, replier, subject, or snippet…"
                    value={replySearch}
                    onChange={(e) => setReplySearch(e.target.value)}
                  />
                  <span className="stat-caption">
                    {filteredReplies.length} of {replies.length} shown · click a row for details
                  </span>
                  <button
                    className="link-action"
                    onClick={() => setConfirmClear("replies")}
                    disabled={replies.length === 0}
                  >
                    Clear all
                  </button>
                </div>
                <div className="table-wrap">
                  {filteredReplies.length === 0 ? (
                    <p className="empty-state">
                      {replies.length === 0 ? "No replies yet." : "No matches."}
                    </p>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th
                            className="th-sort"
                            onClick={() =>
                              setReplySortDir((d) => (d === "asc" ? "desc" : "asc"))
                            }
                          >
                            Timestamp
                            <span className="sort-arrow">
                              {replySortDir === "asc" ? "▲" : "▼"}
                            </span>
                          </th>
                          <th>Original Sender</th>
                          <th>Replier</th>
                          <th>Subject</th>
                          <th>Snippet</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredReplies.map((entry, i) => (
                          <tr
                            key={i}
                            className="row-clickable"
                            onClick={() => setDetail({ kind: "reply", entry })}
                          >
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
              </>
            )}
          </div>
        </div>
      </div>

      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setDetail(null)}>
              ✕
            </button>

            {detail.kind === "log" ? (
              <>
                <h2 className="modal-title">Sent email</h2>
                <div className="modal-field">
                  <p className="modal-field-label">Timestamp</p>
                  <p className="modal-field-value">
                    {formatFullTimestamp(detail.entry.timestamp)}
                  </p>
                </div>
                <div className="modal-field">
                  <p className="modal-field-label">Sender</p>
                  <p className="modal-field-value">{detail.entry.sender}</p>
                </div>
                <div className="modal-field">
                  <p className="modal-field-label">Recipient</p>
                  <p className="modal-field-value">{detail.entry.recipient}</p>
                </div>
                <div className="modal-field">
                  <p className="modal-field-label">Subject</p>
                  <p className="modal-field-value">{detail.entry.subject}</p>
                </div>
              </>
            ) : (
              <>
                <h2 className="modal-title">Reply</h2>
                <div className="modal-field">
                  <p className="modal-field-label">Timestamp</p>
                  <p className="modal-field-value">
                    {formatFullTimestamp(detail.entry.timestamp)}
                  </p>
                </div>
                <div className="modal-field">
                  <p className="modal-field-label">Original sender</p>
                  <p className="modal-field-value">
                    {detail.entry.originalSender}
                  </p>
                </div>
                <div className="modal-field">
                  <p className="modal-field-label">Replier</p>
                  <p className="modal-field-value">{detail.entry.replier}</p>
                </div>
                <div className="modal-field">
                  <p className="modal-field-label">Subject</p>
                  <p className="modal-field-value">{detail.entry.subject}</p>
                </div>
                <div className="modal-field">
                  <p className="modal-field-label">Full reply</p>
                  <div className="snippet-text">
                    {detail.entry.replySnippet}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {confirmClear && (
        <div className="modal-overlay" onClick={() => !clearing && setConfirmClear(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close"
              onClick={() => setConfirmClear(null)}
              disabled={clearing}
            >
              ✕
            </button>
            <h2 className="modal-title">
              Clear all {confirmClear === "log" ? "Sending Log" : "Replies"} entries?
            </h2>
            <p style={{ fontSize: "0.9rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
              This permanently deletes every row in the{" "}
              {confirmClear === "log" ? "Sending Log" : "Replies"} tab of the connected
              Google Sheet, not just what's shown here. This cannot be undone.
              {confirmClear === "log" && (
                <>
                  {" "}
                  The n8n workflow also reads this log to avoid re-emailing the same
                  recipient within 12 hours — clearing it resets that history.
                </>
              )}
            </p>
            {error && <div className="banner banner-error">{error}</div>}
            <div style={{ display: "flex", gap: "0.6rem", justifyContent: "flex-end" }}>
              <button
                className="btn btn-secondary"
                onClick={() => setConfirmClear(null)}
                disabled={clearing}
              >
                Cancel
              </button>
              <button
                className="btn"
                style={{ background: "var(--danger)" }}
                onClick={handleClearAll}
                disabled={clearing}
              >
                {clearing && <span className="spinner" />}
                {clearing ? "Clearing…" : "Clear all"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
