"use client";

import { useCampaignMetrics } from "@/hooks/useCampaignMetrics";

export default function PhaseMetricsFunnel({ campaignId }: { campaignId: string }) {
  const { summary, phases, loading } = useCampaignMetrics(campaignId);

  if (loading) {
    return <div className="animate-pulse space-y-3">
      {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-lg bg-[var(--ws-border)]" />)}
    </div>;
  }

  if (!summary) return null;

  const maxDropOff = Math.max(...phases.map((p) => (p.entered > 0 ? p.dropped / p.entered : 0)));

  return (
    <div>
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="rounded-lg bg-[var(--ws-page)] p-3 text-center">
          <div className="text-xl font-bold text-[var(--ws-text-primary)]">{summary.total_leads}</div>
          <div className="text-[11px] text-[var(--ws-text-muted)]">Total leads</div>
        </div>
        <div className="rounded-lg bg-[var(--ws-page)] p-3 text-center">
          <div className="text-xl font-bold text-[var(--ws-success)]">{Math.round(summary.conversion_rate * 100)}%</div>
          <div className="text-[11px] text-[var(--ws-text-muted)]">Conversion rate</div>
        </div>
        <div className="rounded-lg bg-[var(--ws-page)] p-3 text-center">
          <div className="text-xl font-bold text-[var(--ws-text-primary)]">{summary.total_conversions}</div>
          <div className="text-[11px] text-[var(--ws-text-muted)]">Conversions</div>
        </div>
        <div className="rounded-lg bg-[var(--ws-page)] p-3 text-center">
          <div className="text-xl font-bold text-amber-500">{summary.highest_drop_off ?? "—"}</div>
          <div className="text-[11px] text-[var(--ws-text-muted)]">Highest drop-off</div>
        </div>
      </div>

      {/* Phase funnel */}
      <h3 className="text-sm font-semibold text-[var(--ws-text-primary)] mb-3">Phase-by-Phase Funnel</h3>
      <div className="space-y-3">
        {phases.map((phase) => {
          const dropRate = phase.entered > 0 ? phase.dropped / phase.entered : 0;
          const isHighestDrop = dropRate === maxDropOff && dropRate > 0;

          return (
            <div key={phase.phase_id}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--ws-accent)] text-[10px] font-bold text-white">
                    {phase.order_index + 1}
                  </span>
                  <span className="text-sm font-medium text-[var(--ws-text-primary)]">{phase.name}</span>
                  {isHighestDrop && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-600">
                      highest drop-off
                    </span>
                  )}
                </div>
                <div className="flex gap-4 text-xs text-[var(--ws-text-muted)]">
                  <span>{phase.entered} entered</span>
                  <span className="text-[var(--ws-success)]">{Math.round(phase.success_rate * 100)}% advanced</span>
                  <span className="text-red-500">{Math.round(dropRate * 100)}% dropped</span>
                  <span>avg {phase.avg_messages} msgs · {phase.avg_time_minutes}min</span>
                </div>
              </div>
              <div className="h-2 rounded-full bg-[var(--ws-border)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[var(--ws-accent)] to-purple-400"
                  style={{ width: `${Math.round(phase.success_rate * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
