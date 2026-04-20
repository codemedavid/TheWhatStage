"use client";

import { useState } from "react";
import type { PreviewData } from "@/lib/onboarding/generation-types";

interface PreviewStepProps {
  preview: PreviewData;
  tenantSlug: string;
}

const GOAL_LABELS: Record<string, string> = {
  form_submit: "Form Submission",
  appointment_booked: "Appointment Booked",
  purchase: "Purchase",
  stage_reached: "Stage Reached",
};

export default function PreviewStep({ preview, tenantSlug: _tenantSlug }: PreviewStepProps) {
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState("");

  async function handleFinalize() {
    setFinalizing(true);
    setError("");
    try {
      const res = await fetch("/api/onboarding/finalize", { method: "POST" });
      if (!res.ok) throw new Error("Failed to finalize");
      window.location.href = "/app/bot";
    } catch {
      setFinalizing(false);
      setError("Something went wrong. Please try again.");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-semibold mb-1">Your bot is ready!</h2>
        <p className="text-sm text-muted-foreground">
          Here's what we set up for you. You can always edit everything from your dashboard.
        </p>
      </div>

      <div className="flex gap-4 flex-wrap">
        <div className="flex-1 min-w-[200px] rounded-lg border bg-card p-4">
          <p className="text-xs font-medium text-primary uppercase tracking-wide">Campaign</p>
          <p className="text-base font-semibold mt-1">{preview.campaignName}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Goal: {GOAL_LABELS[preview.campaignGoal] ?? preview.campaignGoal}
          </p>
        </div>
        <div className="flex-1 min-w-[200px] rounded-lg border bg-card p-4">
          <p className="text-xs font-medium text-green-500 uppercase tracking-wide">Knowledge</p>
          <p className="text-base font-semibold mt-1">
            {preview.faqCount} FAQs + {preview.articleCount} article{preview.articleCount !== 1 ? "s" : ""}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Ready for conversations</p>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <p className="text-xs font-medium text-amber-500 uppercase tracking-wide mb-3">
          Conversation Flow ({preview.phaseNames.length} phases)
        </p>
        <div className="flex gap-2 items-center flex-wrap">
          {preview.phaseNames.map((name, i) => (
            <span key={i} className="flex items-center gap-2">
              <span className="bg-muted px-3 py-1 rounded-full text-xs">
                {i + 1}. {name}
              </span>
              {i < preview.phaseNames.length - 1 && (
                <span className="text-muted-foreground">→</span>
              )}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
          Sample Bot Greeting
        </p>
        <p className="text-sm italic text-muted-foreground bg-muted rounded-md p-3">
          "{preview.sampleGreeting}"
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end mt-2">
        <button
          onClick={handleFinalize}
          disabled={finalizing}
          className="px-6 py-2.5 text-sm rounded-md bg-primary text-primary-foreground disabled:opacity-50 font-medium"
        >
          {finalizing ? "Setting up..." : "Looks good, let's go!"}
        </button>
      </div>
    </div>
  );
}
