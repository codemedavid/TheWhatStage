"use client";

import { ArrowRight } from "lucide-react";

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

interface FacebookStepProps {
  onConnect: () => void;
  onSkip: () => void;
  onBack: () => void;
  isSubmitting: boolean;
}

export default function FacebookStep({
  onConnect,
  onSkip,
  onBack,
  isSubmitting,
}: FacebookStepProps) {
  return (
    <div>
      <div className="text-center mb-8">
        <h2 className="text-2xl font-semibold text-[var(--ws-text-primary)]">
          Connect your Facebook Page
        </h2>
        <p className="text-sm text-[var(--ws-text-tertiary)] mt-1">
          Link your page to start receiving messages
        </p>
      </div>

      <div className="rounded-xl border border-[var(--ws-border)] bg-white p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#1877F2]/10 flex items-center justify-center mx-auto mb-5">
          <FacebookIcon className="w-8 h-8 text-[#1877F2]" />
        </div>

        <p className="text-sm text-[var(--ws-text-secondary)] mb-6 max-w-sm mx-auto">
          Connect your Facebook Page to enable your Messenger bot. We&apos;ll
          need permission to manage your page&apos;s messages.
        </p>

        <button
          onClick={onConnect}
          disabled={isSubmitting}
          className="inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-medium text-white bg-[#1877F2] hover:bg-[#1664d9] transition-colors duration-150 disabled:opacity-50 w-full max-w-xs mx-auto"
        >
          <FacebookIcon className="w-4 h-4" />
          Connect Facebook Page
        </button>

        <div className="mt-6 pt-6 border-t border-[var(--ws-border-subtle)]">
          <button
            onClick={onSkip}
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 text-sm text-[var(--ws-text-tertiary)] hover:text-[var(--ws-accent)] transition-colors disabled:opacity-50"
          >
            Skip for now
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <p className="text-xs text-[var(--ws-text-muted)] mt-2">
            You can always connect later in Settings
          </p>
        </div>
      </div>

      <button
        onClick={onBack}
        disabled={isSubmitting}
        className="mt-6 text-sm text-[var(--ws-text-tertiary)] hover:text-[var(--ws-text-secondary)] transition-colors mx-auto block disabled:opacity-50"
      >
        Back
      </button>
    </div>
  );
}
