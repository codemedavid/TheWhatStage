"use client";

import { useState } from "react";
import type { Database, FormConfig, LeadMapping } from "@/types/database";

type ActionPageField = Database["public"]["Tables"]["action_page_fields"]["Row"];

interface FormRendererProps {
  actionPageId: string;
  config: FormConfig;
  fields: ActionPageField[];
  psid: string;
  sig: string;
}

type FieldErrors = Record<string, string>;

function validateEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validatePhone(value: string): boolean {
  return /^\+?[\d\s\-()]{7,20}$/.test(value);
}

export default function FormRenderer({ actionPageId, config, fields, psid, sig }: FormRendererProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const brandColor = config.brand_color || "#2563eb";

  function handleChange(fieldKey: string, value: string) {
    setValues((prev) => ({ ...prev, [fieldKey]: value }));
    if (errors[fieldKey]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[fieldKey];
        return next;
      });
    }
  }

  function validate(): FieldErrors {
    const errs: FieldErrors = {};
    for (const field of fields) {
      const val = (values[field.field_key] ?? "").trim();
      if (field.required && !val) {
        errs[field.field_key] = `${field.label} is required`;
        continue;
      }
      if (val && field.field_type === "email" && !validateEmail(val)) {
        errs[field.field_key] = "Invalid email address";
      }
      if (val && field.field_type === "phone" && !validatePhone(val)) {
        errs[field.field_key] = "Invalid phone number";
      }
    }
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/action-pages/${actionPageId}/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ psid, sig, data: values }),
      });

      if (!res.ok) {
        const body = await res.json();
        setErrors({ _form: body.error || "Submission failed" });
        return;
      }

      setSubmitted(true);
    } catch {
      setErrors({ _form: "Something went wrong. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-4">✓</div>
        <p className="text-lg font-medium text-gray-900">
          {config.thank_you_message || "Thanks for submitting!"}
        </p>
      </div>
    );
  }

  const isHero = config.layout === "with_hero";
  const isTwoCol = config.layout === "two_column";

  return (
    <div>
      {isHero && config.hero_image_url && (
        <div className="w-full h-48 mb-6 rounded-lg overflow-hidden">
          <img
            src={config.hero_image_url}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {config.heading && (
        <h2 className="text-xl font-semibold text-gray-900 mb-1">{config.heading}</h2>
      )}
      {config.description && (
        <p className="text-sm text-gray-500 mb-6">{config.description}</p>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className={isTwoCol ? "grid grid-cols-2 gap-4" : "space-y-4"}>
          {fields.map((field) => (
            <FormField
              key={field.id}
              field={field}
              value={values[field.field_key] ?? ""}
              error={errors[field.field_key]}
              onChange={(v) => handleChange(field.field_key, v)}
              brandColor={brandColor}
            />
          ))}
        </div>

        {errors._form && (
          <p className="text-sm text-red-600 mt-4">{errors._form}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full mt-6 py-2.5 px-4 rounded-lg text-white font-medium text-sm transition-opacity disabled:opacity-50"
          style={{ backgroundColor: brandColor }}
        >
          {submitting ? "Submitting..." : config.submit_button_text || "Submit"}
        </button>
      </form>
    </div>
  );
}

// ─── Individual Field Renderer ───────────────────────────────────────────────

interface FormFieldProps {
  field: ActionPageField;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  brandColor: string;
}

function FormField({ field, value, error, onChange, brandColor }: FormFieldProps) {
  const options = (field.options as string[] | null) ?? [];
  const inputClasses = `w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors ${
    error ? "border-red-400" : "border-gray-300 focus:border-blue-500"
  }`;

  return (
    <div className={field.field_type === "textarea" ? "col-span-full" : ""}>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {field.label}
        {field.required && <span className="text-red-500 ml-0.5">*</span>}
      </label>

      {(field.field_type === "text" || field.field_type === "email" || field.field_type === "phone") && (
        <input
          type={field.field_type === "phone" ? "tel" : field.field_type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? ""}
          className={inputClasses}
        />
      )}

      {field.field_type === "number" && (
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? ""}
          className={inputClasses}
        />
      )}

      {field.field_type === "textarea" && (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? ""}
          rows={4}
          className={inputClasses}
        />
      )}

      {field.field_type === "select" && (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClasses}
        >
          <option value="">{field.placeholder || "Select..."}</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      )}

      {field.field_type === "radio" && (
        <div className="space-y-2 mt-1">
          {options.map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name={field.field_key}
                value={opt}
                checked={value === opt}
                onChange={() => onChange(opt)}
                style={{ accentColor: brandColor }}
              />
              {opt}
            </label>
          ))}
        </div>
      )}

      {field.field_type === "checkbox" && (
        <label className="flex items-center gap-2 text-sm text-gray-700 mt-1">
          <input
            type="checkbox"
            checked={value === "true"}
            onChange={(e) => onChange(e.target.checked ? "true" : "")}
            style={{ accentColor: brandColor }}
          />
          {field.placeholder || field.label}
        </label>
      )}

      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
