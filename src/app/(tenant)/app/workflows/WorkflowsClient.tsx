"use client";

import Link from "next/link";
import { Plus, Zap } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";

interface WorkflowData {
  id: string;
  name: string;
  trigger: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
}

function getTriggerLabel(trigger: Record<string, unknown>): string {
  const event = (trigger.event as string) ?? "unknown";
  const labels: Record<string, string> = {
    message_in: "When lead sends a message",
    form_submit: "When form is submitted",
    appointment_booked: "When appointment is booked",
    purchase: "When purchase is made",
    stage_changed: "When stage changes",
    action_click: "When action is clicked",
  };
  return labels[event] ?? "Custom trigger";
}

export default function WorkflowsClient({
  workflows,
}: {
  workflows: WorkflowData[];
}) {
  return (
    <div className="p-6 pt-14 md:pt-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[var(--ws-text-primary)]">
          Workflows
        </h1>
        <Link href="/app/workflows/new">
          <Button variant="primary">
            <Plus className="h-4 w-4" />
            Create Workflow
          </Button>
        </Link>
      </div>

      {workflows.length === 0 ? (
        <EmptyState
          icon={Zap}
          title="No workflows"
          description="Automate follow-ups, stage changes, and notifications based on lead actions."
          actionLabel="Create Workflow"
          actionHref="/app/workflows/new"
        />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--ws-border)]">
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--ws-text-muted)]">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--ws-text-muted)]">Trigger</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--ws-text-muted)]">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--ws-text-muted)]">Created</th>
              </tr>
            </thead>
            <tbody>
              {workflows.map((wf) => (
                <tr
                  key={wf.id}
                  className="cursor-pointer border-b border-[var(--ws-border-subtle)] transition-colors hover:bg-[var(--ws-page)]"
                >
                  <td className="px-4 py-3">
                    <a
                      href={`/app/workflows/${wf.id}`}
                      className="text-sm font-medium text-[var(--ws-text-primary)] hover:text-[var(--ws-accent)]"
                    >
                      {wf.name}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-sm text-[var(--ws-text-tertiary)]">
                    {getTriggerLabel(wf.trigger)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={wf.enabled ? "success" : "muted"}>
                      {wf.enabled ? "Active" : "Disabled"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-[var(--ws-text-tertiary)]">
                    {new Date(wf.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
