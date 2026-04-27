"use client";

import { useEffect, useState } from "react";
import { FileEdit, Save } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import type { KnowledgeDoc } from "@/hooks/useKnowledgeDocs";

interface Props {
  docs: KnowledgeDoc[];
  onSaveComplete: () => void;
}

interface SectionPayload {
  id?: string;
  title: string;
  content: string;
  order: number;
}

function sectionsToMarkdown(sections: SectionPayload[]): string {
  return sections
    .sort((a, b) => a.order - b.order)
    .map((s) => `## ${s.title}\n${s.content}`.trim())
    .join("\n\n");
}

function parseMarkdownToSections(md: string): SectionPayload[] {
  const lines = md.split(/\r?\n/);
  const out: SectionPayload[] = [];
  let cur: { title: string; body: string[] } | null = null;
  for (const line of lines) {
    const m = line.match(/^##[ \t]+(.+?)\s*$/);
    if (m) {
      if (cur) {
        out.push({
          title: cur.title,
          content: cur.body.join("\n").trim(),
          order: out.length,
        });
      }
      cur = { title: m[1].trim(), body: [] };
    } else if (cur) {
      cur.body.push(line);
    }
  }
  if (cur) {
    out.push({
      title: cur.title,
      content: cur.body.join("\n").trim(),
      order: out.length,
    });
  }
  return out;
}

export default function UnifiedRichTextEditor({ docs, onSaveComplete }: Props) {
  const [markdown, setMarkdown] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const richtextDocs = docs.filter((d) => d.type === "richtext");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/knowledge/richtext/list");
        if (!res.ok) {
          setError("Failed to load editor content");
          return;
        }
        const body = await res.json();
        if (cancelled) return;
        const md = sectionsToMarkdown(body.sections ?? []);
        setMarkdown(md);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const sections = parseMarkdownToSections(markdown);
      const res = await fetch("/api/knowledge/richtext/bulk", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 207) {
        setError(body.error ?? "Save failed");
        return;
      }
      const parts: string[] = [];
      if (body.created) parts.push(`${body.created} added`);
      if (body.updated) parts.push(`${body.updated} re-embedded`);
      if (body.deleted) parts.push(`${body.deleted} removed`);
      if (body.unchanged) parts.push(`${body.unchanged} unchanged`);
      setSuccess(parts.length ? parts.join(", ") : "Saved");
      if (Array.isArray(body.failures) && body.failures.length > 0) {
        setError(
          `Some sections failed: ${body.failures
            .map((f: { error: string }) => f.error)
            .join("; ")}`
        );
      }
      onSaveComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--ws-border-strong)] border-t-[var(--ws-accent)]" />
      </div>
    );
  }

  if (richtextDocs.length === 0 && markdown.trim() === "") {
    return (
      <div>
        <EmptyState
          icon={FileEdit}
          title="No knowledge written yet"
          description="Type below to add knowledge sections. Each section starts with ## Title."
        />
        <Card className="mt-4 p-3">
          <textarea
            data-testid="unified-editor-textarea"
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            rows={16}
            placeholder={"## About us\nWho we are...\n\n## Pricing\nOur pricing..."}
            className="w-full resize-y rounded-md border border-[var(--ws-border)] bg-white p-3 font-mono text-sm leading-relaxed text-[var(--ws-text-primary)] outline-none focus:border-[var(--ws-accent)]"
          />
          <div className="mt-3 flex items-center justify-between">
            {error && <p className="text-sm text-[var(--ws-danger)]">{error}</p>}
            {success && <p className="text-sm text-[var(--ws-success)]">{success}</p>}
            <div className="ml-auto">
              <Button variant="primary" onClick={save} disabled={saving}>
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : "Save & Re-embed"}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-[var(--ws-text-tertiary)]">
          One unified editor for all your knowledge. Use{" "}
          <code className="rounded bg-[var(--ws-page)] px-1">## Title</code> to
          start a new section. Save re-embeds only changed sections.
        </p>
      </div>
      <Card className="overflow-hidden">
        <textarea
          data-testid="unified-editor-textarea"
          value={markdown}
          onChange={(e) => setMarkdown(e.target.value)}
          rows={24}
          className="w-full resize-y border-0 bg-white p-4 font-mono text-sm leading-relaxed text-[var(--ws-text-primary)] outline-none"
        />
        <div className="flex items-center justify-between border-t border-[var(--ws-border)] px-4 py-3">
          <div className="text-sm">
            {error && <span className="text-[var(--ws-danger)]">{error}</span>}
            {success && !error && (
              <span className="text-[var(--ws-success)]">{success}</span>
            )}
          </div>
          <Button variant="primary" onClick={save} disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save & Re-embed"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
