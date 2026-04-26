"use client";
import { useEffect } from "react";
import { defaultRulesForPageType, type ActionPageType } from "@/lib/ai/funnel-templates";

interface Props {
  pageType: ActionPageType;
  pageTitle: string;
  description: string | null;
  rules: string[];
  onChange: (next: { description: string | null; rules: string[] }) => void;
}

export function FunnelRulesPanel({ pageType, pageTitle, description, rules, onChange }: Props) {
  useEffect(() => {
    if (rules.length === 0) {
      onChange({ description, rules: defaultRulesForPageType(pageType) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageType]);

  return (
    <div className="space-y-3 rounded border p-3">
      <h3 className="font-semibold">
        {pageTitle} <span className="text-xs">({pageType})</span>
      </h3>
      <label className="block text-sm">
        Page description (optional)
        <textarea
          className="mt-1 w-full rounded border p-1"
          value={description ?? ""}
          onChange={(e) => onChange({ description: e.target.value, rules })}
          placeholder="e.g. Sales page for our $497 coaching program"
        />
      </label>
      <div>
        <p className="text-sm font-medium">Chat rules for this funnel</p>
        <ul className="space-y-1 mt-1">
          {rules.map((r, i) => (
            <li key={i} className="flex gap-2">
              <input
                className="flex-1 rounded border p-1 text-sm"
                value={r}
                onChange={(e) => {
                  const next = [...rules];
                  next[i] = e.target.value;
                  onChange({ description, rules: next });
                }}
              />
              <button
                type="button"
                onClick={() => onChange({ description, rules: rules.filter((_, j) => j !== i) })}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="mt-2 text-sm"
          onClick={() => onChange({ description, rules: [...rules, ""] })}
        >
          + Add rule
        </button>
      </div>
    </div>
  );
}
