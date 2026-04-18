"use client";

import { X, Calendar, Tag } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import ActivityFeed, { type ActivityEvent } from "./ActivityFeed";

export interface LeadProfile {
  id: string;
  fbName: string | null;
  fbProfilePic: string | null;
  psid: string;
  stageId: string | null;
  stageName: string | null;
  stageColor: string | null;
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
                {lead.fbName ?? "Unknown Lead"}
              </h2>
              {lead.stageName && (
                <Badge variant="muted" className="mt-1">
                  <span
                    className="mr-1.5 inline-block h-2 w-2 rounded-full"
                    style={{
                      backgroundColor: lead.stageColor ?? "#6366f1",
                    }}
                  />
                  {lead.stageName}
                </Badge>
              )}
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
      </div>
    </>
  );
}
