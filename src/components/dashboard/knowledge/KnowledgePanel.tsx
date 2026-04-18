"use client";

import { useState } from "react";
import { FileText, HelpCircle, FileEdit, Package } from "lucide-react";
import { useKnowledgeDocs } from "@/hooks/useKnowledgeDocs";
import DocumentUpload from "./DocumentUpload";
import FaqEditor from "./FaqEditor";
import RichTextEditor from "./RichTextEditor";
import ProductKnowledge from "./ProductKnowledge";

type SubTab = "documents" | "faq" | "editor" | "products";

const SUB_TABS: { id: SubTab; label: string; icon: React.ElementType }[] = [
  { id: "documents", label: "Documents", icon: FileText },
  { id: "faq", label: "FAQ", icon: HelpCircle },
  { id: "editor", label: "Editor", icon: FileEdit },
  { id: "products", label: "Products", icon: Package },
];

export default function KnowledgePanel() {
  const [activeTab, setActiveTab] = useState<SubTab>("documents");
  const { docs, loading, refetch } = useKnowledgeDocs();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--ws-border-strong)] border-t-[var(--ws-accent)]" />
      </div>
    );
  }

  return (
    <div>
      {/* Sub-tab navigation */}
      <div className="mb-4 flex gap-1 rounded-lg bg-[var(--ws-page)] p-1">
        {SUB_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                isActive
                  ? "bg-white text-[var(--ws-text-primary)] shadow-sm"
                  : "text-[var(--ws-text-tertiary)] hover:text-[var(--ws-text-primary)]",
              ].join(" ")}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Sub-tab content */}
      {activeTab === "documents" && (
        <DocumentUpload docs={docs} onUploadComplete={refetch} />
      )}
      {activeTab === "faq" && (
        <FaqEditor docs={docs} onFaqAdded={refetch} />
      )}
      {activeTab === "editor" && (
        <RichTextEditor docs={docs} onSaveComplete={refetch} />
      )}
      {activeTab === "products" && (
        <ProductKnowledge docs={docs} />
      )}
    </div>
  );
}
