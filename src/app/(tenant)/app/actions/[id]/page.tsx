"use client";

import { useState } from "react";
import { ArrowLeft, Eye, Globe, Save, Plus, Trash2, GripVertical } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Link from "next/link";

interface FormField {
  id: string;
  name: string;
  type: string;
  required: boolean;
}

const FIELD_TYPES = ["text", "email", "phone", "textarea", "select", "number"];

function FormEditor() {
  const [fields, setFields] = useState<FormField[]>([
    { id: "1", name: "Full Name", type: "text", required: true },
    { id: "2", name: "Email", type: "email", required: true },
  ]);

  const addField = () => {
    setFields((prev) => [
      ...prev,
      { id: String(Date.now()), name: "", type: "text", required: false },
    ]);
  };

  const removeField = (id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
  };

  const updateField = (id: string, updates: Partial<FormField>) => {
    setFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...updates } : f))
    );
  };

  return (
    <div>
      <h3 className="mb-3 text-sm font-medium text-[var(--ws-text-primary)]">
        Form Fields
      </h3>
      <div className="space-y-2">
        {fields.map((field) => (
          <div
            key={field.id}
            className="flex items-center gap-2 rounded-lg border border-[var(--ws-border)] bg-white p-3"
          >
            <GripVertical className="h-4 w-4 shrink-0 text-[var(--ws-text-faint)]" />
            <input
              type="text"
              value={field.name}
              onChange={(e) => updateField(field.id, { name: e.target.value })}
              placeholder="Field name"
              className="flex-1 bg-transparent text-sm text-[var(--ws-text-primary)] placeholder-[var(--ws-text-muted)] outline-none"
            />
            <select
              value={field.type}
              onChange={(e) => updateField(field.id, { type: e.target.value })}
              className="rounded border border-[var(--ws-border)] bg-white px-2 py-1 text-xs text-[var(--ws-text-tertiary)] outline-none"
            >
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-xs text-[var(--ws-text-tertiary)]">
              <input
                type="checkbox"
                checked={field.required}
                onChange={(e) => updateField(field.id, { required: e.target.checked })}
                className="accent-[var(--ws-accent)]"
              />
              Required
            </label>
            <button
              onClick={() => removeField(field.id)}
              className="text-[var(--ws-text-muted)] hover:text-[var(--ws-danger)]"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={addField}
        className="mt-3 flex items-center gap-1.5 text-sm text-[var(--ws-text-tertiary)] hover:text-[var(--ws-text-primary)]"
      >
        <Plus className="h-4 w-4" />
        Add field
      </button>
    </div>
  );
}

function CalendarEditor() {
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">
          Appointment Duration
        </label>
        <select className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] outline-none">
          <option value="15">15 minutes</option>
          <option value="30">30 minutes</option>
          <option value="60">1 hour</option>
          <option value="90">1.5 hours</option>
        </select>
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">
          Buffer Between Appointments
        </label>
        <select className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] outline-none">
          <option value="0">No buffer</option>
          <option value="5">5 minutes</option>
          <option value="10">10 minutes</option>
          <option value="15">15 minutes</option>
        </select>
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">
          Available Days
        </label>
        <div className="flex flex-wrap gap-2">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
            <label key={day} className="flex items-center gap-1.5 text-sm text-[var(--ws-text-tertiary)]">
              <input
                type="checkbox"
                defaultChecked={!["Sat", "Sun"].includes(day)}
                className="accent-[var(--ws-accent)]"
              />
              {day}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function SalesEditor() {
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">Headline</label>
        <input
          type="text"
          placeholder="Your compelling headline"
          className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] placeholder-[var(--ws-text-muted)] outline-none focus:border-[var(--ws-accent)]"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">Description</label>
        <textarea
          rows={4}
          placeholder="Describe your offer..."
          className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] placeholder-[var(--ws-text-muted)] outline-none focus:border-[var(--ws-accent)]"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">CTA Button Text</label>
        <input
          type="text"
          placeholder="Get Started"
          className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] placeholder-[var(--ws-text-muted)] outline-none focus:border-[var(--ws-accent)]"
        />
      </div>
    </div>
  );
}

function GenericEditor({ type }: { type: string }) {
  return (
    <p className="py-8 text-center text-sm text-[var(--ws-text-muted)]">
      {type === "product_catalog"
        ? "Product catalog configuration — link products from your inventory."
        : "Checkout configuration — set up payment collection."}
    </p>
  );
}

export default function ActionPageEditor() {
  const [title, setTitle] = useState("Untitled Page");
  const [published, setPublished] = useState(false);
  const [pageType] = useState("form");

  return (
    <div className="flex h-full flex-col">
      {/* Top Bar */}
      <div className="flex items-center gap-4 border-b border-[var(--ws-border)] bg-white px-6 py-3">
        <Link href="/app/actions" className="text-[var(--ws-text-muted)] hover:text-[var(--ws-text-primary)]">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="flex-1 bg-transparent text-lg font-semibold text-[var(--ws-text-primary)] outline-none"
        />
        <Badge variant="muted">/action-page-slug</Badge>
        <button
          onClick={() => setPublished(!published)}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            published
              ? "bg-[var(--ws-success-light)] text-[var(--ws-success)]"
              : "bg-[var(--ws-border-subtle)] text-[var(--ws-text-muted)]"
          }`}
        >
          <Globe className="h-3.5 w-3.5" />
          {published ? "Published" : "Draft"}
        </button>
        <Button variant="primary">
          <Save className="h-4 w-4" />
          Save
        </Button>
      </div>

      {/* Editor + Preview */}
      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/2 overflow-y-auto border-r border-[var(--ws-border)] p-6">
          {pageType === "form" && <FormEditor />}
          {pageType === "calendar" && <CalendarEditor />}
          {pageType === "sales" && <SalesEditor />}
          {(pageType === "product_catalog" || pageType === "checkout") && (
            <GenericEditor type={pageType} />
          )}
        </div>

        <div className="flex w-1/2 flex-col items-center justify-center bg-[var(--ws-page)] p-8">
          <div className="mb-3 flex items-center gap-1.5 text-xs text-[var(--ws-text-muted)]">
            <Eye className="h-3.5 w-3.5" />
            Preview
          </div>
          <Card className="w-full max-w-sm p-6">
            <h2 className="mb-4 text-lg font-semibold text-[var(--ws-text-primary)]">
              {title}
            </h2>
            {pageType === "form" && (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-[var(--ws-text-muted)]">
                    Full Name *
                  </label>
                  <div className="rounded-lg border border-[var(--ws-border)] px-3 py-2 text-sm text-[var(--ws-text-faint)]">
                    John Doe
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[var(--ws-text-muted)]">
                    Email *
                  </label>
                  <div className="rounded-lg border border-[var(--ws-border)] px-3 py-2 text-sm text-[var(--ws-text-faint)]">
                    john@example.com
                  </div>
                </div>
                <Button variant="primary" className="w-full">Submit</Button>
              </div>
            )}
            {pageType !== "form" && (
              <p className="text-sm text-[var(--ws-text-tertiary)]">
                Preview will update as you configure the page.
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
