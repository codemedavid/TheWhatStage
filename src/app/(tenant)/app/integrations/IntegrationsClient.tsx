"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";

interface ConnectedPage {
  id: string;
  fb_page_id: string;
  fb_page_name: string | null;
  fb_page_avatar: string | null;
  status: string;
  connected_at: string;
}

interface PageStat {
  pageId: string;
  leadCount: number;
  messageCount: number;
}

export default function IntegrationsClient({
  tenantId,
}: {
  tenantId: string;
}) {
  const searchParams = useSearchParams();
  const [pages, setPages] = useState<ConnectedPage[]>([]);
  const [stats, setStats] = useState<Map<string, PageStat>>(new Map());
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [connectingUrl, setConnectingUrl] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(
    searchParams.get("connected") === "true"
      ? "Facebook pages connected successfully!"
      : null
  );

  const fetchPages = useCallback(async () => {
    try {
      const [pagesRes, statsRes] = await Promise.all([
        fetch("/api/integrations/fb-pages"),
        fetch("/api/integrations/fb-pages/stats"),
      ]);

      if (pagesRes.ok) {
        const pagesData = await pagesRes.json();
        setPages(pagesData.pages);
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        const map = new Map<string, PageStat>();
        for (const s of statsData.stats) {
          map.set(s.pageId, s);
        }
        setStats(map);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPages();
  }, [fetchPages]);

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  async function handleConnect() {
    setConnectingUrl(true);
    try {
      const res = await fetch("/api/integrations/fb-connect?source=integrations");
      if (res.ok) {
        const data = await res.json();
        window.location.href = data.url;
      }
    } finally {
      setConnectingUrl(false);
    }
  }

  async function handleDisconnect(pageId: string) {
    if (!confirm("Are you sure you want to disconnect this page? Leads from this page will no longer receive bot messages.")) {
      return;
    }
    setDisconnecting(pageId);
    try {
      const res = await fetch(`/api/integrations/fb-pages/${pageId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setPages((prev) => prev.filter((p) => p.id !== pageId));
      }
    } finally {
      setDisconnecting(null);
    }
  }

  async function handleReconnect() {
    await handleConnect();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin h-6 w-6 border-2 border-[var(--ws-accent)] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-[var(--ws-text-primary)]">
            Integrations
          </h1>
          <p className="text-sm text-[var(--ws-text-muted)]">
            Manage your connected Facebook Pages.
          </p>
        </div>
        <button
          onClick={handleConnect}
          disabled={connectingUrl}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--ws-accent)] text-white disabled:opacity-50"
        >
          {connectingUrl ? "Redirecting..." : "Connect Facebook Pages"}
        </button>
      </div>

      {successMessage && (
        <div className="mb-4 p-3 rounded-lg bg-[var(--ws-success)]/10 text-sm text-[var(--ws-success)]">
          {successMessage}
        </div>
      )}

      {pages.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-[var(--ws-border)] rounded-xl">
          <p className="text-sm text-[var(--ws-text-muted)] mb-4">
            No Facebook Pages connected yet.
          </p>
          <button
            onClick={handleConnect}
            disabled={connectingUrl}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--ws-accent)] text-white disabled:opacity-50"
          >
            Connect your first page
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {pages.map((page) => {
            const pageStat = stats.get(page.id);
            const isExpired = page.status === "token_expired";

            return (
              <div
                key={page.id}
                className={`p-4 rounded-xl border ${
                  isExpired
                    ? "border-[var(--ws-warning)]/50 bg-[var(--ws-warning)]/5"
                    : "border-[var(--ws-border)]"
                }`}
              >
                <div className="flex items-start gap-3">
                  {page.fb_page_avatar ? (
                    <img
                      src={page.fb_page_avatar}
                      alt=""
                      className="h-10 w-10 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-[var(--ws-accent-subtle)] flex items-center justify-center shrink-0">
                      <span className="text-sm font-medium text-[var(--ws-accent)]">
                        {(page.fb_page_name ?? "?")[0]}
                      </span>
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-[var(--ws-text-primary)] truncate">
                        {page.fb_page_name ?? page.fb_page_id}
                      </p>
                      {isExpired ? (
                        <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-[var(--ws-warning)]/20 text-[var(--ws-warning)]">
                          Token Expired
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-[var(--ws-success)]/20 text-[var(--ws-success)]">
                          Active
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 mt-1">
                      <span className="text-xs text-[var(--ws-text-muted)]">
                        {pageStat?.messageCount ?? 0} messages
                      </span>
                      <span className="text-xs text-[var(--ws-text-muted)]">
                        {pageStat?.leadCount ?? 0} leads
                      </span>
                      <span className="text-xs text-[var(--ws-text-muted)]">
                        Connected{" "}
                        {new Date(page.connected_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isExpired && (
                      <button
                        onClick={handleReconnect}
                        className="px-3 py-1.5 text-xs font-medium rounded-md bg-[var(--ws-warning)] text-white"
                      >
                        Reconnect
                      </button>
                    )}
                    <button
                      onClick={() => handleDisconnect(page.id)}
                      disabled={disconnecting === page.id}
                      className="px-3 py-1.5 text-xs font-medium rounded-md border border-[var(--ws-border)] text-[var(--ws-text-secondary)] hover:bg-[var(--ws-page)] disabled:opacity-50"
                    >
                      {disconnecting === page.id
                        ? "Disconnecting..."
                        : "Disconnect"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
