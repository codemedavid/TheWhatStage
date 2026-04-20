"use client";

import { useState, useEffect } from "react";

const DISMISSED_KEY = "fb-banner-dismissed";

interface FacebookConnectBannerProps {
  fbPageId: string | null;
  onboardingCompleted: boolean;
}

export default function FacebookConnectBanner({
  fbPageId,
  onboardingCompleted,
}: FacebookConnectBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(DISMISSED_KEY) === "true") setDismissed(true);
  }, []);

  if (fbPageId || !onboardingCompleted || dismissed) return null;

  function handleDismiss() {
    setDismissed(true);
    sessionStorage.setItem(DISMISSED_KEY, "true");
  }

  function handleConnect() {
    window.location.href = "/api/settings/fb-connect";
  }

  return (
    <div className="bg-primary/10 border-b border-primary/20 px-4 py-3 flex items-center justify-between gap-4">
      <p className="text-sm">Connect your Facebook Page to start receiving messages.</p>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={handleConnect}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground"
        >
          Connect Facebook
        </button>
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
