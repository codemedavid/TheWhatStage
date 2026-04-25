"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { redirectAfterAuth } from "@/lib/auth/redirect";
import { serializeTenantCookie } from "@/lib/auth/tenant-cookie";

/* ─── How it works — replaces emoji feature cards ──────────────── */
const STEPS = [
  {
    n: "01",
    title: "Connect your Facebook Page",
    desc: "Link your Page in one step. Your bot is live immediately — no configuration needed to start.",
  },
  {
    n: "02",
    title: "Define your funnel stages",
    desc: "Set the stages that match your sales process. New → Contacted → Interested → Closed.",
  },
  {
    n: "03",
    title: "The bot qualifies and moves leads",
    desc: "Every reply, button tap, and form fill is tracked. Leads advance automatically.",
  },
];

function HowItWorks() {
  return (
    <div>
      <p style={{
        fontSize: 11, fontWeight: 600, color: "#059669",
        letterSpacing: "0.1em", textTransform: "uppercase",
        margin: "0 0 24px",
      }}>
        How it works
      </p>

      <div style={{ position: "relative" }}>
        {/* Vertical connector line */}
        <div style={{
          position: "absolute",
          left: 16, top: 32, bottom: 32,
          width: 1,
          background: "#E5E7EB",
        }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {STEPS.map((s, i) => (
            <div key={s.n} style={{
              display: "flex", gap: 20,
              paddingBottom: i < STEPS.length - 1 ? 28 : 0,
            }}>
              {/* Step indicator */}
              <div style={{
                width: 33, height: 33, borderRadius: "50%",
                background: "#fff",
                border: "1px solid #E5E7EB",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 700, color: "#061A1C",
                letterSpacing: "0.04em",
                flexShrink: 0, position: "relative", zIndex: 1,
              }}>
                {s.n}
              </div>

              {/* Text */}
              <div style={{ paddingTop: 6 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: "#111827", margin: "0 0 5px" }}>{s.title}</p>
                <p style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.6, margin: 0 }}>{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Password strength — minimal, no color bars ────────────────── */
function PasswordStrength({ pw }: { pw: string }) {
  if (!pw) return null;

  const checks = [
    pw.length >= 8,
    /[A-Z]/.test(pw),
    /[0-9]/.test(pw),
    /[^A-Za-z0-9]/.test(pw),
  ];
  const score = checks.filter(Boolean).length;
  const labels = ["Too short", "Weak", "Fair", "Good", "Strong"];
  const colors = ["#EF4444", "#F97316", "#D97706", "#059669", "#059669"];

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
      <div style={{ display: "flex", gap: 3, flex: 1 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 2,
            background: i < score ? colors[score] : "#F3F4F6",
            transition: "background 0.25s ease",
          }} />
        ))}
      </div>
      <span style={{ fontSize: 11, color: colors[score], fontWeight: 500, flexShrink: 0 }}>
        {labels[score]}
      </span>
    </div>
  );
}

/* ─── Eye icon ───────────────────────────────────────────────────── */
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

/* ─── Signup page ────────────────────────────────────────────────── */
export default function SignupPage() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const signupRes = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!signupRes.ok) {
        const data = await signupRes.json();
        setError(data.error ?? "Failed to create account");
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }

      const accessToken = data.session?.access_token;
      const { path, slug } = await redirectAfterAuth(accessToken);

      if (slug) {
        document.cookie = serializeTenantCookie(slug);
      }

      window.location.href = path;
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
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
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none" }}>
          <div style={{
            width: 30, height: 30, borderRadius: 7,
            background: "#061A1C",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="16" height="14" viewBox="0 0 16 14" fill="none">
              <path d="M1 1h14M3 5.5h10M5.5 10h5" stroke="#36F4A4" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#061A1C", letterSpacing: "-0.02em" }}>WhatStage</span>
        </Link>

        <Link href="/login" style={{ fontSize: 13, color: "#6B7280", textDecoration: "none" }}>
          Have an account?{" "}
          <span style={{ color: "#059669", fontWeight: 500 }}>Sign in</span>
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
        {/* Left — process explanation */}
        <div>
          <div className="auth-reveal auth-reveal-2">
            <h1 style={{
              fontFamily: "'Fraunces', Georgia, serif",
              fontSize: "clamp(30px, 3.6vw, 48px)",
              fontWeight: 700,
              color: "#061A1C",
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
              margin: "0 0 16px",
            }}>
              Set up your funnel<br />
              <span style={{ fontStyle: "italic", fontWeight: 300 }}>in minutes.</span>
            </h1>
            <p style={{
              fontSize: 15, color: "#6B7280", lineHeight: 1.65,
              margin: "0 0 44px", maxWidth: 340,
            }}>
              Connect your Facebook Page, configure your stages, and let the bot handle first contact — all without writing a line of code.
            </p>
          </div>

          <div className="auth-reveal auth-reveal-3">
            <HowItWorks />
          </div>
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
              Create account
            </h2>
            <p style={{ fontSize: 14, color: "#9CA3AF", margin: 0 }}>
              Free to start. No card required.
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
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#374151", marginBottom: 7 }}>
                Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPw ? "text" : "password"}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
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
              <PasswordStrength pw={password} />
            </div>

            <div className="auth-reveal auth-reveal-5">
              <button type="submit" disabled={loading} className="auth-btn-primary">
                {loading ? (
                  <>
                    <span className="auth-spinner" />
                    Creating account
                  </>
                ) : "Create account"}
              </button>
            </div>

            <p className="auth-reveal auth-reveal-5" style={{
              fontSize: 12, color: "#9CA3AF", textAlign: "center",
              margin: 0, lineHeight: 1.6,
            }}>
              By continuing you agree to our{" "}
              <span style={{ color: "#6B7280" }}>Terms</span>{" "}
              and{" "}
              <span style={{ color: "#6B7280" }}>Privacy Policy</span>.
            </p>
          </form>

          <div className="auth-reveal auth-reveal-6" style={{ marginTop: 18 }}>
            <Link href="/login" className="auth-btn-outline">
              Sign in to existing account
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
