"use client";

import { Plus, ArrowLeft } from "lucide-react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { useExperiments } from "@/hooks/useExperiments";

const STATUS_COLORS: Record<string, "default" | "success" | "warning" | "danger"> = {
  draft: "default",
  running: "success",
  paused: "warning",
  completed: "default",
};

export default function ExperimentsClient() {
  const { experiments, loading } = useExperiments();

  if (loading) {
    return (
      <div className="p-6 pt-14 md:pt-6 animate-pulse space-y-4">
        <div className="h-8 w-48 rounded bg-[var(--ws-border)]" />
        <div className="h-24 rounded-lg bg-[var(--ws-border)]" />
      </div>
    );
  }

  return (
    <div className="p-6 pt-14 md:pt-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/app/campaigns" className="text-[var(--ws-text-muted)] hover:text-[var(--ws-text-primary)]">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-2xl font-semibold text-[var(--ws-text-primary)]">Experiments</h1>
        </div>
        <Link href="/app/campaigns/experiments/new">
          <Button variant="primary">
            <Plus className="h-4 w-4" />
            New Experiment
          </Button>
        </Link>
      </div>

      {experiments.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="No experiments yet"
          description="A/B test your campaigns to find what converts best"
          actionLabel="Create Experiment"
          actionHref="/app/campaigns/experiments/new"
        />
      ) : (
        <div className="space-y-3">
          {experiments.map((exp) => (
            <Link key={exp.id} href={`/app/campaigns/experiments/${exp.id}`}>
              <div className="rounded-lg border border-[var(--ws-border)] p-4 transition-colors hover:border-[var(--ws-accent)]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-[var(--ws-text-primary)]">{exp.name}</h3>
                    <Badge variant={STATUS_COLORS[exp.status] ?? "default"}>
                      {exp.status.toUpperCase()}
                    </Badge>
                  </div>
                  <span className="text-xs text-[var(--ws-text-muted)]">
                    {exp.experiment_campaigns?.length ?? 0} variants
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
