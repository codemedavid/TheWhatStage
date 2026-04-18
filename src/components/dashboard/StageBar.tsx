export interface StageSegment {
  name: string;
  color: string;
  count: number;
}

export default function StageBar({ stages }: { stages: StageSegment[] }) {
  const total = stages.reduce((sum, s) => sum + s.count, 0);
  if (total === 0) return null;

  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-[var(--ws-border-subtle)]">
        {stages.map((stage) => {
          const pct = (stage.count / total) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={stage.name}
              className="transition-all duration-300"
              style={{ width: `${pct}%`, backgroundColor: stage.color }}
              title={`${stage.name}: ${stage.count}`}
            />
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-4">
        {stages.map((stage) => (
          <div key={stage.name} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: stage.color }}
            />
            <span className="text-xs text-[var(--ws-text-tertiary)]">
              {stage.name}
            </span>
            <span className="text-xs font-medium text-[var(--ws-text-primary)]">
              {stage.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
