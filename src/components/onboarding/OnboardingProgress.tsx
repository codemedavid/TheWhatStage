"use client";

import { STEP_ORDER, STEP_LABELS, type OnboardingStep } from "@/lib/onboarding/types";

interface OnboardingProgressProps {
  currentStep: OnboardingStep;
}

export default function OnboardingProgress({
  currentStep,
}: OnboardingProgressProps) {
  const currentIndex = STEP_ORDER.indexOf(currentStep);
  const progress = ((currentIndex + 1) / STEP_ORDER.length) * 100;

  return (
    <div className="w-full">
      {/* Thin progress bar */}
      <div className="h-[3px] w-full bg-[var(--ws-border-subtle)]">
        <div
          className="h-full bg-[var(--ws-accent)] transition-all duration-500"
          style={{
            width: `${progress}%`,
            transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />
      </div>

      {/* Step label */}
      <div className="text-center mt-6 mb-2">
        <span className="text-xs text-[var(--ws-text-muted)]">
          Step {currentIndex + 1} of {STEP_ORDER.length} — {STEP_LABELS[currentStep]}
        </span>
      </div>
    </div>
  );
}
