"use client";

import { useState, useEffect } from "react";

const DISMISSED_KEY = "fb-banner-dismissed";

interface FacebookConnectBannerProps {
  hasActivePages: boolean;
  hasExpiredPages: boolean;
  onboardingCompleted: boolean;
}

export default function FacebookConnectBanner({
  hasActivePages,
  hasExpiredPages,
  onboardingCompleted,
}: FacebookConnectBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(DISMISSED_KEY) === "true") setDismissed(true);
  }, []);

  if (hasExpiredPages) {
    return (
      <div className="bg-[var(--ws-warning)]/10 border-b border-[var(--ws-warning)]/20 px-4 py-3 flex items-center justify-between gap-4">
        <p className="text-sm text-[var(--ws-text-primary)]">
          One or more Facebook Pages need to be reconnected.
        </p>
        <a
          href="/app/integrations"
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-[var(--ws-warning)] text-white shrink-0"
        >
          Fix in Integrations
        </a>
      </div>
    );
  }

  if (!hasActivePages && onboardingCompleted && !dismissed) {
    function handleDismiss() {
      setDismissed(true);
      sessionStorage.setItem(DISMISSED_KEY, "true");
    }

    return (
      <div className="bg-primary/10 border-b border-primary/20 px-4 py-3 flex items-center justify-between gap-4">
        <p className="text-sm">
          Connect a Facebook Page to start receiving leads.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href="/app/integrations"
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground"
          >
            Connect Facebook
          </a>
          <button
            type="button"
            onClick={handleDismiss}
            className="px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  return null;
}
