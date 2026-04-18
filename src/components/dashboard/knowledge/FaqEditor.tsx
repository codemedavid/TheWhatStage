"use client";

import { useState } from "react";
import { HelpCircle, Plus } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import ProcessingStatus from "./ProcessingStatus";
import type { KnowledgeDoc } from "@/hooks/useKnowledgeDocs";

interface FaqEditorProps {
  docs: KnowledgeDoc[];
  onFaqAdded: () => void;
}

export default function FaqEditor({ docs, onFaqAdded }: FaqEditorProps) {
  const [showForm, setShowForm] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const faqDocs = docs.filter((d) => d.type === "faq");

  const handleSubmit = async () => {
    setValidationError(null);
    setError(null);

    if (!question.trim() || !answer.trim()) {
      setValidationError("Question is required");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/knowledge/faq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim(), answer: answer.trim() }),
      });

      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? "Failed to save FAQ");
        return;
      }

      setQuestion("");
      setAnswer("");
      setShowForm(false);
      onFaqAdded();
    } catch {
      setError("Failed to save FAQ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-[var(--ws-text-tertiary)]">
          Add question and answer pairs for common inquiries.
        </p>
        <Button variant="secondary" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4" />
          Add FAQ
        </Button>
      </div>

      {showForm && (
        <Card className="mb-4 p-4">
          <div className="mb-3">
            <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">
              Question
            </label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Enter the question..."
              className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] placeholder-[var(--ws-text-muted)] outline-none focus:border-[var(--ws-accent)]"
            />
          </div>
          <div className="mb-3">
            <label className="mb-1.5 block text-xs font-medium text-[var(--ws-text-muted)]">
              Answer
            </label>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Enter the answer..."
              rows={3}
              className="w-full rounded-lg border border-[var(--ws-border-strong)] bg-white px-3 py-2 text-sm text-[var(--ws-text-primary)] placeholder-[var(--ws-text-muted)] outline-none focus:border-[var(--ws-accent)]"
            />
          </div>
          {validationError && (
            <p className="mb-2 text-sm text-[var(--ws-danger)]">{validationError}</p>
          )}
          {error && (
            <p className="mb-2 text-sm text-[var(--ws-danger)]">{error}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setShowForm(false);
                setQuestion("");
                setAnswer("");
                setValidationError(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSubmit} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </Card>
      )}

      {faqDocs.length === 0 ? (
        <EmptyState
          icon={HelpCircle}
          title="No FAQs added"
          description="Add common questions and answers so your bot can respond accurately."
        />
      ) : (
        <div className="space-y-2">
          {faqDocs.map((doc) => (
            <Card key={doc.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <HelpCircle className="h-5 w-5 text-[var(--ws-text-muted)]" />
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
