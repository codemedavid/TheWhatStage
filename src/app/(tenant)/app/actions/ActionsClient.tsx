"use client";

import { useState } from "react";
import {
  Plus,
  Link2,
  FileText,
  Calendar,
  ShoppingBag,
  ShoppingCart,
  CreditCard,
  X,
} from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import StatusDot from "@/components/ui/StatusDot";
import type { LucideIcon } from "lucide-react";

interface ActionPageData {
  id: string;
  slug: string;
  type: string;
  title: string;
  published: boolean;
  createdAt: string;
}

const TYPE_CONFIG: Record<
  string,
  { icon: LucideIcon; label: string; color: string; description: string }
> = {
  form: {
    icon: FileText,
    label: "Form",
    color: "text-cyan-600",
    description: "Collect information from leads",
  },
  calendar: {
    icon: Calendar,
    label: "Calendar",
    color: "text-amber-500",
    description: "Let leads book appointments",
  },
  sales: {
    icon: ShoppingBag,
    label: "Sales Page",
    color: "text-purple-500",
    description: "Present an offer with CTA",
  },
  product_catalog: {
    icon: ShoppingCart,
    label: "Product Catalog",
    color: "text-[var(--ws-accent)]",
    description: "Browse and purchase products",
  },
  checkout: {
    icon: CreditCard,
    label: "Checkout",
    color: "text-blue-500",
    description: "Payment collection page",
  },
};

export default function ActionsClient({
  actionPages,
}: {
  actionPages: ActionPageData[];
}) {
  const [showTypeModal, setShowTypeModal] = useState(false);

  return (
    <div className="p-6 pt-14 md:pt-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[var(--ws-text-primary)]">
          Action Pages
        </h1>
        <Button variant="primary" onClick={() => setShowTypeModal(true)}>
          <Plus className="h-4 w-4" />
          Create Page
        </Button>
      </div>

      {actionPages.length === 0 ? (
        <EmptyState
          icon={Link2}
          title="No action pages"
          description="Create action pages that your Messenger bot sends to leads — forms, calendars, product pages, and more."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {actionPages.map((page) => {
            const config = TYPE_CONFIG[page.type] ?? TYPE_CONFIG.form;
            const Icon = config.icon;
            return (
              <a key={page.id} href={`/app/actions/${page.id}`}>
                <Card className="cursor-pointer p-4 transition-shadow hover:shadow-[var(--ws-shadow-md)]">
                  <div className="mb-3 flex items-center justify-between">
                    <Icon className={`h-5 w-5 ${config.color}`} />
                    <StatusDot
                      color={page.published ? "#059669" : "#9CA3AF"}
                    />
                  </div>
                  <h3 className="mb-1 text-sm font-medium text-[var(--ws-text-primary)]">
                    {page.title}
                  </h3>
                  <p className="text-xs text-[var(--ws-text-muted)]">
                    /{page.slug}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <Badge variant="muted">{config.label}</Badge>
                    <Badge variant={page.published ? "success" : "muted"}>
                      {page.published ? "Published" : "Draft"}
                    </Badge>
                  </div>
                </Card>
              </a>
            );
          })}
        </div>
      )}

      {showTypeModal && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/20"
            onClick={() => setShowTypeModal(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-lg p-6 shadow-[var(--ws-shadow-lg)]">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[var(--ws-text-primary)]">
                  Choose Page Type
                </h2>
                <button
                  onClick={() => setShowTypeModal(false)}
                  className="rounded-lg p-1.5 text-[var(--ws-text-muted)] hover:text-[var(--ws-text-primary)]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {Object.entries(TYPE_CONFIG).map(([type, config]) => {
                  const Icon = config.icon;
                  return (
                    <a
                      key={type}
                      href={`/app/actions/new?type=${type}`}
                      className="rounded-xl border border-[var(--ws-border)] p-4 transition-colors hover:bg-[var(--ws-page)]"
                    >
                      <Icon className={`mb-2 h-5 w-5 ${config.color}`} />
                      <h3 className="text-sm font-medium text-[var(--ws-text-primary)]">
                        {config.label}
                      </h3>
                      <p className="mt-0.5 text-xs text-[var(--ws-text-tertiary)]">
                        {config.description}
                      </p>
                    </a>
                  );
                })}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
