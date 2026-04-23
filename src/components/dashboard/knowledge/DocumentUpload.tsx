"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, FileText, RefreshCw } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import ProcessingStatus from "./ProcessingStatus";
import type { KnowledgeDoc } from "@/hooks/useKnowledgeDocs";

const ALLOWED_EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

interface DocumentUploadProps {
  docs: KnowledgeDoc[];
  onUploadComplete: () => void;
}

export default function DocumentUpload({ docs, onUploadComplete }: DocumentUploadProps) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const retryInputRef = useRef<HTMLInputElement>(null);
  const retryDocRef = useRef<KnowledgeDoc | null>(null);

  const documentDocs = docs.filter((d) => ["pdf", "docx", "xlsx"].includes(d.type));

  const handleFiles = useCallback(
    async (files: FileList) => {
      setError(null);
      const file = files[0];
      if (!file) return;

      const docType = ALLOWED_EXTENSIONS[file.type];
      if (!docType) {
        setError("Unsupported file type. Please upload PDF, Word, or Excel files.");
        return;
      }

      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("title", file.name.replace(/\.[^/.]+$/, ""));
        formData.append("type", docType);

        const res = await fetch("/api/knowledge/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const body = await res.json();
          setError(body.error ?? "Upload failed");
          return;
        }

        onUploadComplete();
      } catch {
        setError("Upload failed. Please try again.");
      } finally {
        setUploading(false);
      }
    },
    [onUploadComplete]
  );

  const handleRetryFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const doc = retryDocRef.current;
      if (!e.target.files || !doc) return;

      const file = e.target.files[0];
      if (!file) return;

      const docType = ALLOWED_EXTENSIONS[file.type];
      if (!docType) {
        setError("Unsupported file type.");
        return;
      }

      setRetryingId(doc.id);
      setError(null);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("type", docType);

        const res = await fetch(`/api/knowledge/retry/${doc.id}`, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const body = await res.json();
          setError(body.error ?? "Retry failed");
          return;
        }

        onUploadComplete();
      } catch {
        setError("Retry failed. Please try again.");
      } finally {
        setRetryingId(null);
        retryDocRef.current = null;
        // Reset so the same file can be selected again
        e.target.value = "";
      }
    },
    [onUploadComplete]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) handleFiles(e.target.files);
    },
    [handleFiles]
  );

  return (
    <div>
      {/* Drop zone */}
      <div
        data-testid="drop-zone"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`mb-4 flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors ${
          dragOver
            ? "border-[var(--ws-accent)] bg-[var(--ws-accent)]/5"
            : "border-[var(--ws-border-strong)] bg-[var(--ws-page)]"
        }`}
      >
        <Upload className="mb-2 h-8 w-8 text-[var(--ws-text-muted)]" />
        <p className="mb-1 text-sm font-medium text-[var(--ws-text-primary)]">
          Drag and drop files here
        </p>
        <p className="mb-3 text-xs text-[var(--ws-text-muted)]">
          PDF, Word (.docx), or Excel (.xlsx)
        </p>
        <Button
          variant="secondary"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? "Uploading..." : "Browse Files"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.docx,.xlsx"
          onChange={handleFileInput}
          disabled={uploading}
        />
      </div>

      <input
        ref={retryInputRef}
        type="file"
        className="hidden"
        accept=".pdf,.docx,.xlsx"
        onChange={handleRetryFile}
      />

      {error && (
        <p className="mb-4 text-sm text-[var(--ws-danger)]">{error}</p>
      )}

      {/* Document list */}
      {documentDocs.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No documents uploaded"
          description="Upload PDFs, Word docs, or Excel files to teach your bot about your business."
        />
      ) : (
        <div className="space-y-2">
          {documentDocs.map((doc) => (
            <Card key={doc.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-[var(--ws-text-muted)]" />
                <div>
                  <p className="text-sm font-medium text-[var(--ws-text-primary)]">
                    {doc.title}
                  </p>
                  <p className="text-xs text-[var(--ws-text-muted)]">
                    {new Date(doc.created_at).toLocaleDateString()}
                  </p>
                </div>
                <Badge variant="muted">{doc.type.toUpperCase()}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <ProcessingStatus
                  status={doc.status}
                  errorMessage={
                    doc.status === "error"
                      ? (doc.metadata?.error as string) ?? undefined
                      : undefined
                  }
                />
                {doc.status === "error" && (
                  <Button
                    variant="secondary"
                    disabled={retryingId === doc.id}
                    onClick={() => {
                      retryDocRef.current = doc;
                      retryInputRef.current?.click();
                    }}
                    data-testid={`retry-btn-${doc.id}`}
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${retryingId === doc.id ? "animate-spin" : ""}`}
                    />
                    {retryingId === doc.id ? "Retrying…" : "Retry"}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
