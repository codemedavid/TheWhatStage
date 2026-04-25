"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface AvailablePage {
  id: string;
  name: string;
  category: string;
  picture: string | null;
  availability: "available" | "connected_here" | "connected_other";
}

export default function SelectPagesClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fbToken = searchParams.get("fb_token");

  const [pages, setPages] = useState<AvailablePage[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPages() {
      if (!fbToken) {
        setError("No Facebook session. Please authenticate with Facebook first.");
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(
          `/api/integrations/fb-pages/available?fb_token=${encodeURIComponent(fbToken)}`
        );
        if (!res.ok) {
          const data = await res.json();
          setError(data.error ?? "Failed to load pages");
          return;
        }
        const data = await res.json();
        setPages(data.pages);
      } catch {
        setError("Failed to load pages");
      } finally {
        setLoading(false);
      }
    }
    fetchPages();
  }, [fbToken]);

  function togglePage(pageId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) {
        next.delete(pageId);
      } else {
        next.add(pageId);
      }
      return next;
    });
  }

  async function handleConnect() {
    if (selected.size === 0 || !fbToken) return;
    setConnecting(true);
    setError(null);

    try {
      const res = await fetch("/api/integrations/fb-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageIds: Array.from(selected),
          fbToken,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to connect pages");
        return;
      }

      router.push("/app/integrations?connected=true");
    } catch {
      setError("Failed to connect pages");
    } finally {
      setConnecting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin h-6 w-6 border-2 border-[var(--ws-accent)] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error && pages.length === 0) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <p className="text-sm text-[var(--ws-danger)] mb-4">{error}</p>
        <button
          onClick={() => router.push("/app/integrations")}
          className="text-sm text-[var(--ws-accent)] hover:underline"
        >
          Back to Integrations
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      <h1 className="text-lg font-semibold text-[var(--ws-text-primary)] mb-1">
        Select Facebook Pages
      </h1>
      <p className="text-sm text-[var(--ws-text-muted)] mb-6">
        Choose which pages to connect to your workspace.
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-[var(--ws-danger)]/10 text-sm text-[var(--ws-danger)]">
          {error}
        </div>
      )}

      <div className="space-y-2 mb-6">
        {pages.map((page) => {
          const disabled =
            page.availability === "connected_here" ||
            page.availability === "connected_other";
          const checked =
            page.availability === "connected_here" || selected.has(page.id);

          return (
            <label
              key={page.id}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                disabled
                  ? "border-[var(--ws-border)] bg-[var(--ws-page)] opacity-60 cursor-not-allowed"
                  : checked
                    ? "border-[var(--ws-accent)] bg-[var(--ws-accent-subtle)] cursor-pointer"
                    : "border-[var(--ws-border)] hover:border-[var(--ws-accent)] cursor-pointer"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => !disabled && togglePage(page.id)}
                className="h-4 w-4 rounded border-[var(--ws-border)] text-[var(--ws-accent)] focus:ring-[var(--ws-accent)]"
              />
              {page.picture && (
                <img
                  src={page.picture}
                  alt=""
                  className="h-8 w-8 rounded-full object-cover"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--ws-text-primary)] truncate">
                  {page.name}
                </p>
                {page.category && (
                  <p className="text-xs text-[var(--ws-text-muted)]">
                    {page.category}
                  </p>
                )}
              </div>
              {page.availability === "connected_here" && (
                <span className="text-xs text-[var(--ws-success)] shrink-0">
                  Already connected
                </span>
              )}
              {page.availability === "connected_other" && (
                <span className="text-xs text-[var(--ws-text-muted)] shrink-0">
                  Connected to another workspace
                </span>
              )}
            </label>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push("/app/integrations")}
          className="text-sm text-[var(--ws-text-secondary)] hover:text-[var(--ws-text-primary)]"
        >
          Cancel
        </button>
        <button
          onClick={handleConnect}
          disabled={selected.size === 0 || connecting}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--ws-accent)] text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {connecting
            ? "Connecting..."
            : `Connect ${selected.size > 0 ? `(${selected.size})` : ""}`}
        </button>
      </div>
    </div>
  );
}
