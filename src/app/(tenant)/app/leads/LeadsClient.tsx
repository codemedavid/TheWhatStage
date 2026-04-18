"use client";

import { useState, useMemo } from "react";
import { LayoutGrid, List, Search, Users } from "lucide-react";
import { clsx } from "clsx";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import LeadProfilePanel, {
  type LeadProfile,
} from "@/components/dashboard/LeadProfilePanel";
import type { ActivityEvent } from "@/components/dashboard/ActivityFeed";

interface LeadData {
  id: string;
  psid: string;
  fbName: string | null;
  fbProfilePic: string | null;
  stageId: string | null;
  tags: string[];
  createdAt: string;
  lastActiveAt: string;
}

interface StageData {
  id: string;
  name: string;
  color: string;
  orderIndex: number;
}

interface EventData {
  id: string;
  leadId: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

type ViewMode = "pipeline" | "table";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function LeadsClient({
  leads,
  stages,
  events,
}: {
  leads: LeadData[];
  stages: StageData[];
  events: EventData[];
}) {
  const [view, setView] = useState<ViewMode>("pipeline");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string | "all">("all");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  const stageMap = useMemo(
    () => new Map(stages.map((s) => [s.id, s])),
    [stages]
  );

  const filtered = useMemo(() => {
    let result = leads;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (l) =>
          (l.fbName ?? "").toLowerCase().includes(q) ||
          l.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    if (stageFilter !== "all") {
      result = result.filter((l) => l.stageId === stageFilter);
    }
    return result;
  }, [leads, search, stageFilter]);

  const selectedLead = selectedLeadId
    ? leads.find((l) => l.id === selectedLeadId)
    : null;

  const selectedLeadProfile: LeadProfile | null = selectedLead
    ? {
        id: selectedLead.id,
        fbName: selectedLead.fbName,
        fbProfilePic: selectedLead.fbProfilePic,
        psid: selectedLead.psid,
        stageId: selectedLead.stageId,
        stageName: selectedLead.stageId
          ? stageMap.get(selectedLead.stageId)?.name ?? null
          : null,
        stageColor: selectedLead.stageId
          ? stageMap.get(selectedLead.stageId)?.color ?? null
          : null,
        tags: selectedLead.tags,
        createdAt: selectedLead.createdAt,
        lastActiveAt: selectedLead.lastActiveAt,
        events: events
          .filter((e) => e.leadId === selectedLead.id)
          .map(
            (e): ActivityEvent => ({
              id: e.id,
              type: e.type,
              leadName: selectedLead.fbName,
              leadPic: selectedLead.fbProfilePic,
              leadId: e.leadId,
              payload: e.payload,
              createdAt: e.createdAt,
            })
          ),
      }
    : null;

  return (
    <div className="flex h-full flex-col p-6 pt-14 md:pt-6">
      {/* Top Bar */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-[var(--ws-text-primary)]">
          Leads
        </h1>
        <span className="text-sm text-[var(--ws-text-muted)]">
          {filtered.length} total
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-[var(--ws-border)] bg-white px-3 py-2">
            <Search className="h-4 w-4 text-[var(--ws-text-muted)]" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-40 bg-transparent text-sm text-[var(--ws-text-primary)] placeholder-[var(--ws-text-muted)] outline-none"
            />
          </div>
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="rounded-lg border border-[var(--ws-border)] bg-white px-3 py-2 text-sm text-[var(--ws-text-secondary)] outline-none"
          >
            <option value="all">All stages</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <div className="flex rounded-lg border border-[var(--ws-border)]">
            <button
              onClick={() => setView("pipeline")}
              className={clsx(
                "rounded-l-lg p-2 transition-colors",
                view === "pipeline"
                  ? "bg-[var(--ws-accent-subtle)] text-[var(--ws-accent)]"
                  : "text-[var(--ws-text-muted)] hover:text-[var(--ws-text-primary)]"
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView("table")}
              className={clsx(
                "rounded-r-lg p-2 transition-colors",
                view === "table"
                  ? "bg-[var(--ws-accent-subtle)] text-[var(--ws-accent)]"
                  : "text-[var(--ws-text-muted)] hover:text-[var(--ws-text-primary)]"
              )}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {leads.length === 0 && (
        <EmptyState
          icon={Users}
          title="No leads yet"
          description="Leads will appear here when people message your Facebook Page."
        />
      )}

      {/* Pipeline View */}
      {view === "pipeline" && leads.length > 0 && (
        <div className="flex flex-1 gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => {
            const stageLeads = filtered.filter((l) => l.stageId === stage.id);
            return (
              <div key={stage.id} className="w-64 shrink-0">
                <div className="mb-3 flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: stage.color }}
                  />
                  <span className="text-sm font-medium text-[var(--ws-text-secondary)]">
                    {stage.name}
                  </span>
                  <span className="ml-auto text-xs text-[var(--ws-text-muted)]">
                    {stageLeads.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {stageLeads.map((lead) => (
                    <Card
                      key={lead.id}
                      className="cursor-pointer p-3 transition-shadow hover:shadow-[var(--ws-shadow-md)]"
                      onClick={() => setSelectedLeadId(lead.id)}
                    >
                      <div className="flex items-center gap-2">
                        <Avatar
                          src={lead.fbProfilePic}
                          name={lead.fbName}
                          size="sm"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-[var(--ws-text-primary)]">
                            {lead.fbName ?? "Unknown Lead"}
                          </p>
                          <p className="text-xs text-[var(--ws-text-muted)]">
                            {timeAgo(lead.lastActiveAt)}
                          </p>
                        </div>
                      </div>
                      {lead.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {lead.tags.slice(0, 3).map((tag) => (
                            <Badge key={tag} variant="muted">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </Card>
                  ))}
                  {stageLeads.length === 0 && (
                    <p className="py-6 text-center text-xs text-[var(--ws-text-muted)]">
                      No leads
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table View */}
      {view === "table" && leads.length > 0 && (
        <Card className="overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--ws-border)]">
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--ws-text-muted)]">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--ws-text-muted)]">
                  Stage
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--ws-text-muted)]">
                  Tags
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--ws-text-muted)]">
                  Last Active
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-[var(--ws-text-muted)]">
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead) => {
                const stage = lead.stageId ? stageMap.get(lead.stageId) : null;
                return (
                  <tr
                    key={lead.id}
                    onClick={() => setSelectedLeadId(lead.id)}
                    className="cursor-pointer border-b border-[var(--ws-border-subtle)] transition-colors hover:bg-[var(--ws-page)]"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar
                          src={lead.fbProfilePic}
                          name={lead.fbName}
                          size="sm"
                        />
                        <span className="text-sm font-medium text-[var(--ws-text-primary)]">
                          {lead.fbName ?? "Unknown"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {stage && (
                        <Badge variant="muted">
                          <span
                            className="mr-1.5 inline-block h-2 w-2 rounded-full"
                            style={{ backgroundColor: stage.color }}
                          />
                          {stage.name}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {lead.tags.slice(0, 2).map((t) => (
                          <Badge key={t} variant="muted">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--ws-text-tertiary)]">
                      {timeAgo(lead.lastActiveAt)}
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--ws-text-tertiary)]">
                      {new Date(lead.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {selectedLeadProfile && (
        <LeadProfilePanel
          lead={selectedLeadProfile}
          stages={stages.map((s) => ({ id: s.id, name: s.name, color: s.color }))}
          onClose={() => setSelectedLeadId(null)}
        />
      )}
    </div>
  );
}
