"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { clsx } from "clsx";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import EscalationBanner from "@/components/dashboard/EscalationBanner";
import EscalationSystemMessage from "@/components/dashboard/EscalationSystemMessage";
import ImageAttachmentPicker from "@/components/dashboard/ImageAttachmentPicker";

export interface Message {
  id: string;
  direction: "in" | "out";
  text: string | null;
  createdAt: string;
}

export interface ThreadHeader {
  leadName: string | null;
  leadPic: string | null;
  stageName?: string;
  stageColor?: string;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function MessageThread({
  header,
  messages,
  placeholder,
  onSend,
  needsHuman,
  botPausedAt,
  escalationReason,
  escalationMessageId,
  onResume,
  onSendWithImage,
}: {
  header: ThreadHeader | null;
  messages: Message[];
  placeholder?: string;
  onSend?: (text: string) => void;
  needsHuman?: boolean;
  botPausedAt?: string | null;
  escalationReason?: string | null;
  escalationMessageId?: string | null;
  onResume?: () => void;
  onSendWithImage?: (text: string, imageUrl: string | null) => void;
}) {
  const [draft, setDraft] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const handleSend = () => {
    if (!draft.trim() && !imageUrl) return;
    if (onSendWithImage) {
      onSendWithImage(draft.trim(), imageUrl);
    } else {
      onSend?.(draft.trim());
    }
    setDraft("");
    setImageUrl(null);
  };

  if (!header) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-[var(--ws-text-muted)]">
          {placeholder ?? "Select a conversation"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[var(--ws-border)] px-4 py-3">
        <Avatar src={header.leadPic} name={header.leadName} size="sm" />
        <span className="text-sm font-medium text-[var(--ws-text-primary)]">
          {header.leadName ?? "Unknown Lead"}
        </span>
        {header.stageName && (
          <Badge variant="muted">
            {header.stageColor && (
              <span
                className="mr-1.5 inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: header.stageColor }}
              />
            )}
            {header.stageName}
          </Badge>
        )}
      </div>

      {/* Escalation Banner */}
      {(needsHuman !== undefined) && (
        <EscalationBanner
          needsHuman={!!needsHuman}
          botPausedAt={botPausedAt ?? null}
          onResume={onResume ?? (() => {})}
        />
      )}

      {/* Messages */}
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((msg) => (
          <div key={msg.id}>
            <div
              className={clsx(
                "flex",
                msg.direction === "out" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={clsx(
                  "max-w-[75%] rounded-2xl px-4 py-2.5",
                  msg.direction === "out"
                    ? "bg-[var(--ws-accent)] text-white rounded-br-md"
                    : "border border-[var(--ws-border)] bg-white text-[var(--ws-text-secondary)] rounded-bl-md",
                  escalationMessageId === msg.id && "border-l-4 border-l-amber-400"
                )}
              >
                {msg.text && (
                  <p className="text-sm leading-relaxed">{msg.text}</p>
                )}
                <p
                  className={clsx(
                    "mt-1 text-[10px]",
                    msg.direction === "out"
                      ? "text-white/70"
                      : "text-[var(--ws-text-muted)]"
                  )}
                >
                  {formatTime(msg.createdAt)}
                </p>
              </div>
            </div>
            {escalationMessageId === msg.id && (
              <EscalationSystemMessage reason={escalationReason ?? null} />
            )}
          </div>
        ))}
      </div>

      {/* Compose */}
      <div className="border-t border-[var(--ws-border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <ImageAttachmentPicker
            selectedUrl={imageUrl}
            onSelect={setImageUrl}
            onClear={() => setImageUrl(null)}
          />
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Type a message..."
            className="flex-1 rounded-lg border border-[var(--ws-border)] bg-white px-4 py-2.5 text-sm text-[var(--ws-text-primary)] placeholder-[var(--ws-text-muted)] outline-none focus:border-[var(--ws-accent)] focus:ring-1 focus:ring-[var(--ws-accent)]/20"
          />
          <button
            onClick={handleSend}
            disabled={!draft.trim() && !imageUrl}
            className="rounded-full bg-[var(--ws-accent)] p-2.5 text-white transition-opacity hover:opacity-90 disabled:opacity-30"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
