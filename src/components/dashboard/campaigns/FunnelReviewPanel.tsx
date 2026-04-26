"use client";
import type { AvailablePage } from "@/lib/ai/funnel-builder";

interface FunnelDraft {
  actionPageId: string;
  pageDescription: string | null;
  chatRules: string[];
}

interface Props {
  name: string;
  description: string;
  topLevelRules: string[];
  funnels: FunnelDraft[];
  availablePages: AvailablePage[];
  saving: boolean;
  onName: (s: string) => void;
  onDescription: (s: string) => void;
  onTopLevelRules: (rs: string[]) => void;
  onSave: () => void;
}

export function FunnelReviewPanel(props: Props) {
  return (
    <section className="space-y-3 rounded border p-3">
      <input
        className="w-full rounded border p-1"
        value={props.name}
        onChange={(e) => props.onName(e.target.value)}
        placeholder="Campaign name"
      />
      <textarea
        className="w-full rounded border p-1"
        value={props.description}
        onChange={(e) => props.onDescription(e.target.value)}
        placeholder="Campaign description"
      />
      <div>
        <p className="text-sm font-medium">Top-level rules</p>
        {props.topLevelRules.map((r, i) => (
          <input
            key={i}
            className="mt-1 w-full rounded border p-1 text-sm"
            value={r}
            onChange={(e) => {
              const next = [...props.topLevelRules];
              next[i] = e.target.value;
              props.onTopLevelRules(next);
            }}
          />
        ))}
        <button
          type="button"
          className="mt-1 text-sm"
          onClick={() => props.onTopLevelRules([...props.topLevelRules, ""])}
        >
          + Add rule
        </button>
      </div>
      <ol className="text-sm space-y-1">
        {props.funnels.map((f, i) => {
          const page = props.availablePages.find((p) => p.id === f.actionPageId);
          return (
            <li key={i}>
              {i + 1}. {page?.title ?? "(missing)"} — {f.chatRules[0] ?? "(no rules)"}
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        className="rounded bg-primary px-4 py-2 text-primary-foreground"
        onClick={props.onSave}
        disabled={props.saving}
      >
        {props.saving ? "Saving..." : "Save campaign"}
      </button>
    </section>
  );
}
