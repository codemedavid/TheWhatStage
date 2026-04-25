"use client";

import { Bot, User, Zap } from "lucide-react";

interface StageHistoryEntry {
  id: string;
  from_stage_id: string | null;
  to_stage_id: string;
  reason: string;
  actor_type: "ai" | "agent" | "automation";
  actor_id: string | null;
  duration_seconds: number | null;
  created_at: string;
}

interface Stage {
  id: string;
  name: string;
  color: string;
}

interface StageHistoryTimelineProps {
  history: StageHistoryEntry[];
  stages: Stage[];
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function formatTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
  return `${Math.floor(diffSeconds / 86400)}d ago`;
}

const actorConfig = {
  ai: { icon: Bot, label: "AI" },
  agent: { icon: User, label: "Agent" },
  automation: { icon: Zap, label: "Automation" },
};

export default function StageHistoryTimeline({ history, stages }: StageHistoryTimelineProps) {
  const stageMap = new Map(stages.map((s) => [s.id, s]));

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-[var(--foreground)]">Stage History</h3>

      {history.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">No stage changes</p>
      ) : (
        <ol className="relative space-y-0">
          {/* Vertical connecting line */}
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-[var(--border)]" />

          {history.map((entry, index) => {
            const toStage = stageMap.get(entry.to_stage_id);
            const fromStage = entry.from_stage_id ? stageMap.get(entry.from_stage_id) : null;
            const isFirstAssignment = entry.from_stage_id === null;

            const ActorIcon = actorConfig[entry.actor_type].icon;
            const actorLabel = actorConfig[entry.actor_type].label;
            const duration = formatDuration(entry.duration_seconds);
            const timeAgo = formatTimeAgo(entry.created_at);

            return (
              <li key={entry.id} className="relative flex gap-4 pb-6 last:pb-0">
                {/* Colored dot */}
                <div className="relative z-10 mt-1 flex-shrink-0">
                  <span
                    className="block h-[15px] w-[15px] rounded-full border-2 border-[var(--background)]"
                    style={{ backgroundColor: toStage?.color ?? "var(--muted-foreground)" }}
                  />
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1 space-y-1">
                  {/* Transition label */}
                  <p className="text-sm font-medium text-[var(--foreground)] leading-tight">
                    {isFirstAssignment ? (
                      <>
                        Assigned to{" "}
                        <span className="inline-flex items-center gap-1">
                          <span
                            className="inline-block h-2 w-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: toStage?.color ?? "var(--muted-foreground)" }}
                          />
                          {toStage?.name ?? "Unknown"}
                        </span>
                      </>
                    ) : (
                      <span className="inline-flex flex-wrap items-center gap-1">
                        <span className="inline-flex items-center gap-1">
                          <span
                            className="inline-block h-2 w-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: fromStage?.color ?? "var(--muted-foreground)" }}
                          />
                          {fromStage?.name ?? "Unknown"}
                        </span>
                        <span className="text-[var(--muted-foreground)]">→</span>
                        <span className="inline-flex items-center gap-1">
                          <span
                            className="inline-block h-2 w-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: toStage?.color ?? "var(--muted-foreground)" }}
                          />
                          {toStage?.name ?? "Unknown"}
                        </span>
                      </span>
                    )}
                  </p>

                  {/* Reason */}
                  {entry.reason && (
                    <p className="text-sm text-[var(--muted-foreground)] leading-snug">
                      {entry.reason}
                    </p>
                  )}

                  {/* Meta line */}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted-foreground)]">
                    <span className="inline-flex items-center gap-1">
                      <ActorIcon className="h-3 w-3" />
                      {actorLabel}
                    </span>

                    {duration && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{duration} in prev stage</span>
                      </>
                    )}

                    <span aria-hidden="true">·</span>
                    <span>{timeAgo}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
