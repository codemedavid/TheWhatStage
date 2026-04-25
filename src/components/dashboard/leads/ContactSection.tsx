"use client";

import { useState } from "react";
import { Phone, Mail, Sparkles, Pencil, Globe, Trash2, Plus, Check, X } from "lucide-react";
import Badge from "@/components/ui/Badge";

type ContactSource = "ai_extracted" | "manual" | "form_submit";

interface Contact {
  id: string;
  type: "phone" | "email";
  value: string;
  is_primary: boolean;
  source: ContactSource;
}

interface ContactSectionProps {
  contacts: Contact[];
  leadId: string;
  onAdd: (type: "phone" | "email", value: string) => Promise<void>;
  onDelete: (contactId: string) => Promise<void>;
}

const SOURCE_ICON: Record<ContactSource, React.ReactNode> = {
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
  form_submit: (
    <Globe
      size={12}
      className="text-[var(--ws-text-muted)]"
      aria-label="Form submission"
    />
  ),
};

interface AddInlineFormProps {
  type: "phone" | "email";
  onSubmit: (value: string) => Promise<void>;
  onCancel: () => void;
}

function AddInlineForm({ type, onSubmit, onCancel }: AddInlineFormProps) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);

  const placeholder = type === "phone" ? "e.g. +1 555 000 0000" : "e.g. name@example.com";
  const inputType = type === "phone" ? "tel" : "email";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      await onSubmit(trimmed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-1.5 mt-1.5"
    >
      <input
        autoFocus
        type={inputType}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        disabled={loading}
        className="flex-1 min-w-0 rounded-md border border-[var(--ws-border)] bg-[var(--ws-page)] px-2.5 py-1 text-sm text-[var(--ws-text-primary)] placeholder:text-[var(--ws-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--ws-accent)] disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={loading || !value.trim()}
        aria-label="Save"
        className="flex items-center justify-center rounded-md p-1.5 text-[var(--ws-accent)] hover:bg-[var(--ws-accent-subtle)] disabled:opacity-40 transition-colors"
      >
        <Check size={15} />
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={loading}
        aria-label="Cancel"
        className="flex items-center justify-center rounded-md p-1.5 text-[var(--ws-text-muted)] hover:bg-[var(--ws-border)] disabled:opacity-40 transition-colors"
      >
        <X size={15} />
      </button>
    </form>
  );
}

interface ContactGroupProps {
  type: "phone" | "email";
  contacts: Contact[];
  onDelete: (id: string) => Promise<void>;
  onAdd: (type: "phone" | "email", value: string) => Promise<void>;
}

function ContactGroup({ type, contacts, onDelete, onAdd }: ContactGroupProps) {
  const [showForm, setShowForm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isPhone = type === "phone";
  const Icon = isPhone ? Phone : Mail;
  const label = isPhone ? "Phone" : "Email";

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await onDelete(id);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleAdd(value: string) {
    await onAdd(type, value);
    setShowForm(false);
  }

  return (
    <div className="space-y-1">
      {/* Group label row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--ws-text-muted)] uppercase tracking-wide">
          <Icon size={12} />
          <span>{label}</span>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex items-center gap-0.5 text-xs text-[var(--ws-accent)] hover:text-[var(--ws-accent)] hover:underline transition-colors"
          >
            <Plus size={12} />
            Add {label}
          </button>
        )}
      </div>

      {/* Contact rows */}
      {contacts.length === 0 && !showForm && (
        <p className="text-xs text-[var(--ws-text-muted)] italic pl-0.5">None on file</p>
      )}

      {contacts.map((contact) => (
        <div
          key={contact.id}
          className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--ws-accent-subtle)] transition-colors"
        >
          {/* Source icon */}
          <span className="flex-shrink-0">{SOURCE_ICON[contact.source]}</span>

          {/* Value */}
          <span className="flex-1 min-w-0 text-sm text-[var(--ws-text-primary)] truncate">
            {contact.value}
          </span>

          {/* Primary badge */}
          {contact.is_primary && (
            <Badge variant="default" className="flex-shrink-0 text-[10px]">
              Primary
            </Badge>
          )}

          {/* Delete button */}
          <button
            type="button"
            onClick={() => handleDelete(contact.id)}
            disabled={deletingId === contact.id}
            aria-label={`Delete ${contact.value}`}
            className="flex-shrink-0 flex items-center justify-center rounded p-0.5 text-[var(--ws-text-muted)] opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-50 disabled:opacity-40 transition-all"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}

      {/* Inline add form */}
      {showForm && (
        <AddInlineForm
          type={type}
          onSubmit={handleAdd}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
  );
}

export default function ContactSection({
  contacts,
  leadId: _leadId,
  onAdd,
  onDelete,
}: ContactSectionProps) {
  const phones = contacts.filter((c) => c.type === "phone");
  const emails = contacts.filter((c) => c.type === "email");

  return (
    <section className="rounded-lg border border-[var(--ws-border)] bg-[var(--ws-page)] p-4 space-y-4">
      {/* Section header */}
      <h3 className="text-xs font-semibold uppercase tracking-widest text-[var(--ws-text-muted)]">
        Contact Info
      </h3>

      <div className="space-y-4">
        <ContactGroup
          type="phone"
          contacts={phones}
          onDelete={onDelete}
          onAdd={onAdd}
        />
        <ContactGroup
          type="email"
          contacts={emails}
          onDelete={onDelete}
          onAdd={onAdd}
        />
      </div>
    </section>
  );
}
