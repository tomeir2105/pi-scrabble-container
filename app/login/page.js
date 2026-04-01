"use client";

import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({ password })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) {
        setError(data?.error || "ההתחברות נכשלה.");
        setBusy(false);
        return;
      }

      window.location.href = "/";
    } catch {
      setError("ההתחברות נכשלה.");
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <section className="hero-card" style={{ maxWidth: 520 }}>
        <div className="eyebrow">גישה פרטית</div>
        <h1>סקרבלייב</h1>
        <p className="hero-copy">הכניסו סיסמה משותפת כדי להמשיך.</p>

        <form onSubmit={handleSubmit} className="panel-grid" style={{ marginTop: 24 }}>
          <label className="field-label" htmlFor="password">
            סיסמה
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            className="text-input"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            maxLength={128}
            required
          />
          <div className="actions">
            <button className="primary-button" type="submit" disabled={busy || !password}>
              {busy ? "בודק..." : "כניסה"}
            </button>
          </div>
        </form>

        <div className="status-banner" role="status" aria-live="polite">
          {error || "גישה למשתמשים מורשים בלבד."}
        </div>
      </section>
    </main>
  );
}
