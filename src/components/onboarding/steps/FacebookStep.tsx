"use client";

import { useState } from "react";

interface FacebookStepProps {
  onNext: () => void;
  onBack: () => void;
}

export default function FacebookStep({ onNext, onBack }: FacebookStepProps) {
  const [connecting, setConnecting] = useState(false);

  async function handleConnect() {
    setConnecting(true);
    try {
      const res = await fetch(
        "/api/integrations/fb-connect?source=onboarding"
      );
      if (res.ok) {
        const data = await res.json();
        window.location.href = data.url;
      }
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--ws-text-primary)]">
          Connect Facebook Page
        </h2>
        <p className="mt-1 text-sm text-[var(--ws-text-muted)]">
          Connect your Facebook Page to start receiving Messenger leads.
          You can connect multiple pages.
        </p>
      </div>

      <div className="flex flex-col items-center gap-4 py-8">
        <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center">
          <svg className="h-8 w-8 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
          </svg>
        </div>

        <button
          onClick={handleConnect}
          disabled={connecting}
          className="px-6 py-2.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {connecting ? "Redirecting to Facebook..." : "Connect Facebook Pages"}
        </button>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-[var(--ws-border)]">
        <button
          onClick={onBack}
          className="text-sm text-[var(--ws-text-secondary)] hover:text-[var(--ws-text-primary)]"
        >
          Back
        </button>
        <button
          onClick={onNext}
          className="text-sm text-[var(--ws-text-muted)] hover:text-[var(--ws-text-secondary)]"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
