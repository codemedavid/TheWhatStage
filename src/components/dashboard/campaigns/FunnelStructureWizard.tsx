"use client";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { AvailablePage } from "@/lib/ai/funnel-builder";

interface Props {
  availablePages: AvailablePage[];
  funnels: Array<{ actionPageId: string }>;
  onChange: (funnels: Array<{ actionPageId: string }>) => void;
}

export function FunnelStructureWizard({ availablePages, funnels, onChange }: Props) {
  const update = (i: number, actionPageId: string) => {
    const next = [...funnels];
    next[i] = { actionPageId };
    onChange(next);
  };
  const add = () =>
    funnels.length < 3 && onChange([...funnels, { actionPageId: availablePages[0].id }]);
  const remove = (i: number) =>
    funnels.length > 1 && onChange(funnels.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= funnels.length) return;
    const next = [...funnels];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const iconBtn =
    "flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--ws-border)] bg-white text-[var(--ws-text-tertiary)] transition-colors hover:bg-[var(--ws-page)] disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <ol className="space-y-2">
      {funnels.map((f, i) => (
        <li
          key={i}
          className="flex items-center gap-3 rounded-lg border border-[var(--ws-border)] bg-[var(--ws-page)] p-3"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--ws-accent-light)] text-xs font-semibold text-[var(--ws-accent)]">
            {i + 1}
          </div>
          <select
            className="flex-1 rounded-lg border border-[var(--ws-border)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] focus:border-[var(--ws-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--ws-accent)]"
            value={f.actionPageId}
            onChange={(e) => update(i, e.target.value)}
          >
            {availablePages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} ({p.type})
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className={iconBtn}
              onClick={() => move(i, -1)}
              disabled={i === 0}
              aria-label="Move up"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={iconBtn}
              onClick={() => move(i, 1)}
              disabled={i === funnels.length - 1}
              aria-label="Move down"
            >
              <ArrowDown className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={`${iconBtn} hover:!bg-[var(--ws-danger-light)] hover:!text-[var(--ws-danger)]`}
              onClick={() => remove(i)}
              disabled={funnels.length <= 1}
              aria-label="Remove step"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </li>
      ))}
      {funnels.length < 3 && (
        <li>
          <button
            type="button"
            onClick={add}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--ws-border-strong)] bg-white px-3 py-2.5 text-sm font-medium text-[var(--ws-text-tertiary)] transition-colors hover:border-[var(--ws-accent)] hover:bg-[var(--ws-accent-subtle)] hover:text-[var(--ws-accent)]"
          >
            <Plus className="h-4 w-4" />
            Add funnel step
          </button>
        </li>
      )}
    </ol>
  );
}
