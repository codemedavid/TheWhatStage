"use client";

import { useState, useEffect } from "react";
import { MousePointerClick } from "lucide-react";
import Badge from "@/components/ui/Badge";

interface ActionPage {
  id: string;
  title: string;
  type: string;
  slug: string;
}

interface ActionButtonPickerProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export default function ActionButtonPicker({ selectedIds, onChange }: ActionButtonPickerProps) {
  const [pages, setPages] = useState<ActionPage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/bot/action-pages")
      .then((res) => (res.ok ? res.json() : { actionPages: [] }))
      .then((data) => setPages(data.actionPages ?? []))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((sid) => sid !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  if (loading) {
    return <p className="text-xs text-[var(--ws-text-muted)]">Loading action pages...</p>;
  }

  if (pages.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-[var(--ws-border-strong)] px-3 py-2">
        <MousePointerClick className="h-4 w-4 text-[var(--ws-text-muted)]" />
        <p className="text-xs text-[var(--ws-text-muted)]">
          No action pages created yet. Create action pages in the Actions section first.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {pages.map((page) => (
        <label
          key={page.id}
          className="flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--ws-border)] px-3 py-2 transition-colors hover:bg-[var(--ws-page)]"
        >
          <input
            type="checkbox"
            checked={selectedIds.includes(page.id)}
            onChange={() => toggle(page.id)}
            aria-label={page.title}
            className="h-4 w-4 rounded border-[var(--ws-border-strong)] text-[var(--ws-accent)]"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-[var(--ws-text-primary)]">{page.title}</p>
          </div>
          <Badge variant="muted">{page.type}</Badge>
        </label>
      ))}
    </div>
  );
}
