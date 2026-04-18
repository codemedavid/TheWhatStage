"use client";

import { ShoppingCart, Home, Package, Briefcase } from "lucide-react";
import Button from "@/components/ui/Button";

type BusinessType = "ecommerce" | "real_estate" | "digital_product" | "services";

interface TemplateSelectorProps {
  onSeed: (businessType: BusinessType) => void;
  seeding: boolean;
}

const TEMPLATES: { type: BusinessType; label: string; icon: React.ElementType; description: string }[] = [
  {
    type: "ecommerce",
    label: "E-Commerce",
    icon: ShoppingCart,
    description: "Greet → Browse → Recommend → Cart → Follow-up",
  },
  {
    type: "real_estate",
    label: "Real Estate",
    icon: Home,
    description: "Greet → Understand Needs → Qualify → Show Listings → Schedule",
  },
  {
    type: "digital_product",
    label: "Digital Product",
    icon: Package,
    description: "Greet → Educate → Demo → Pitch → Close",
  },
  {
    type: "services",
    label: "Services",
    icon: Briefcase,
    description: "Greet → Nurture → Qualify → Pitch → Close",
  },
];

export default function TemplateSelector({ onSeed, seeding }: TemplateSelectorProps) {
  return (
    <div className="flex flex-col items-center py-12">
      <div className="mb-2 rounded-full bg-[var(--ws-accent)]/10 p-3">
        <Briefcase className="h-6 w-6 text-[var(--ws-accent)]" />
      </div>
      <h2 className="mb-1 text-lg font-semibold text-[var(--ws-text-primary)]">
        No conversation flow configured
      </h2>
      <p className="mb-8 max-w-md text-center text-sm text-[var(--ws-text-tertiary)]">
        Choose a template to get started. Each template creates a multi-phase
        conversation flow tailored to your business type. You can customize
        every phase after seeding.
      </p>
      <div className="grid w-full max-w-2xl grid-cols-2 gap-3">
        {TEMPLATES.map((tmpl) => {
          const Icon = tmpl.icon;
          return (
            <Button
              key={tmpl.type}
              variant="secondary"
              disabled={seeding}
              onClick={() => onSeed(tmpl.type)}
              className="flex h-auto flex-col items-start gap-1 rounded-xl px-4 py-4 text-left"
            >
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-[var(--ws-accent)]" />
                <span className="text-sm font-medium text-[var(--ws-text-primary)]">
                  {tmpl.label}
                </span>
              </div>
              <span className="text-xs text-[var(--ws-text-muted)]">
                {tmpl.description}
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
