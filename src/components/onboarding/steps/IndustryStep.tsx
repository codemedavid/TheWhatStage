"use client";

import {
  ShoppingBag,
  Building2,
  Laptop,
  Briefcase,
  Check,
} from "lucide-react";
import type { BusinessType } from "@/lib/onboarding/types";

const INDUSTRIES: {
  value: BusinessType;
  label: string;
  description: string;
  icon: typeof ShoppingBag;
}[] = [
  {
    value: "ecommerce",
    label: "E-Commerce",
    description: "Sell products online",
    icon: ShoppingBag,
  },
  {
    value: "real_estate",
    label: "Real Estate",
    description: "Properties & listings",
    icon: Building2,
  },
  {
    value: "digital_product",
    label: "Digital Products",
    description: "Courses, SaaS, digital goods",
    icon: Laptop,
  },
  {
    value: "services",
    label: "Services",
    description: "Consulting, agencies, freelance",
    icon: Briefcase,
  },
];

interface IndustryStepProps {
  selected: BusinessType | "";
  onNext: (industry: BusinessType) => void;
  onBack: () => void;
}

export default function IndustryStep({
  selected,
  onNext,
  onBack,
}: IndustryStepProps) {
  function handleSelect(value: BusinessType) {
    setTimeout(() => onNext(value), 300);
  }

  return (
    <div>
      <div className="text-center mb-8">
        <h2 className="text-2xl font-semibold text-[var(--ws-text-primary)]">
          What type of business do you run?
        </h2>
        <p className="text-sm text-[var(--ws-text-tertiary)] mt-1">
          This helps us tailor your bot experience
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {INDUSTRIES.map((ind) => {
          const Icon = ind.icon;
          const isSelected = selected === ind.value;
          return (
            <button
              key={ind.value}
              onClick={() => handleSelect(ind.value)}
              className={`relative flex flex-col items-center p-6 rounded-xl border-2 transition-all duration-200 cursor-pointer group ${
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
                className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-colors ${
                  isSelected
                    ? "bg-[var(--ws-accent-light)] text-[var(--ws-accent)]"
                    : "bg-[var(--ws-page)] text-[var(--ws-text-tertiary)] group-hover:bg-[var(--ws-accent-light)] group-hover:text-[var(--ws-accent)]"
                }`}
              >
                <Icon className="w-6 h-6" />
              </div>
              <span className="font-medium text-sm text-[var(--ws-text-primary)]">
                {ind.label}
              </span>
              <span className="text-xs text-[var(--ws-text-muted)] mt-0.5">
                {ind.description}
              </span>
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
