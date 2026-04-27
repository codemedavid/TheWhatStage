"use client";
import { Loader2, Plus, Save, X } from "lucide-react";
import Button from "@/components/ui/Button";
import type { AvailablePage } from "@/lib/ai/funnel-builder";

interface FunnelDraft {
  actionPageId: string;
  pageDescription: string | null;
  pitch: string | null;
  qualificationQuestions: string[];
  chatRules: string[];
}

interface Props {
  name: string;
  description: string;
  mainGoal: string;
  campaignPersonality: string;
  topLevelRules: string[];
  funnels: FunnelDraft[];
  availablePages: AvailablePage[];
  saving: boolean;
  onName: (s: string) => void;
  onDescription: (s: string) => void;
  onMainGoal: (s: string) => void;
  onCampaignPersonality: (s: string) => void;
  onTopLevelRules: (rs: string[]) => void;
  onSave: () => void;
}

const inputClass =
  "w-full rounded-lg border border-[var(--ws-border)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] placeholder:text-[var(--ws-text-muted)] focus:border-[var(--ws-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--ws-accent)]";

export function FunnelReviewPanel(props: Props) {
  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-[var(--ws-border)] bg-white p-5 shadow-[var(--ws-shadow-sm)]">
        <h2 className="mb-4 text-sm font-semibold text-[var(--ws-text-primary)]">
          Campaign details
        </h2>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ws-text-tertiary)]">
              Name
            </label>
            <input
              className={inputClass}
              value={props.name}
              onChange={(e) => props.onName(e.target.value)}
              placeholder="Campaign name"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ws-text-tertiary)]">
              Description
            </label>
            <textarea
              className={`${inputClass} min-h-[72px] resize-y`}
              value={props.description}
              onChange={(e) => props.onDescription(e.target.value)}
              placeholder="What's this campaign about?"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ws-text-tertiary)]">
              Main goal
            </label>
            <textarea
              className={`${inputClass} min-h-[72px] resize-y`}
              value={props.mainGoal}
              onChange={(e) => props.onMainGoal(e.target.value)}
              placeholder="What should this campaign ultimately accomplish?"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ws-text-tertiary)]">
              Campaign personality
            </label>
            <textarea
              className={`${inputClass} min-h-[72px] resize-y`}
              value={props.campaignPersonality}
              onChange={(e) => props.onCampaignPersonality(e.target.value)}
              placeholder="Optional voice override for this campaign"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--ws-border)] bg-white p-5 shadow-[var(--ws-shadow-sm)]">
        <h2 className="text-sm font-semibold text-[var(--ws-text-primary)]">
          Top-level rules
        </h2>
        <p className="mb-3 mt-1 text-xs text-[var(--ws-text-muted)]">
          These apply to the whole campaign across every funnel step.
        </p>
        <ul className="space-y-2">
          {props.topLevelRules.map((r, i) => (
            <li key={i} className="flex gap-2">
              <input
                className={inputClass}
                value={r}
                onChange={(e) => {
                  const next = [...props.topLevelRules];
                  next[i] = e.target.value;
                  props.onTopLevelRules(next);
                }}
                placeholder="Describe a top-level rule..."
              />
              <button
                type="button"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--ws-border)] bg-white text-[var(--ws-text-tertiary)] transition-colors hover:border-red-200 hover:bg-[var(--ws-danger-light)] hover:text-[var(--ws-danger)]"
                onClick={() =>
                  props.onTopLevelRules(
                    props.topLevelRules.filter((_, j) => j !== i)
                  )
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
          onClick={() => props.onTopLevelRules([...props.topLevelRules, ""])}
        >
          <Plus className="h-4 w-4" />
          Add rule
        </button>
      </div>

      <div className="rounded-xl border border-[var(--ws-border)] bg-white p-5 shadow-[var(--ws-shadow-sm)]">
        <h2 className="mb-3 text-sm font-semibold text-[var(--ws-text-primary)]">
          Funnel summary
        </h2>
        <ol className="space-y-2">
          {props.funnels.map((f, i) => {
            const page = props.availablePages.find((p) => p.id === f.actionPageId);
            const firstRule = f.chatRules.find((r) => r.trim());
            return (
              <li
                key={i}
                className="flex items-start gap-3 rounded-lg border border-[var(--ws-border)] bg-[var(--ws-page)] p-3"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--ws-accent-light)] text-xs font-semibold text-[var(--ws-accent)]">
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--ws-text-primary)]">
                    {page?.title ?? "(missing)"}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-[var(--ws-text-muted)]">
                    {firstRule ?? "(no rules yet)"}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="flex justify-end">
        <Button variant="primary" onClick={props.onSave} disabled={props.saving}>
          {props.saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save campaign
            </>
          )}
        </Button>
      </div>
    </section>
  );
}
