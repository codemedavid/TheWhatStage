"use client";

import { useState } from "react";
import { StickyNote, Bot, User, ExternalLink } from "lucide-react";

type NoteType = "agent_note" | "ai_summary";

interface Note {
  id: string;
  type: NoteType;
  content: string;
  author_id: string | null;
  conversation_id: string | null;
  created_at: string;
}

interface NotesSectionProps {
  notes: Note[];
  leadId: string;
  onAddNote: (content: string) => Promise<void>;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export default function NotesSection({
  notes,
  leadId: _leadId,
  onAddNote,
}: NotesSectionProps) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const sorted = [...notes].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      await onAddNote(trimmed);
      setText("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-lg border border-[var(--ws-border)] bg-[var(--ws-page)] p-4 space-y-4">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <StickyNote size={14} className="text-[var(--ws-text-muted)]" />
        <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--ws-text-muted)]">
          Notes &amp; Summaries
        </h3>
      </div>

      {/* Add note form */}
      <form onSubmit={handleSubmit} className="space-y-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a note…"
          rows={3}
          disabled={submitting}
          className="w-full rounded-md border border-[var(--ws-border)] bg-[var(--ws-page)] px-3 py-2 text-sm text-[var(--ws-text-primary)] placeholder:text-[var(--ws-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--ws-accent)] resize-none disabled:opacity-50 transition-colors"
        />
        {text.trim() && (
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-[var(--ws-accent)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {submitting ? "Saving…" : "Save note"}
            </button>
          </div>
        )}
      </form>

      {/* Notes list */}
      {sorted.length === 0 ? (
        <p className="text-xs text-[var(--ws-text-muted)] italic">No notes yet</p>
      ) : (
        <div className="space-y-3">
          {sorted.map((note) => {
            const isAI = note.type === "ai_summary";
            const Icon = isAI ? Bot : User;
            const label = isAI ? "AI Summary" : "Agent Note";

            return (
              <div
                key={note.id}
                className="rounded-md border border-[var(--ws-border)] p-3 space-y-2"
              >
                {/* Card header */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Icon
                      size={13}
                      className={
                        isAI
                          ? "text-[var(--ws-accent)]"
                          : "text-[var(--ws-text-muted)]"
                      }
                    />
                    <span
                      className={`text-xs font-medium ${
                        isAI ? "text-[var(--ws-accent)]" : "text-[var(--ws-text-muted)]"
                      }`}
                    >
                      {label}
                    </span>
                  </div>
                  <span className="text-xs text-[var(--ws-text-muted)] flex-shrink-0">
                    {timeAgo(note.created_at)}
                  </span>
                </div>

                {/* Content */}
                <p className="text-sm text-[var(--ws-text-primary)] whitespace-pre-wrap">
                  {note.content}
                </p>

                {/* View conversation link for AI summaries */}
                {isAI && note.conversation_id && (
                  <a
                    href={`/app/conversations?id=${note.conversation_id}`}
                    className="inline-flex items-center gap-1 text-xs text-[var(--ws-accent)] hover:underline"
                  >
                    View conversation
                    <ExternalLink size={11} />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
