"use client";

import { useState } from "react";
import { MAIN_ACTION_OPTIONS, type MainAction } from "@/lib/onboarding/generation-types";

interface BusinessInfoStepProps {
  businessDescription: string;
  mainAction: MainAction | "";
  differentiator: string;
  qualificationCriteria: string;
  onNext: (data: {
    businessDescription: string;
    mainAction: MainAction;
    differentiator: string;
    qualificationCriteria: string;
  }) => void;
  onBack: () => void;
}

export default function BusinessInfoStep({
  businessDescription: initialDesc,
  mainAction: initialAction,
  differentiator: initialDiff,
  qualificationCriteria: initialQual,
  onNext,
  onBack,
}: BusinessInfoStepProps) {
  const [businessDescription, setBusinessDescription] = useState(initialDesc);
  const [mainAction, setMainAction] = useState<MainAction | "">(initialAction);
  const [differentiator, setDifferentiator] = useState(initialDiff);
  const [qualificationCriteria, setQualificationCriteria] = useState(initialQual);

  const canContinue =
    businessDescription.trim().length >= 10 &&
    mainAction !== "" &&
    qualificationCriteria.trim().length >= 5;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canContinue || !mainAction) return;
    onNext({
      businessDescription: businessDescription.trim(),
      mainAction,
      differentiator: differentiator.trim(),
      qualificationCriteria: qualificationCriteria.trim(),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-semibold mb-1">Tell us about your business</h2>
        <p className="text-sm text-muted-foreground">
          We'll use this to set up your bot, campaign, and knowledge base automatically.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="businessDescription" className="text-sm font-medium">
          What does your business offer?
        </label>
        <textarea
          id="businessDescription"
          value={businessDescription}
          onChange={(e) => setBusinessDescription(e.target.value)}
          placeholder='e.g., "We sell handmade leather bags — wallets, totes, and messenger bags ranging from $50–$300"'
          className="min-h-[80px] rounded-md border bg-background px-3 py-2 text-sm resize-none"
          maxLength={2000}
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="mainAction" className="text-sm font-medium">
          What's the main action you want leads to take?
        </label>
        <select
          id="mainAction"
          value={mainAction}
          onChange={(e) => setMainAction(e.target.value as MainAction)}
          className="rounded-md border bg-background px-3 py-2 text-sm"
          required
        >
          <option value="">Select an action...</option>
          {MAIN_ACTION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="differentiator" className="text-sm font-medium">
          What makes you different?{" "}
          <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <textarea
          id="differentiator"
          value={differentiator}
          onChange={(e) => setDifferentiator(e.target.value)}
          placeholder='e.g., "Every piece is hand-stitched with full-grain Italian leather"'
          className="rounded-md border bg-background px-3 py-2 text-sm resize-none"
          maxLength={1000}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="qualificationCriteria" className="text-sm font-medium">
          What do you need to know to qualify a lead?
        </label>
        <textarea
          id="qualificationCriteria"
          value={qualificationCriteria}
          onChange={(e) => setQualificationCriteria(e.target.value)}
          placeholder='e.g., "Budget range, timeline, and whether they need custom or ready-made"'
          className="min-h-[80px] rounded-md border bg-background px-3 py-2 text-sm resize-none"
          maxLength={2000}
          required
        />
      </div>

      <div className="flex justify-end gap-3 mt-2">
        <button type="button" onClick={onBack} className="px-4 py-2 text-sm rounded-md border">
          Back
        </button>
        <button
          type="submit"
          disabled={!canContinue}
          className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    </form>
  );
}
