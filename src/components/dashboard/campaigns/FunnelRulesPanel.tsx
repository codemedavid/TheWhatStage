"use client";
import { useEffect } from "react";
import { Plus, X } from "lucide-react";
import { defaultRulesForPageType, type ActionPageType } from "@/lib/ai/funnel-templates";

interface Props {
  index?: number;
  pageType: ActionPageType;
  pageTitle: string;
  description: string | null;
  pitch: string | null;
  qualificationQuestions: string[];
  rules: string[];
  onChange: (next: {
    description: string | null;
    pitch: string | null;
    qualificationQuestions: string[];
    rules: string[];
  }) => void;
}

export function FunnelRulesPanel({
  index,
  pageType,
  pageTitle,
  description,
  pitch,
  qualificationQuestions,
  rules,
  onChange,
}: Props) {
  useEffect(() => {
    if (rules.length === 0) {
      onChange({ description, pitch, qualificationQuestions, rules: defaultRulesForPageType(pageType) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageType]);

  return (
    <section className="rounded-xl border border-[var(--ws-border)] bg-white p-5 shadow-[var(--ws-shadow-sm)]">
      <header className="mb-4 flex items-center gap-3">
        {index !== undefined && (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--ws-accent-light)] text-xs font-semibold text-[var(--ws-accent)]">
            {index}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-[var(--ws-text-primary)]">
            {pageTitle}
          </h3>
          <span className="inline-block rounded-full bg-[var(--ws-border-subtle)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--ws-text-tertiary)]">
            {pageType}
          </span>
        </div>
      </header>

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--ws-text-primary)]">
            Page description
            <span className="ml-1 text-xs font-normal text-[var(--ws-text-muted)]">
              (optional)
            </span>
          </label>
          <textarea
            className="min-h-[72px] w-full resize-y rounded-lg border border-[var(--ws-border)] bg-white p-2.5 text-sm text-[var(--ws-text-primary)] placeholder:text-[var(--ws-text-muted)] focus:border-[var(--ws-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--ws-accent)]"
            value={description ?? ""}
            onChange={(e) => onChange({ description: e.target.value, pitch, qualificationQuestions, rules })}
            placeholder="e.g. Sales page for our $497 coaching program"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--ws-text-primary)]">
            Funnel pitch
            <span className="ml-1 text-xs font-normal text-[var(--ws-text-muted)]">
              (optional)
            </span>
          </label>
          <textarea
            className="min-h-[72px] w-full resize-y rounded-lg border border-[var(--ws-border)] bg-white p-2.5 text-sm text-[var(--ws-text-primary)] placeholder:text-[var(--ws-text-muted)] focus:border-[var(--ws-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--ws-accent)]"
            value={pitch ?? ""}
            onChange={(e) =>
              onChange({
                description,
                pitch: e.target.value,
                qualificationQuestions,
                rules,
              })
            }
            placeholder="Why should the lead take this next action?"
          />
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-[var(--ws-text-primary)]">
            First qualification questions
          </p>
          <ul className="space-y-2">
            {qualificationQuestions.map((q, i) => (
              <li key={i} className="flex gap-2">
                <input
                  className="flex-1 rounded-lg border border-[var(--ws-border)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] placeholder:text-[var(--ws-text-muted)] focus:border-[var(--ws-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--ws-accent)]"
                  value={q}
                  onChange={(e) => {
                    const next = [...qualificationQuestions];
                    next[i] = e.target.value;
                    onChange({ description, pitch, qualificationQuestions: next, rules });
                  }}
                  placeholder="Ask one qualifying question..."
                />
                <button
                  type="button"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--ws-border)] bg-white text-[var(--ws-text-tertiary)] transition-colors hover:border-red-200 hover:bg-[var(--ws-danger-light)] hover:text-[var(--ws-danger)]"
                  onClick={() =>
                    onChange({
                      description,
                      pitch,
                      qualificationQuestions: qualificationQuestions.filter((_, j) => j !== i),
                      rules,
                    })
                  }
                  aria-label="Remove question"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--ws-accent)] transition-colors hover:text-[var(--ws-accent-hover)]"
            onClick={() =>
              onChange({
                description,
                pitch,
                qualificationQuestions: [...qualificationQuestions, ""],
                rules,
              })
            }
          >
            <Plus className="h-4 w-4" />
            Add question
          </button>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-[var(--ws-text-primary)]">
            Chat rules for this funnel
          </p>
          <ul className="space-y-2">
            {rules.map((r, i) => (
              <li key={i} className="flex gap-2">
                <input
                  className="flex-1 rounded-lg border border-[var(--ws-border)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] placeholder:text-[var(--ws-text-muted)] focus:border-[var(--ws-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--ws-accent)]"
                  value={r}
                  onChange={(e) => {
                    const next = [...rules];
                    next[i] = e.target.value;
                    onChange({ description, pitch, qualificationQuestions, rules: next });
                  }}
                  placeholder="Describe a rule the bot should follow..."
                />
                <button
                  type="button"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--ws-border)] bg-white text-[var(--ws-text-tertiary)] transition-colors hover:border-red-200 hover:bg-[var(--ws-danger-light)] hover:text-[var(--ws-danger)]"
                  onClick={() =>
                    onChange({
                      description,
                      pitch,
                      qualificationQuestions,
                      rules: rules.filter((_, j) => j !== i),
                    })
                  }
                  aria-label="Remove rule"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--ws-accent)] transition-colors hover:text-[var(--ws-accent-hover)]"
            onClick={() => onChange({ description, pitch, qualificationQuestions, rules: [...rules, ""] })}
          >
            <Plus className="h-4 w-4" />
            Add rule
          </button>
        </div>
      </div>
    </section>
  );
}
