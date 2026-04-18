"use client";

import { Package } from "lucide-react";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import ProcessingStatus from "./ProcessingStatus";
import type { KnowledgeDoc } from "@/hooks/useKnowledgeDocs";

interface ProductKnowledgeProps {
  docs: KnowledgeDoc[];
}

export default function ProductKnowledge({ docs }: ProductKnowledgeProps) {
  const productDocs = docs.filter((d) => d.type === "product");

  return (
    <div>
      <div className="mb-4">
        <p className="text-sm text-[var(--ws-text-tertiary)]">
          Your product catalog is automatically synced from your ecommerce platform.
        </p>
      </div>

      {productDocs.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No product knowledge"
          description="Connect your product catalog and it will appear here automatically."
        />
      ) : (
        <div className="space-y-2">
          {productDocs.map((doc) => (
            <Card key={doc.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <Package className="h-5 w-5 text-[var(--ws-text-muted)]" />
                <p className="text-sm font-medium text-[var(--ws-text-primary)]">
                  {doc.title}
                </p>
              </div>
              <ProcessingStatus
                status={doc.status}
                errorMessage={
                  doc.status === "error"
                    ? (doc.metadata?.error as string) ?? undefined
                    : undefined
                }
              />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
