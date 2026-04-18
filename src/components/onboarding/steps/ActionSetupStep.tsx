"use client";

import { useState } from "react";
import { FileText, Calendar, ShoppingBag, ShoppingCart, Check } from "lucide-react";
import Button from "@/components/ui/Button";
import type { ActionPageType } from "@/lib/onboarding/types";

const ACTION_TYPES: {
  value: ActionPageType;
  label: string;
  description: string;
  icon: typeof FileText;
}[] = [
  {
    value: "form",
    label: "Lead Forms",
    description: "Capture contact info and preferences",
    icon: FileText,
  },
  {
    value: "calendar",
    label: "Calendar Booking",
    description: "Let leads schedule appointments",
    icon: Calendar,
  },
  {
    value: "sales",
    label: "Sales Pages",
    description: "Showcase products or services",
    icon: ShoppingBag,
  },
  {
    value: "product_catalog",
    label: "Product Catalog",
    description: "Browse and purchase products",
    icon: ShoppingCart,
  },
];

interface ActionSetupStepProps {
  selected: ActionPageType[];
  onNext: (selected: ActionPageType[]) => void;
  onBack: () => void;
}

export default function ActionSetupStep({
  selected,
  onNext,
  onBack,
}: ActionSetupStepProps) {
  const [localSelected, setLocalSelected] = useState<Set<ActionPageType>>(
    () => new Set(selected)
  );

  function toggle(type: ActionPageType) {
    setLocalSelected((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function handleContinue() {
    onNext(Array.from(localSelected));
  }

  return (
    <div>
      <div className="text-center mb-8">
        <h2 className="text-2xl font-semibold text-[var(--ws-text-primary)]">
          What actions do you want?
        </h2>
        <p className="text-sm text-[var(--ws-text-tertiary)] mt-1">
          These are the pages your bot will send leads to
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {ACTION_TYPES.map((action) => {
          const Icon = action.icon;
          const isSelected = localSelected.has(action.value);
          return (
            <button
              key={action.value}
              onClick={() => toggle(action.value)}
              className={`relative flex flex-col items-center p-5 rounded-xl border-2 transition-all duration-200 cursor-pointer group ${
                isSelected
                  ? "border-[var(--ws-accent)] bg-[var(--ws-accent-subtle)]"
                  : "border-[var(--ws-border)] bg-white hover:border-[var(--ws-accent)] hover:bg-[var(--ws-accent-subtle)]"
              }`}
            >
              {isSelected && (
                <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-[var(--ws-accent)] flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 transition-colors ${
                  isSelected
                    ? "bg-[var(--ws-accent-light)] text-[var(--ws-accent)]"
                    : "bg-[var(--ws-page)] text-[var(--ws-text-tertiary)] group-hover:bg-[var(--ws-accent-light)] group-hover:text-[var(--ws-accent)]"
                }`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <span className="font-medium text-sm text-[var(--ws-text-primary)]">
                {action.label}
              </span>
              <span className="text-xs text-[var(--ws-text-muted)] mt-0.5 text-center">
                {action.description}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex gap-3 mt-8">
        <Button variant="secondary" onClick={onBack} className="flex-1">
          Back
        </Button>
        <Button onClick={handleContinue} className="flex-1">
          Continue
        </Button>
      </div>
    </div>
  );
}
