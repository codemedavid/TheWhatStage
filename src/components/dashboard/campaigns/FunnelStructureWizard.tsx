"use client";
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

  return (
    <ol className="space-y-2">
      {funnels.map((f, i) => (
        <li key={i} className="flex items-center gap-2">
          <span className="font-mono">{i + 1}.</span>
          <select
            className="rounded border p-1"
            value={f.actionPageId}
            onChange={(e) => update(i, e.target.value)}
          >
            {availablePages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} ({p.type})
              </option>
            ))}
          </select>
          <button type="button" onClick={() => move(i, -1)} disabled={i === 0}>
            ↑
          </button>
          <button type="button" onClick={() => move(i, 1)} disabled={i === funnels.length - 1}>
            ↓
          </button>
          <button type="button" onClick={() => remove(i)} disabled={funnels.length <= 1}>
            Remove
          </button>
        </li>
      ))}
      {funnels.length < 3 && (
        <li>
          <button type="button" onClick={add}>
            + Add funnel step
          </button>
        </li>
      )}
    </ol>
  );
}
