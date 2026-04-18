"use client";

import { useState } from "react";
import { MessageSquare, ChevronDown } from "lucide-react";
import Button from "@/components/ui/Button";
import type { BotTone } from "@/lib/onboarding/types";

const TONES: { value: BotTone; label: string; emoji: string }[] = [
  { value: "friendly", label: "Friendly", emoji: "😊" },
  { value: "professional", label: "Professional", emoji: "💼" },
  { value: "casual", label: "Casual", emoji: "✌️" },
];

interface BotSetupStepProps {
  data: {
    botTone: BotTone;
    botRules: string[];
    customInstruction: string;
  };
  suggestedRules: string[];
  onNext: (patch: {
    botTone: BotTone;
    botRules: string[];
    customInstruction: string;
  }) => void;
  onBack: () => void;
}

export default function BotSetupStep({
  data,
  suggestedRules,
  onNext,
  onBack,
}: BotSetupStepProps) {
  const [tone, setTone] = useState<BotTone>(data.botTone);
  const [enabledRules, setEnabledRules] = useState<Set<string>>(
    () => new Set(data.botRules.length > 0 ? data.botRules : suggestedRules)
  );
  const [customInstruction, setCustomInstruction] = useState(
    data.customInstruction
  );
  const [showCustom, setShowCustom] = useState(data.customInstruction !== "");

  function toggleRule(rule: string) {
    setEnabledRules((prev) => {
      const next = new Set(prev);
      if (next.has(rule)) next.delete(rule);
      else next.add(rule);
      return next;
    });
  }

  function handleContinue() {
    onNext({
      botTone: tone,
      botRules: Array.from(enabledRules),
      customInstruction,
    });
  }

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-semibold text-[var(--ws-text-primary)]">
          Set up your bot
        </h2>
        <p className="text-sm text-[var(--ws-text-tertiary)] mt-1">
          Choose your bot&apos;s personality and behavior
        </p>
      </div>

      {/* Tone Selector */}
      <div>
        <label className="block text-xs font-medium text-[var(--ws-text-tertiary)] uppercase tracking-wider mb-2">
          Bot tone
        </label>
        <div className="flex gap-2">
          {TONES.map((t) => (
            <button
              key={t.value}
              onClick={() => setTone(t.value)}
              className={`flex-1 py-2.5 px-4 rounded-full text-sm font-medium transition-all duration-200 ${
                tone === t.value
                  ? "bg-[var(--ws-accent)] text-white shadow-sm"
                  : "bg-[var(--ws-page)] text-[var(--ws-text-secondary)] border border-[var(--ws-border)] hover:border-[var(--ws-accent)]"
              }`}
            >
              <span className="mr-1.5">{t.emoji}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Suggested Rules */}
      <div>
        <label className="block text-xs font-medium text-[var(--ws-text-tertiary)] uppercase tracking-wider mb-2">
          Bot rules
        </label>
        <div className="space-y-2">
          {suggestedRules.map((rule) => {
            const checked = enabledRules.has(rule);
            return (
              <label
                key={rule}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-all duration-150 cursor-pointer ${
                  checked
                    ? "border-[var(--ws-accent)] bg-[var(--ws-accent-subtle)]"
                    : "border-[var(--ws-border)] bg-white hover:border-[var(--ws-border-strong)]"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded flex items-center justify-center shrink-0 transition-colors ${
                    checked
                      ? "bg-[var(--ws-accent)] text-white"
                      : "border-2 border-[var(--ws-border-strong)]"
                  }`}
                >
                  {checked && (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                    >
                      <path
                        d="M2.5 6L5 8.5L9.5 3.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleRule(rule)}
                  className="sr-only"
                />
                <span className="text-sm text-[var(--ws-text-secondary)]">
                  {rule}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Custom Instructions */}
      {!showCustom ? (
        <button
          onClick={() => setShowCustom(true)}
          className="flex items-center gap-2 text-sm text-[var(--ws-accent)] hover:text-[var(--ws-accent-hover)] transition-colors"
        >
          <MessageSquare className="w-4 h-4" />
          Add custom instructions
          <ChevronDown className="w-3 h-3" />
        </button>
      ) : (
        <div className="onboarding-scale-in">
          <label className="block text-xs font-medium text-[var(--ws-text-tertiary)] uppercase tracking-wider mb-1.5">
            Custom instructions
          </label>
          <textarea
            value={customInstruction}
            onChange={(e) => setCustomInstruction(e.target.value)}
            placeholder="e.g., Always greet customers by name, respond in English and Spanish..."
            rows={3}
            className="w-full px-3 py-2.5 text-sm bg-white border border-[var(--ws-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--ws-focus-ring)] focus:border-[var(--ws-accent)] transition-colors text-[var(--ws-text-primary)] placeholder:text-[var(--ws-text-muted)] resize-none"
          />
        </div>
      )}

      {/* Educational note */}
      <div className="p-3 rounded-lg bg-[var(--ws-page)] border border-[var(--ws-border-subtle)]">
        <p className="text-xs text-[var(--ws-text-muted)]">
          We&apos;ll create a starter conversation flow based on your goal. You can
          customize it later in your dashboard.
        </p>
      </div>

      <div className="flex gap-3 pt-2">
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
