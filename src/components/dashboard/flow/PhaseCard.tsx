"use client";

import { forwardRef, useState } from "react";
import { ChevronDown, GripVertical } from "lucide-react";
import { clsx } from "clsx";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import PhaseForm from "./PhaseForm";
import type { FlowPhase } from "@/hooks/useFlowPhases";

interface PhaseCardProps {
  phase: FlowPhase;
  onSave: (updates: Partial<FlowPhase>) => Promise<void>;
  onDelete: () => void;
  dragHandleProps?: Record<string, unknown>;
}

const PhaseCard = forwardRef<HTMLDivElement, PhaseCardProps>(
  function PhaseCard({ phase, onSave, onDelete, dragHandleProps }, ref) {
    const [expanded, setExpanded] = useState(false);

    return (
      <Card ref={ref} className="overflow-hidden">
        {/* Header — click to expand/collapse */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left"
        >
          {/* Drag handle */}
          <div
            {...dragHandleProps}
            className="cursor-grab text-[var(--ws-text-muted)] hover:text-[var(--ws-text-primary)]"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4" />
          </div>

          {/* Phase number */}
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--ws-accent)]/10 text-xs font-semibold text-[var(--ws-accent)]">
            {phase.order_index + 1}
          </div>

          {/* Phase name */}
          <span className="flex-1 text-sm font-medium text-[var(--ws-text-primary)]">
            {phase.name}
          </span>

          {/* Meta badges */}
          {phase.tone && (
            <Badge variant="muted">{phase.tone}</Badge>
          )}
          <span className="text-xs text-[var(--ws-text-muted)]">
            {phase.max_messages} msg{phase.max_messages !== 1 ? "s" : ""}
          </span>

          {/* Expand chevron */}
          <ChevronDown
            className={clsx(
              "h-4 w-4 text-[var(--ws-text-muted)] transition-transform",
              expanded && "rotate-180"
            )}
          />
        </button>

        {/* Expanded form */}
        {expanded && (
          <div className="border-t border-[var(--ws-border)]">
            <PhaseForm key={phase.id + phase.created_at} phase={phase} onSave={onSave} onDelete={onDelete} />
          </div>
        )}
      </Card>
    );
  }
);

export default PhaseCard;
