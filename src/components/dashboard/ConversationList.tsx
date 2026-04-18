"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { clsx } from "clsx";
import Avatar from "@/components/ui/Avatar";

export interface ConversationSummary {
  id: string;
  leadId: string;
  leadName: string | null;
  leadPic: string | null;
  lastMessage: string | null;
  lastMessageAt: string;
}

function timeLabel(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export default function ConversationList({
  conversations,
  activeId,
  onSelect,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = search
    ? conversations.filter((c) =>
        (c.leadName ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : conversations;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--ws-border)] p-3">
        <div className="flex items-center gap-2 rounded-lg border border-[var(--ws-border)] bg-white px-3 py-2">
          <Search className="h-4 w-4 text-[var(--ws-text-muted)]" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm text-[var(--ws-text-primary)] placeholder-[var(--ws-text-muted)] outline-none"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.map((convo) => (
          <button
            key={convo.id}
            onClick={() => onSelect(convo.id)}
            className={clsx(
              "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
              activeId === convo.id
                ? "bg-[var(--ws-accent-subtle)]"
                : "hover:bg-[var(--ws-page)]"
            )}
          >
            <Avatar src={convo.leadPic} name={convo.leadName} size="md" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span className="truncate text-sm font-medium text-[var(--ws-text-primary)]">
                  {convo.leadName ?? "Unknown Lead"}
                </span>
                <span className="ml-2 shrink-0 text-xs text-[var(--ws-text-muted)]">
                  {timeLabel(convo.lastMessageAt)}
                </span>
              </div>
              {convo.lastMessage && (
                <p className="mt-0.5 truncate text-xs text-[var(--ws-text-tertiary)]">
                  {convo.lastMessage}
                </p>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
