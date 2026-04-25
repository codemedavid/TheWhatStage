"use client";

import { useState } from "react";
import {
  Plus,
  Trash2,
  GripVertical,
  ChevronDown,
  ChevronUp,
  Save,
  Globe,
  ArrowLeft,
  Eye,
} from "lucide-react";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import FormRenderer from "@/components/action-pages/FormRenderer";
import type { FormConfig, LeadMapping, Database } from "@/types/database";

type ActionPageField = Database["public"]["Tables"]["action_page_fields"]["Row"];

export interface BuilderField {
  id: string;
  label: string;
  field_key: string;
  field_type: ActionPageField["field_type"];
  placeholder: string;
  required: boolean;
  options: string[];
  order_index: number;
  lead_mapping: LeadMapping;
}

export interface FormBuilderProps {
  actionPageId: string;
  initialTitle: string;
  initialSlug: string;
  initialPublished: boolean;
  initialConfig: FormConfig;
  initialFields: BuilderField[];
  onSave: (data: {
    title: string;
    published: boolean;
    config: FormConfig;
    fields: BuilderField[];
  }) => Promise<void>;
}

const FIELD_TYPES: ActionPageField["field_type"][] = [
  "text",
  "email",
  "phone",
  "number",
  "textarea",
  "select",
  "radio",
  "checkbox",
];

const LAYOUT_OPTIONS: { value: FormConfig["layout"]; label: string }[] = [
  { value: "single_column", label: "Single Column" },
  { value: "two_column", label: "Two Columns" },
  { value: "with_hero", label: "With Hero Image" },
];

function slugify(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function defaultLeadMapping(fieldType: ActionPageField["field_type"]): LeadMapping {
  if (fieldType === "email") return { target: "lead_contact", type: "email" };
  if (fieldType === "phone") return { target: "lead_contact", type: "phone" };
  return null;
}

function makeBlankField(orderIndex: number): BuilderField {
  return {
    id: `new_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    label: "",
    field_key: "",
    field_type: "text",
    placeholder: "",
    required: false,
    options: [],
    order_index: orderIndex,
    lead_mapping: null,
  };
}

// Convert BuilderField to the shape FormRenderer expects
function toRendererField(f: BuilderField): ActionPageField {
  return {
    id: f.id,
    tenant_id: "",
    action_page_id: "",
    label: f.label || "Untitled field",
    field_key: f.field_key || `field_${f.id}`,
    field_type: f.field_type,
    placeholder: f.placeholder || null,
    required: f.required,
    options: f.options as unknown as import("@/types/database").Json,
    order_index: f.order_index,
    lead_mapping: f.lead_mapping as unknown as import("@/types/database").Json,
    created_at: "",
  };
}

// ─── Options Editor ───────────────────────────────────────────────────────────

function OptionsEditor({
  options,
  onChange,
}: {
  options: string[];
  onChange: (opts: string[]) => void;
}) {
  const add = () => onChange([...options, ""]);
  const remove = (i: number) => onChange(options.filter((_, idx) => idx !== i));
  const update = (i: number, val: string) =>
    onChange(options.map((o, idx) => (idx === i ? val : o)));

  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-[var(--ws-text-muted)]">Options</p>
      <div className="space-y-1.5">
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              type="text"
              value={opt}
              onChange={(e) => update(i, e.target.value)}
              placeholder={`Option ${i + 1}`}
              className="flex-1 rounded border border-[var(--ws-border)] bg-white px-2 py-1 text-xs text-[var(--ws-text-primary)] placeholder-[var(--ws-text-muted)] outline-none focus:border-[var(--ws-accent)]"
            />
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-[var(--ws-text-muted)] hover:text-[var(--ws-danger)]"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={add}
        className="mt-1.5 flex items-center gap-1 text-xs text-[var(--ws-text-tertiary)] hover:text-[var(--ws-text-primary)]"
      >
        <Plus className="h-3 w-3" />
        Add option
      </button>
    </div>
  );
}

// ─── Lead Mapping Selector ────────────────────────────────────────────────────

function LeadMappingSelector({
  value,
  onChange,
}: {
  value: LeadMapping;
  onChange: (mapping: LeadMapping) => void;
}) {
  const selected = !value
    ? "none"
    : value.target === "lead_contact"
    ? `contact_${value.type}`
    : `knowledge_${value.key}`;

  function handleChange(raw: string) {
    if (raw === "none") return onChange(null);
    if (raw === "contact_email") return onChange({ target: "lead_contact", type: "email" });
    if (raw === "contact_phone") return onChange({ target: "lead_contact", type: "phone" });
    // knowledge_<key>
    const key = raw.slice("knowledge_".length);
    onChange({ target: "lead_knowledge", key });
  }

  // For custom knowledge key
  const isKnowledge = value?.target === "lead_knowledge";
  const knowledgeKey = isKnowledge ? value.key : "";

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-[var(--ws-text-muted)]">Save response to</p>
      <select
        value={selected}
        onChange={(e) => handleChange(e.target.value)}
        className="w-full rounded border border-[var(--ws-border)] bg-white px-2 py-1.5 text-xs text-[var(--ws-text-primary)] outline-none focus:border-[var(--ws-accent)]"
      >
        <option value="none">Don&apos;t save</option>
        <option value="contact_email">Lead email</option>
        <option value="contact_phone">Lead phone</option>
        <option value="knowledge_custom">Lead knowledge (custom key)</option>
      </select>
      {isKnowledge && (
        <input
          type="text"
          value={knowledgeKey}
          onChange={(e) =>
            onChange({ target: "lead_knowledge", key: e.target.value })
          }
          placeholder="e.g. budget, company_size"
          className="w-full rounded border border-[var(--ws-border)] bg-white px-2 py-1 text-xs text-[var(--ws-text-primary)] placeholder-[var(--ws-text-muted)] outline-none focus:border-[var(--ws-accent)]"
        />
      )}
    </div>
  );
}

// ─── Field Row ────────────────────────────────────────────────────────────────

interface FieldRowProps {
  field: BuilderField;
  index: number;
  total: number;
  expanded: boolean;
  onToggle: () => void;
  onChange: (updates: Partial<BuilderField>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function FieldRow({
  field,
  index,
  total,
  expanded,
  onToggle,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: FieldRowProps) {
  const hasOptions = ["select", "radio", "checkbox"].includes(field.field_type);

  function handleLabelChange(label: string) {
    const key = slugify(label);
    const mapping = defaultLeadMapping(field.field_type);
    onChange({
      label,
      field_key: key,
      // Only auto-update lead_mapping if it's currently null or was auto-set
      ...(field.lead_mapping === null || isAutoMapping(field)
        ? { lead_mapping: mapping }
        : {}),
    });
  }

  function handleTypeChange(fieldType: ActionPageField["field_type"]) {
    const mapping = defaultLeadMapping(fieldType);
    onChange({
      field_type: fieldType,
      lead_mapping: mapping,
      // Clear options if switching away from option-based types
      options: ["select", "radio", "checkbox"].includes(fieldType) ? field.options : [],
    });
  }

  function isAutoMapping(f: BuilderField): boolean {
    if (!f.lead_mapping) return false;
    if (f.lead_mapping.target === "lead_contact") return true;
    return false;
  }

  return (
    <div className="rounded-lg border border-[var(--ws-border)] bg-white">
      {/* Row header */}
      <div className="flex items-center gap-2 p-3">
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            disabled={index === 0}
            onClick={onMoveUp}
            className="text-[var(--ws-text-faint)] hover:text-[var(--ws-text-primary)] disabled:opacity-30"
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            disabled={index === total - 1}
            onClick={onMoveDown}
            className="text-[var(--ws-text-faint)] hover:text-[var(--ws-text-primary)] disabled:opacity-30"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>

        <GripVertical className="h-4 w-4 shrink-0 text-[var(--ws-text-faint)]" />

        <input
          type="text"
          value={field.label}
          onChange={(e) => handleLabelChange(e.target.value)}
          placeholder="Field label"
          className="flex-1 bg-transparent text-sm text-[var(--ws-text-primary)] placeholder-[var(--ws-text-muted)] outline-none"
        />

        <select
          value={field.field_type}
          onChange={(e) => handleTypeChange(e.target.value as ActionPageField["field_type"])}
          className="rounded border border-[var(--ws-border)] bg-white px-2 py-1 text-xs text-[var(--ws-text-tertiary)] outline-none"
        >
          {FIELD_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-1 text-xs text-[var(--ws-text-tertiary)]">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(e) => onChange({ required: e.target.checked })}
            className="accent-[var(--ws-accent)]"
          />
          Req
        </label>

        <button
          type="button"
          onClick={onToggle}
          className="text-[var(--ws-text-muted)] hover:text-[var(--ws-text-primary)]"
          aria-label={expanded ? "Collapse field" : "Expand field"}
        >
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>

        <button
          type="button"
          onClick={onRemove}
          className="text-[var(--ws-text-muted)] hover:text-[var(--ws-danger)]"
          aria-label="Remove field"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Expanded config */}
      {expanded && (
        <div className="border-t border-[var(--ws-border-subtle)] px-4 pb-4 pt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ws-text-muted)]">
                Field key
              </label>
              <input
                type="text"
                value={field.field_key}
                onChange={(e) => onChange({ field_key: e.target.value })}
                placeholder="field_key"
                className="w-full rounded border border-[var(--ws-border)] bg-white px-2 py-1.5 text-xs font-mono text-[var(--ws-text-primary)] placeholder-[var(--ws-text-muted)] outline-none focus:border-[var(--ws-accent)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ws-text-muted)]">
                Placeholder
              </label>
              <input
                type="text"
                value={field.placeholder}
                onChange={(e) => onChange({ placeholder: e.target.value })}
                placeholder="Hint text"
                className="w-full rounded border border-[var(--ws-border)] bg-white px-2 py-1.5 text-xs text-[var(--ws-text-primary)] placeholder-[var(--ws-text-muted)] outline-none focus:border-[var(--ws-accent)]"
              />
            </div>
          </div>

          {hasOptions && (
            <OptionsEditor
              options={field.options}
              onChange={(opts) => onChange({ options: opts })}
            />
          )}

          <LeadMappingSelector
            value={field.lead_mapping}
            onChange={(mapping) => onChange({ lead_mapping: mapping })}
          />
        </div>
      )}
    </div>
  );
}

// ─── Form Settings Panel ──────────────────────────────────────────────────────

function FormSettingsPanel({
  config,
  onChange,
}: {
  config: FormConfig;
  onChange: (updates: Partial<FormConfig>) => void;
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--ws-text-muted)]">
        Form Settings
      </h3>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">
          Heading
        </label>
        <input
          type="text"
          value={config.heading}
          onChange={(e) => onChange({ heading: e.target.value })}
          placeholder="Form heading (optional)"
          className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] placeholder-[var(--ws-text-muted)] outline-none focus:border-[var(--ws-accent)]"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">
          Description
        </label>
        <textarea
          rows={2}
          value={config.description ?? ""}
          onChange={(e) => onChange({ description: e.target.value || undefined })}
          placeholder="Short description (optional)"
          className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] placeholder-[var(--ws-text-muted)] outline-none focus:border-[var(--ws-accent)]"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">
          Layout
        </label>
        <select
          value={config.layout}
          onChange={(e) => onChange({ layout: e.target.value as FormConfig["layout"] })}
          className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] outline-none focus:border-[var(--ws-accent)]"
        >
          {LAYOUT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {config.layout === "with_hero" && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">
            Hero Image URL
          </label>
          <input
            type="url"
            value={config.hero_image_url ?? ""}
            onChange={(e) => onChange({ hero_image_url: e.target.value || undefined })}
            placeholder="https://..."
            className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] placeholder-[var(--ws-text-muted)] outline-none focus:border-[var(--ws-accent)]"
          />
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">
          Submit Button Text
        </label>
        <input
          type="text"
          value={config.submit_button_text}
          onChange={(e) => onChange({ submit_button_text: e.target.value })}
          placeholder="Submit"
          className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] placeholder-[var(--ws-text-muted)] outline-none focus:border-[var(--ws-accent)]"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">
          Brand Color
        </label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={config.brand_color ?? "#2563eb"}
            onChange={(e) => onChange({ brand_color: e.target.value })}
            className="h-8 w-10 cursor-pointer rounded border border-[var(--ws-border)] p-0.5"
          />
          <input
            type="text"
            value={config.brand_color ?? ""}
            onChange={(e) => onChange({ brand_color: e.target.value || undefined })}
            placeholder="#2563eb"
            className="flex-1 rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm font-mono text-[var(--ws-text-primary)] placeholder-[var(--ws-text-muted)] outline-none focus:border-[var(--ws-accent)]"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">
          Thank-you Message
        </label>
        <input
          type="text"
          value={config.thank_you_message}
          onChange={(e) => onChange({ thank_you_message: e.target.value })}
          placeholder="Thanks! We'll be in touch."
          className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] placeholder-[var(--ws-text-muted)] outline-none focus:border-[var(--ws-accent)]"
        />
      </div>
    </div>
  );
}

// ─── Main FormBuilder ─────────────────────────────────────────────────────────

export default function FormBuilder({
  actionPageId,
  initialTitle,
  initialSlug,
  initialPublished,
  initialConfig,
  initialFields,
  onSave,
}: FormBuilderProps) {
  const [title, setTitle] = useState(initialTitle);
  const [published, setPublished] = useState(initialPublished);
  const [config, setConfig] = useState<FormConfig>(initialConfig);
  const [fields, setFields] = useState<BuilderField[]>(
    [...initialFields].sort((a, b) => a.order_index - b.order_index)
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Config helpers ──

  function updateConfig(updates: Partial<FormConfig>) {
    setConfig((prev) => ({ ...prev, ...updates }));
  }

  // ── Field helpers ──

  function addField() {
    const newField = makeBlankField(fields.length);
    setFields((prev) => [...prev, newField]);
    setExpandedId(newField.id);
  }

  function removeField(id: string) {
    setFields((prev) => {
      const next = prev.filter((f) => f.id !== id).map((f, i) => ({ ...f, order_index: i }));
      return next;
    });
    if (expandedId === id) setExpandedId(null);
  }

  function updateField(id: string, updates: Partial<BuilderField>) {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  }

  function moveField(id: string, direction: "up" | "down") {
    setFields((prev) => {
      const idx = prev.findIndex((f) => f.id === id);
      if (idx === -1) return prev;
      const newIdx = direction === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next.map((f, i) => ({ ...f, order_index: i }));
    });
  }

  // ── Save ──

  async function handleSave() {
    setSaveError(null);
    setSaving(true);
    try {
      await onSave({ title, published, config, fields });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // Renderer fields (sorted)
  const rendererFields = fields.map(toRendererField);

  return (
    <div className="flex h-full flex-col">
      {/* Top Bar */}
      <div className="flex items-center gap-3 border-b border-[var(--ws-border)] bg-white px-6 py-3">
        <Link
          href="/app/actions"
          className="text-[var(--ws-text-muted)] hover:text-[var(--ws-text-primary)]"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>

        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="flex-1 bg-transparent text-lg font-semibold text-[var(--ws-text-primary)] outline-none"
        />

        <Badge variant="muted">/{initialSlug}</Badge>

        <button
          type="button"
          onClick={() => setPublished((p) => !p)}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            published
              ? "bg-[var(--ws-success-light)] text-[var(--ws-success)]"
              : "bg-[var(--ws-border-subtle)] text-[var(--ws-text-muted)]"
          }`}
        >
          <Globe className="h-3.5 w-3.5" />
          {published ? "Published" : "Draft"}
        </button>

        {saveError && (
          <p className="text-xs text-[var(--ws-danger)]">{saveError}</p>
        )}

        <Button variant="primary" onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>

      {/* Editor + Preview */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Editor */}
        <div className="w-1/2 space-y-6 overflow-y-auto border-r border-[var(--ws-border)] p-6">
          <FormSettingsPanel config={config} onChange={updateConfig} />

          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--ws-text-muted)]">
              Fields
            </h3>
            <div className="space-y-2">
              {fields.map((field, index) => (
                <FieldRow
                  key={field.id}
                  field={field}
                  index={index}
                  total={fields.length}
                  expanded={expandedId === field.id}
                  onToggle={() =>
                    setExpandedId((prev) => (prev === field.id ? null : field.id))
                  }
                  onChange={(updates) => updateField(field.id, updates)}
                  onRemove={() => removeField(field.id)}
                  onMoveUp={() => moveField(field.id, "up")}
                  onMoveDown={() => moveField(field.id, "down")}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={addField}
              className="mt-3 flex items-center gap-1.5 text-sm text-[var(--ws-text-tertiary)] hover:text-[var(--ws-text-primary)]"
            >
              <Plus className="h-4 w-4" />
              Add field
            </button>
          </div>
        </div>

        {/* Right: Preview */}
        <div className="flex w-1/2 flex-col items-center justify-start overflow-y-auto bg-[var(--ws-page)] p-8">
          <div className="mb-3 flex items-center gap-1.5 text-xs text-[var(--ws-text-muted)]">
            <Eye className="h-3.5 w-3.5" />
            Preview
          </div>
          <Card className="w-full max-w-sm p-6">
            <FormRenderer
              actionPageId={actionPageId}
              config={config}
              fields={rendererFields}
              psid="_preview_"
              sig="_preview_"
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
