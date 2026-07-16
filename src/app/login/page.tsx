"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (res.ok) {
        router.push(searchParams.get("next") || "/");
        router.refresh();
      } else {
        setError(data.error || "Login failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      className="page"
      style={{ minHeight: "100vh", justifyContent: "center" }}
    >
      <div className="shell" style={{ maxWidth: "360px" }}>
        <div className="card" style={{ padding: "2.5rem 2rem" }}>
          <h1 className="brand-title" style={{ textAlign: "center", marginBottom: "0.4rem" }}>
            Octane 8
          </h1>
          <p
            className="brand-subtitle"
            style={{ textAlign: "center", marginBottom: "1.75rem" }}
          >
            Sign in to the warmup console
          </p>

          <form
            onSubmit={handleSubmit}
            style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}
          >
            <div className="form-field">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            {error && <div className="banner banner-error">{error}</div>}

            <button type="submit" className="btn btn-lg" disabled={busy}>
              {busy && <span className="spinner" />}
              {busy ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
