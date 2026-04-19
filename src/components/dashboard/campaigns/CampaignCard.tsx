"use client";

import Link from "next/link";
import { Target, ChevronRight } from "lucide-react";
import Badge from "@/components/ui/Badge";

interface CampaignCardProps {
  id: string;
  name: string;
  goal: string;
  status: string;
  isPrimary: boolean;
  phaseCount?: number;
  conversionRate?: number;
  leadCount?: number;
}

const GOAL_LABELS: Record<string, string> = {
  form_submit: "Form Submitted",
  appointment_booked: "Appointment Booked",
  purchase: "Purchase",
  stage_reached: "Stage Reached",
};

const STATUS_COLORS: Record<string, "default" | "success" | "warning" | "danger"> = {
  draft: "default",
  active: "success",
  paused: "warning",
  archived: "danger",
};

export default function CampaignCard({
  id,
  name,
  goal,
  status,
  isPrimary,
  conversionRate,
  leadCount,
}: CampaignCardProps) {
  return (
    <Link href={`/app/campaigns/${id}`}>
      <div
        className={`rounded-lg border p-4 transition-colors hover:border-[var(--ws-accent)] ${
          isPrimary
            ? "border-2 border-[var(--ws-accent)] bg-[var(--ws-accent-subtle)]"
            : "border-[var(--ws-border)]"
        }`}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--ws-accent-subtle)]">
              <Target className="h-4 w-4 text-[var(--ws-accent)]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-[var(--ws-text-primary)]">{name}</h3>
                {isPrimary && <Badge variant="default">PRIMARY</Badge>}
                <Badge variant={STATUS_COLORS[status] ?? "default"}>
                  {status.toUpperCase()}
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-[var(--ws-text-muted)]">
                Goal: {GOAL_LABELS[goal] ?? goal}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {conversionRate !== undefined && (
              <div className="text-right">
                <div className="text-lg font-bold text-[var(--ws-success)]">
                  {Math.round(conversionRate * 100)}%
                </div>
                <div className="text-[10px] text-[var(--ws-text-muted)]">conversion</div>
              </div>
            )}
            {leadCount !== undefined && (
              <div className="text-right">
                <div className="text-lg font-bold text-[var(--ws-text-primary)]">{leadCount}</div>
                <div className="text-[10px] text-[var(--ws-text-muted)]">leads</div>
              </div>
            )}
            <ChevronRight className="h-4 w-4 text-[var(--ws-text-muted)]" />
          </div>
        </div>
      </div>
    </Link>
  );
}
