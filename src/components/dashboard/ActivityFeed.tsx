"use client";

import {
  MessageSquare,
  FileText,
  CalendarCheck,
  ShoppingCart,
  ArrowRightLeft,
  MousePointerClick,
  ArrowUpRight,
} from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import type { LucideIcon } from "lucide-react";

export interface ActivityEvent {
  id: string;
  type: string;
  leadName: string | null;
  leadPic: string | null;
  leadId: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

const EVENT_CONFIG: Record<
  string,
  { icon: LucideIcon; label: (e: ActivityEvent) => string; color: string }
> = {
  message_in: {
    icon: MessageSquare,
    label: (e) => `${e.leadName ?? "Lead"} sent a message`,
    color: "text-blue-500",
  },
  message_out: {
    icon: ArrowUpRight,
    label: (e) => `Sent a message to ${e.leadName ?? "Lead"}`,
    color: "text-[var(--ws-text-muted)]",
  },
  action_click: {
    icon: MousePointerClick,
    label: (e) => `${e.leadName ?? "Lead"} clicked an action button`,
    color: "text-purple-500",
  },
  form_submit: {
    icon: FileText,
    label: (e) => `${e.leadName ?? "Lead"} submitted a form`,
    color: "text-cyan-600",
  },
  appointment_booked: {
    icon: CalendarCheck,
    label: (e) => `${e.leadName ?? "Lead"} booked an appointment`,
    color: "text-amber-500",
  },
  purchase: {
    icon: ShoppingCart,
    label: (e) => `${e.leadName ?? "Lead"} made a purchase`,
    color: "text-[var(--ws-accent)]",
  },
  stage_changed: {
    icon: ArrowRightLeft,
    label: (e) => {
      const stage = (e.payload as { stage_name?: string }).stage_name;
      return `${e.leadName ?? "Lead"} moved to ${stage ?? "a new stage"}`;
    },
    color: "text-[var(--ws-accent)]",
  },
};

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

export default function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  return (
    <div className="space-y-0.5">
      {events.map((event) => {
        const config = EVENT_CONFIG[event.type] ?? EVENT_CONFIG.message_in;
        const Icon = config.icon;
        return (
          <a
            key={event.id}
            href={`/app/leads?lead=${event.leadId}`}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-[var(--ws-page)]"
          >
            <Avatar src={event.leadPic} name={event.leadName} size="sm" />
            <Icon className={`h-4 w-4 shrink-0 ${config.color}`} />
            <span className="flex-1 truncate text-sm text-[var(--ws-text-secondary)]">
              {config.label(event)}
            </span>
            <span className="shrink-0 text-xs text-[var(--ws-text-muted)]">
              {timeAgo(event.createdAt)}
            </span>
          </a>
        );
      })}
    </div>
  );
}
