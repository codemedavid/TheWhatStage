"use client";

import { Sparkles, Send } from "lucide-react";
import Button from "@/components/ui/Button";

export interface BuilderMessage {
  role: "user" | "assistant";
  text: string;
}

interface AiBuilderChatProps {
  messages: BuilderMessage[];
  value: string;
  builderState: "no_plan" | "has_plan" | "has_phases";
  focusedPhaseName: string | null;
  loading: boolean;
  error: string | null;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

const EXAMPLE_PROMPTS = [
  "Low-friction qualification",
  "Answer questions first",
  "Re-engage silent leads",
  "Product matching",
  "Soft booking campaign",
];

export default function AiBuilderChat({
  messages,
  value,
  builderState,
  focusedPhaseName,
  loading,
  error,
  onChange,
  onSubmit,
}: AiBuilderChatProps) {
  const placeholder = (() => {
    if (focusedPhaseName) return `Describe changes for ${focusedPhaseName}...`;
    switch (builderState) {
      case "no_plan": return "Describe the campaign you want to build...";
      case "has_plan": return "Revise the plan or click Generate Phases...";
      case "has_phases": return "Describe changes to the campaign...";
    }
  })();

  return (
    <section className="flex min-h-[620px] flex-col border-r border-[var(--ws-border)] bg-white">
      <div className="border-b border-[var(--ws-border)] p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[var(--ws-accent)]" />
          <h2 className="text-sm font-semibold text-[var(--ws-text-primary)]">
            AI Campaign Builder
          </h2>
        </div>
        <p className="mt-1 text-xs text-[var(--ws-text-muted)]">
          Describe the selling motion. The builder creates a draft you can edit, test, or promote.
        </p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--ws-text-muted)]">
              Try a direction like &quot;answer questions first, understand what they want to buy, then re-engage to close.&quot;
            </p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => onChange(prompt)}
                  className="rounded-full border border-[var(--ws-border)] px-3 py-1.5 text-xs text-[var(--ws-text-secondary)] hover:border-[var(--ws-accent)]"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`rounded-lg px-3 py-2 text-sm ${
              message.role === "user"
                ? "ml-8 bg-[var(--ws-accent)] text-white"
                : "mr-8 bg-[var(--ws-page)] text-[var(--ws-text-primary)]"
            }`}
          >
            {message.text}
          </div>
        ))}
      </div>

      {error && (
        <div className="mx-4 mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="border-t border-[var(--ws-border)] p-4">
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={4}
          className="w-full resize-none rounded-lg border border-[var(--ws-border)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] focus:border-[var(--ws-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--ws-accent)]"
        />
        <div className="mt-3 flex justify-end">
          <Button variant="primary" onClick={onSubmit} disabled={loading || !value.trim()}>
            <Send className="h-4 w-4" />
            {loading ? "Working..." : "Send"}
          </Button>
        </div>
      </div>
    </section>
  );
}
