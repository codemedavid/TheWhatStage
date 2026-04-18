"use client";

import {
  Filter,
  DollarSign,
  Brain,
  ClipboardList,
  Check,
} from "lucide-react";
import type { BotGoal, BusinessType } from "@/lib/onboarding/types";
import { getGoalSubtitle } from "@/lib/onboarding/defaults";

const GOALS: {
  value: BotGoal;
  label: string;
  fallbackSubtitle: string;
  icon: typeof Filter;
}[] = [
  {
    value: "qualify_leads",
    label: "Qualify Leads",
    fallbackSubtitle: "Ask questions to score and segment leads",
    icon: Filter,
  },
  {
    value: "sell",
    label: "Sell Products & Services",
    fallbackSubtitle: "Guide leads to purchase",
    icon: DollarSign,
  },
  {
    value: "understand_intent",
    label: "Understand Intent",
    fallbackSubtitle: "Figure out what each lead needs",
    icon: Brain,
  },
  {
    value: "collect_lead_info",
    label: "Collect Lead Info",
    fallbackSubtitle: "Gather contact details and preferences",
    icon: ClipboardList,
  },
];

interface GoalStepProps {
  selected: BotGoal | "";
  industry: BusinessType | "";
  onNext: (goal: BotGoal) => void;
  onBack: () => void;
}

export default function GoalStep({
  selected,
  industry,
  onNext,
  onBack,
}: GoalStepProps) {
  function handleSelect(value: BotGoal) {
    setTimeout(() => onNext(value), 300);
  }

  return (
    <div>
      <div className="text-center mb-8">
        <h2 className="text-2xl font-semibold text-[var(--ws-text-primary)]">
          What&apos;s your main goal?
        </h2>
        <p className="text-sm text-[var(--ws-text-tertiary)] mt-1">
          We&apos;ll optimize your bot for this objective
        </p>
      </div>

      <div className="space-y-3">
        {GOALS.map((goal) => {
          const Icon = goal.icon;
          const isSelected = selected === goal.value;
          const subtitle = industry
            ? getGoalSubtitle(industry, goal.value)
            : goal.fallbackSubtitle;

          return (
            <button
              key={goal.value}
              onClick={() => handleSelect(goal.value)}
              className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all duration-200 text-left group ${
                isSelected
                  ? "border-[var(--ws-accent)] bg-[var(--ws-accent-subtle)]"
                  : "border-[var(--ws-border)] bg-white hover:border-[var(--ws-accent)] hover:bg-[var(--ws-accent-subtle)]"
              }`}
            >
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                  isSelected
                    ? "bg-[var(--ws-accent-light)] text-[var(--ws-accent)]"
                    : "bg-[var(--ws-page)] text-[var(--ws-text-tertiary)] group-hover:bg-[var(--ws-accent-light)] group-hover:text-[var(--ws-accent)]"
                }`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-medium text-sm text-[var(--ws-text-primary)] block">
                  {goal.label}
                </span>
                <span className="text-xs text-[var(--ws-text-muted)] block mt-0.5">
                  {subtitle}
                </span>
              </div>
              {isSelected && (
                <div className="w-5 h-5 rounded-full bg-[var(--ws-accent)] flex items-center justify-center shrink-0">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      <button
        onClick={onBack}
        className="mt-6 text-sm text-[var(--ws-text-tertiary)] hover:text-[var(--ws-text-secondary)] transition-colors mx-auto block"
      >
        Back
      </button>
    </div>
  );
}
