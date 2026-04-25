"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Calendar, Tag } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import ActivityFeed, { type ActivityEvent } from "./ActivityFeed";
import ContactSection from "./leads/ContactSection";
import KnowledgeSection from "./leads/KnowledgeSection";
import StageHistoryTimeline from "./leads/StageHistoryTimeline";
import NotesSection from "./leads/NotesSection";

export interface LeadProfile {
  id: string;
  fbName: string | null;
  firstName: string | null;
  lastName: string | null;
  fbProfilePic: string | null;
  psid: string;
  stageId: string | null;
  stageName: string | null;
  stageColor: string | null;
  campaignName: string | null;
  tags: string[];
  createdAt: string;
  lastActiveAt: string;
  events: ActivityEvent[];
}

interface StageOption {
  id: string;
  name: string;
  color: string;
}

export default function LeadProfilePanel({
  lead,
  stages,
  onClose,
}: {
  lead: LeadProfile;
  stages: StageOption[];
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<{
    contacts: { id: string; type: "phone" | "email"; value: string; is_primary: boolean; source: "ai_extracted" | "manual" | "form_submit" }[];
    knowledge: { id: string; key: string; value: string; source: "ai_extracted" | "manual" }[];
    stageHistory: { id: string; from_stage_id: string | null; to_stage_id: string; reason: string; actor_type: "ai" | "agent" | "automation"; actor_id: string | null; duration_seconds: number | null; created_at: string }[];
    notes: { id: string; type: "agent_note" | "ai_summary"; content: string; author_id: string | null; conversation_id: string | null; created_at: string }[];
  } | null>(null);

  const displayName = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.fbName || "Unknown Lead";

  const fetchDetail = useCallback(async () => {
    const res = await fetch(`/api/leads/${lead.id}`);
    if (res.ok) {
      const data = await res.json();
      setDetail({
        contacts: data.contacts ?? [],
        knowledge: data.knowledge ?? [],
        stageHistory: data.stageHistory ?? [],
        notes: data.notes ?? [],
      });
    }
  }, [lead.id]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  async function handleAddContact(type: "phone" | "email", value: string) {
    await fetch(`/api/leads/${lead.id}/contacts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, value }) });
    await fetchDetail();
  }

  async function handleDeleteContact(contactId: string) {
    await fetch(`/api/leads/${lead.id}/contacts/${contactId}`, { method: "DELETE" });
    await fetchDetail();
  }

  async function handleAddKnowledge(key: string, value: string) {
    await fetch(`/api/leads/${lead.id}/knowledge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value }) });
    await fetchDetail();
  }

  async function handleDeleteKnowledge(knowledgeId: string) {
    await fetch(`/api/leads/${lead.id}/knowledge/${knowledgeId}`, { method: "DELETE" });
    await fetchDetail();
  }

  async function handleAddNote(content: string) {
    await fetch(`/api/leads/${lead.id}/notes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) });
    await fetchDetail();
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-[var(--ws-border)] bg-white shadow-[var(--ws-shadow-lg)]">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[var(--ws-border)] p-5">
          <div className="flex items-center gap-3">
            <Avatar src={lead.fbProfilePic} name={lead.fbName} size="lg" />
            <div>
              <h2 className="text-lg font-semibold text-[var(--ws-text-primary)]">
                {displayName}
              </h2>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {lead.stageName && (
                  <Badge variant="muted">
                    <span
                      className="mr-1.5 inline-block h-2 w-2 rounded-full"
                      style={{
                        backgroundColor: lead.stageColor ?? "#6366f1",
                      }}
                    />
                    {lead.stageName}
                  </Badge>
                )}
                {lead.campaignName && <Badge variant="default">{lead.campaignName}</Badge>}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--ws-text-muted)] hover:bg-[var(--ws-page)] hover:text-[var(--ws-text-primary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Info */}
        <div className="border-b border-[var(--ws-border)] p-5">
          <dl className="space-y-3">
            <div className="flex items-center justify-between">
              <dt className="text-xs font-medium text-[var(--ws-text-muted)] uppercase tracking-wide">
                PSID
              </dt>
              <dd className="font-mono text-sm text-[var(--ws-text-tertiary)]">
                {lead.psid}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-xs font-medium text-[var(--ws-text-muted)] uppercase tracking-wide">
                Created
              </dt>
              <dd className="text-sm text-[var(--ws-text-tertiary)]">
                {new Date(lead.createdAt).toLocaleDateString()}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-xs font-medium text-[var(--ws-text-muted)] uppercase tracking-wide">
                Last Active
              </dt>
              <dd className="text-sm text-[var(--ws-text-tertiary)]">
                {new Date(lead.lastActiveAt).toLocaleDateString()}
              </dd>
            </div>
          </dl>
        </div>

        {detail && (
          <ContactSection
            contacts={detail.contacts}
            leadId={lead.id}
            onAdd={handleAddContact}
            onDelete={handleDeleteContact}
          />
        )}

        {detail && (
          <KnowledgeSection
            knowledge={detail.knowledge}
            leadId={lead.id}
            onAdd={handleAddKnowledge}
            onDelete={handleDeleteKnowledge}
          />
        )}

        {/* Stage Selector */}
        <div className="border-b border-[var(--ws-border)] p-5">
          <label className="mb-2 block text-xs font-medium text-[var(--ws-text-muted)] uppercase tracking-wide">
            Stage
          </label>
          <select
            defaultValue={lead.stageId ?? ""}
            className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] outline-none focus:border-[var(--ws-accent)]"
          >
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {detail && <StageHistoryTimeline history={detail.stageHistory} stages={stages} />}

        {/* Tags */}
        <div className="border-b border-[var(--ws-border)] p-5">
          <div className="mb-2 flex items-center gap-1.5">
            <Tag className="h-3.5 w-3.5 text-[var(--ws-text-muted)]" />
            <span className="text-xs font-medium text-[var(--ws-text-muted)] uppercase tracking-wide">
              Tags
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {lead.tags.length > 0 ? (
              lead.tags.map((tag) => (
                <Badge key={tag} variant="default">
                  {tag}
                </Badge>
              ))
            ) : (
              <p className="text-xs text-[var(--ws-text-muted)]">No tags</p>
            )}
          </div>
        </div>

        {/* Activity Timeline */}
        <div className="p-5">
          <div className="mb-3 flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-[var(--ws-text-muted)]" />
            <span className="text-xs font-medium text-[var(--ws-text-muted)] uppercase tracking-wide">
              Activity
            </span>
          </div>
          {lead.events.length > 0 ? (
            <ActivityFeed events={lead.events} />
          ) : (
            <p className="py-4 text-center text-xs text-[var(--ws-text-muted)]">
              No activity recorded
            </p>
          )}
        </div>

        {detail && (
          <NotesSection
            notes={detail.notes}
            leadId={lead.id}
            onAddNote={handleAddNote}
          />
        )}
      </div>
    </>
  );
}
