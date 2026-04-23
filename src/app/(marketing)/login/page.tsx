"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { redirectAfterAuth } from "@/lib/auth/redirect";

/* ─── Pipeline widget — replaces the emoji chat demo ───────────── */
const STAGES = [
  { label: "New",        count: 24, pct: 100 },
  { label: "Contacted",  count: 18, pct: 75  },
  { label: "Interested", count: 12, pct: 50  },
  { label: "Ready",      count:  7, pct: 29  },
];

function PipelineSnapshot() {
  return (
    <div style={{
      border: "1px solid #E5E7EB",
      borderRadius: 10,
      overflow: "hidden",
      background: "#fff",
    }}>
      {/* Header row */}
      <div style={{
        padding: "12px 16px",
        borderBottom: "1px solid #F3F4F6",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#374151", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Pipeline
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#059669", fontWeight: 500 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#36F4A4", display: "inline-block" }} />
          Live
        </span>
      </div>

      {/* Stage rows */}
      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 11 }}>
        {STAGES.map((s, i) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 70, fontSize: 12, color: "#6B7280", flexShrink: 0 }}>{s.label}</span>
            <div style={{ flex: 1, height: 5, background: "#F3F4F6", borderRadius: 3, overflow: "hidden" }}>
              <div
                className={`auth-bar-inner auth-bar-${i + 1}`}
                style={{ height: "100%", width: `${s.pct}%`, background: "#061A1C", borderRadius: 3 }}
              />
            </div>
            <span style={{ width: 22, fontSize: 12, fontWeight: 600, color: "#111827", textAlign: "right", flexShrink: 0 }}>
              {s.count}
            </span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        padding: "10px 16px",
        borderTop: "1px solid #F3F4F6",
        fontSize: 11, color: "#9CA3AF",
      }}>
        3 deals closed in the last 24 hrs
      </div>
    </div>
  );
}

/* ─── Password visibility toggle icon ──────────────────────────── */
function EyeIcon({ off }: { off?: boolean }) {
  return off ? (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  ) : (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

/* ─── Login page ────────────────────────────────────────────────── */
export default function LoginPage() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    const destination = await redirectAfterAuth();
    window.location.href = destination;
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F7F8F5", display: "flex", flexDirection: "column" }}>

      {/* Top bar */}
      <header className="auth-reveal auth-reveal-1" style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "20px 32px",
        borderBottom: "1px solid #EAECE6",
        background: "#fff",
      }}>
        {/* Logo */}
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none" }}>
          <div style={{
            width: 30, height: 30, borderRadius: 7,
            background: "#061A1C",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {/* Funnel mark — 3 lines converging */}
            <svg width="16" height="14" viewBox="0 0 16 14" fill="none">
              <path d="M1 1h14M3 5.5h10M5.5 10h5" stroke="#36F4A4" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#061A1C", letterSpacing: "-0.02em" }}>WhatStage</span>
        </Link>

        <Link href="/signup" style={{ fontSize: 13, color: "#6B7280", textDecoration: "none" }}>
          No account?{" "}
          <span style={{ color: "#059669", fontWeight: 500 }}>Sign up</span>
        </Link>
      </header>

      {/* Main content */}
      <main style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        maxWidth: 960,
        width: "100%",
        margin: "0 auto",
        padding: "60px 32px",
        gap: 64,
        alignItems: "start",
      }}
        className="max-lg:grid-cols-1 max-lg:gap-10"
      >
        {/* Left — editorial brand column */}
        <div>
          <div className="auth-reveal auth-reveal-2">
            <p style={{
              fontSize: 11, fontWeight: 600, color: "#059669",
              letterSpacing: "0.1em", textTransform: "uppercase",
              marginBottom: 14, margin: "0 0 14px",
            }}>
              Messenger Funnel Platform
            </p>
            <h1 style={{
              fontFamily: "'Fraunces', Georgia, serif",
              fontSize: "clamp(32px, 4vw, 52px)",
              fontWeight: 700,
              color: "#061A1C",
              lineHeight: 1.08,
              letterSpacing: "-0.03em",
              margin: "0 0 20px",
            }}>
              Your leads,<br />
              <span style={{ fontStyle: "italic", fontWeight: 300 }}>always moving.</span>
            </h1>
            <p style={{
              fontSize: 15, color: "#6B7280", lineHeight: 1.65,
              margin: "0 0 36px", maxWidth: 340,
            }}>
              Guide Messenger leads through a real funnel — from first contact to closed deal — without switching tools.
            </p>
          </div>

          <div className="auth-reveal auth-reveal-3">
            <PipelineSnapshot />
          </div>

          <p className="auth-reveal auth-reveal-4" style={{
            fontSize: 12, color: "#9CA3AF",
            margin: "20px 0 0",
            lineHeight: 1.5,
          }}>
            Sample data from a real estate account running WhatStage.
          </p>
        </div>

        {/* Right — form */}
        <div>
          <div className="auth-reveal auth-reveal-2" style={{ marginBottom: 28 }}>
            <h2 style={{
              fontFamily: "'Fraunces', Georgia, serif",
              fontSize: 28, fontWeight: 700,
              color: "#111827", letterSpacing: "-0.025em",
              margin: "0 0 6px",
            }}>
              Sign in
            </h2>
            <p style={{ fontSize: 14, color: "#9CA3AF", margin: 0 }}>
              Welcome back.
            </p>
          </div>

          {error && (
            <div className="auth-reveal auth-reveal-2" style={{
              marginBottom: 18,
              padding: "11px 14px",
              background: "#FEF2F2",
              border: "1px solid #FECACA",
              borderRadius: 7,
              fontSize: 13, color: "#B91C1C",
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div className="auth-reveal auth-reveal-3">
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#374151", marginBottom: 7 }}>
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                className="auth-input"
              />
            </div>

            <div className="auth-reveal auth-reveal-4">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 }}>
                <label style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>
                  Password
                </label>
                <button
                  type="button"
                  style={{ fontSize: 12, color: "#059669", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
                  Forgot?
                </button>
              </div>
              <div style={{ position: "relative" }}>
                <input
                  type={showPw ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="auth-input"
                  style={{ paddingRight: 42 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  style={{
                    position: "absolute", right: 13, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer",
                    color: "#9CA3AF", padding: 0,
                    display: "flex", alignItems: "center",
                  }}>
                  <EyeIcon off={showPw} />
                </button>
              </div>
            </div>

            <div className="auth-reveal auth-reveal-5">
              <button type="submit" disabled={loading} className="auth-btn-primary">
                {loading ? (
                  <>
                    <span className="auth-spinner" />
                    Signing in
                  </>
                ) : "Sign in"}
              </button>
            </div>
          </form>

          <div className="auth-reveal auth-reveal-6" style={{ marginTop: 20 }}>
            <Link href="/signup" className="auth-btn-outline">
              Create an account
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
