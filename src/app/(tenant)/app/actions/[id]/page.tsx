"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import FormBuilder, { type BuilderField } from "@/components/action-pages/FormBuilder";
import type { FormConfig } from "@/types/database";

const DEFAULT_CONFIG: FormConfig = {
  heading: "",
  layout: "single_column",
  submit_button_text: "Submit",
  thank_you_message: "Thanks! We'll be in touch.",
};

interface ActionPage {
  id: string;
  title: string;
  slug: string;
  type: "form" | "calendar" | "sales" | "product_catalog" | "checkout";
  published: boolean;
  config: FormConfig;
}

export default function ActionPageEditor() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [actionPage, setActionPage] = useState<ActionPage | null>(null);
  const [fields, setFields] = useState<BuilderField[]>([]);

  useEffect(() => {
    if (!id) return;

    async function load() {
      try {
        const [pageRes, fieldsRes] = await Promise.all([
          fetch(`/api/action-pages/${id}`),
          fetch(`/api/action-pages/${id}/fields`),
        ]);

        if (pageRes.status === 404) {
          setNotFound(true);
          return;
        }

        if (!pageRes.ok) {
          throw new Error(`Failed to load page: ${pageRes.status}`);
        }

        const pageData = await pageRes.json();
        const page: ActionPage = pageData.actionPage;

        const config: FormConfig =
          page.type === "form" && page.config && typeof page.config === "object"
            ? { ...DEFAULT_CONFIG, ...(page.config as Partial<FormConfig>) }
            : DEFAULT_CONFIG;

        setActionPage({ ...page, config });

        if (fieldsRes.ok) {
          const fieldsData = await fieldsRes.json();
          const rawFields = Array.isArray(fieldsData.fields) ? fieldsData.fields : [];
          const builderFields: BuilderField[] = rawFields.map(
            (f: {
              id: string;
              label: string;
              field_key: string;
              field_type: BuilderField["field_type"];
              placeholder: string | null;
              required: boolean;
              options: unknown;
              order_index: number;
              lead_mapping: unknown;
            }) => ({
              id: f.id,
              label: f.label,
              field_key: f.field_key,
              field_type: f.field_type,
              placeholder: f.placeholder ?? "",
              required: f.required,
              options: Array.isArray(f.options) ? (f.options as string[]) : [],
              order_index: f.order_index,
              lead_mapping: (f.lead_mapping as BuilderField["lead_mapping"]) ?? null,
            })
          );
          setFields(builderFields);
        }
      } catch (err) {
        console.error("Error loading action page:", err);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [id]);

  async function handleSave(data: {
    title: string;
    published: boolean;
    config: FormConfig;
    fields: BuilderField[];
  }) {
    const [pageRes, fieldsRes] = await Promise.all([
      fetch(`/api/action-pages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: data.title,
          published: data.published,
          config: data.config,
        }),
      }),
      fetch(`/api/action-pages/${id}/fields`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: data.fields }),
      }),
    ]);

    if (!pageRes.ok) {
      const body = await pageRes.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error ?? "Failed to save page");
    }

    if (!fieldsRes.ok) {
      const body = await fieldsRes.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error ?? "Failed to save fields");
    }
  }

  // ── States ──

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-[var(--ws-text-muted)]">Loading...</p>
      </div>
    );
  }

  if (notFound || !actionPage) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <p className="text-base font-medium text-[var(--ws-text-primary)]">Page not found</p>
        <p className="text-sm text-[var(--ws-text-muted)]">
          This action page doesn&apos;t exist or you don&apos;t have access.
        </p>
      </div>
    );
  }

  if (actionPage.type !== "form") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <p className="text-base font-medium text-[var(--ws-text-primary)]">
          {actionPage.type.replace(/_/g, " ")} editor
        </p>
        <p className="text-sm text-[var(--ws-text-muted)]">
          Coming soon — this page type is not yet editable here.
        </p>
      </div>
    );
  }

  return (
    <FormBuilder
      actionPageId={actionPage.id}
      initialTitle={actionPage.title}
      initialSlug={actionPage.slug}
      initialPublished={actionPage.published}
      initialConfig={actionPage.config}
      initialFields={fields}
      onSave={handleSave}
    />
  );
}
