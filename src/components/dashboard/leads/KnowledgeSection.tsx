"use client";

import { useState } from "react";
import { Brain, Sparkles, Pencil, Trash2, Plus, Check, X } from "lucide-react";

type KnowledgeSource = "ai_extracted" | "manual";

interface Knowledge {
  id: string;
  key: string;
  value: string;
  source: KnowledgeSource;
}

interface KnowledgeSectionProps {
  knowledge: Knowledge[];
  leadId: string;
  onAdd: (key: string, value: string) => Promise<void>;
  onDelete: (knowledgeId: string) => Promise<void>;
}

const SOURCE_ICON: Record<KnowledgeSource, React.ReactNode> = {
  ai_extracted: (
    <Sparkles
      size={12}
      className="text-[var(--ws-accent)]"
      aria-label="AI extracted"
    />
  ),
  manual: (
    <Pencil
      size={12}
      className="text-[var(--ws-text-muted)]"
      aria-label="Manually added"
    />
  ),
};

interface AddFormProps {
  onSubmit: (key: string, value: string) => Promise<void>;
  onCancel: () => void;
}

function AddForm({ onSubmit, onCancel }: AddFormProps) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedKey = key.trim();
    const trimmedValue = value.trim();
    if (!trimmedKey || !trimmedValue) return;
    setLoading(true);
    try {
      await onSubmit(trimmedKey, trimmedValue);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="col-span-2 flex flex-col gap-2 rounded-lg border border-[var(--ws-border)] bg-[var(--ws-accent-subtle)] p-3"
    >
      <input
        autoFocus
        type="text"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="Key (e.g., Business, Budget)"
        disabled={loading}
        className="rounded-md border border-[var(--ws-border)] bg-[var(--ws-page)] px-2.5 py-1.5 text-sm text-[var(--ws-text-primary)] placeholder:text-[var(--ws-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--ws-accent)] disabled:opacity-50"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Value"
        disabled={loading}
        className="rounded-md border border-[var(--ws-border)] bg-[var(--ws-page)] px-2.5 py-1.5 text-sm text-[var(--ws-text-primary)] placeholder:text-[var(--ws-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--ws-accent)] disabled:opacity-50"
      />
      <div className="flex items-center gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs text-[var(--ws-text-muted)] hover:bg-[var(--ws-border)] disabled:opacity-40 transition-colors"
        >
          <X size={13} />
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading || !key.trim() || !value.trim()}
          className="flex items-center gap-1 rounded-md bg-[var(--ws-accent)] px-2.5 py-1 text-xs text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          <Check size={13} />
          Save
        </button>
      </div>
    </form>
  );
}

interface KnowledgeCardProps {
  item: Knowledge;
  onDelete: (id: string) => Promise<void>;
}

function KnowledgeCard({ item, onDelete }: KnowledgeCardProps) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await onDelete(item.id);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="group relative rounded-lg border border-[var(--ws-border)] bg-[var(--ws-page)] p-3 space-y-1 hover:border-[var(--ws-accent)] transition-colors">
      {/* Key label row */}
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--ws-text-muted)] truncate">
          {item.key}
        </span>
        <span className="flex-shrink-0">{SOURCE_ICON[item.source]}</span>
      </div>

      {/* Value */}
      <p className="text-sm text-[var(--ws-text-primary)] leading-snug break-words">
        {item.value}
      </p>

      {/* Delete button — hidden by default, shown on hover */}
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        aria-label={`Delete ${item.key}`}
        className="absolute top-2 right-2 flex items-center justify-center rounded p-0.5 text-[var(--ws-text-muted)] opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-50 disabled:opacity-40 transition-all"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

export default function KnowledgeSection({
  knowledge,
  leadId: _leadId,
  onAdd,
  onDelete,
}: KnowledgeSectionProps) {
  const [showForm, setShowForm] = useState(false);

  async function handleAdd(key: string, value: string) {
    await onAdd(key, value);
    setShowForm(false);
  }

  return (
    <section className="rounded-lg border border-[var(--ws-border)] bg-[var(--ws-page)] p-4 space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain size={15} className="text-[var(--ws-text-muted)]" />
          <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--ws-text-muted)]">
            Key Knowledge
          </h3>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1 text-xs text-[var(--ws-accent)] hover:underline transition-colors"
          >
            <Plus size={13} />
            Add
          </button>
        )}
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-2 gap-3">
        {knowledge.map((item) => (
          <KnowledgeCard key={item.id} item={item} onDelete={onDelete} />
        ))}

        {/* Add form spans both columns */}
        {showForm && (
          <AddForm onSubmit={handleAdd} onCancel={() => setShowForm(false)} />
        )}
      </div>

      {/* Empty state */}
      {knowledge.length === 0 && !showForm && (
        <p className="text-xs text-[var(--ws-text-muted)] italic">
          No knowledge recorded yet
        </p>
      )}
    </section>
  );
}
