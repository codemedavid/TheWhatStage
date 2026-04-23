"use client";

import { useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { FileEdit, Plus, Bold, Italic, List, ListOrdered, Heading2 } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import ProcessingStatus from "./ProcessingStatus";
import type { KnowledgeDoc } from "@/hooks/useKnowledgeDocs";

interface RichTextEditorProps {
  docs: KnowledgeDoc[];
  onSaveComplete: () => void;
}

export default function RichTextEditor({ docs, onSaveComplete }: RichTextEditorProps) {
  const [showEditor, setShowEditor] = useState(false);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const richtextDocs = docs.filter((d) => d.type === "richtext");

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit],
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none p-4 min-h-[200px] outline-none focus:outline-none",
      },
    },
  });

  const handleSave = async () => {
    setValidationError(null);
    setError(null);

    if (!title.trim()) {
      setValidationError("Title is required");
      return;
    }

    const html = editor?.getHTML() ?? "";
    if (!html || html === "<p></p>") {
      setValidationError("Content is required");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/knowledge/richtext", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), content: html }),
      });

      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? "Failed to save document");
        return;
      }

      setTitle("");
      editor?.commands.clearContent();
      setShowEditor(false);
      onSaveComplete();
    } catch {
      setError("Failed to save document");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-[var(--ws-text-tertiary)]">
          Write custom content for your bot's knowledge base.
        </p>
        <Button variant="secondary" onClick={() => setShowEditor(!showEditor)}>
          <Plus className="h-4 w-4" />
          New Document
        </Button>
      </div>

      {showEditor && (
        <Card className="mb-4 overflow-hidden">
          <div className="border-b border-[var(--ws-border)] p-4">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Document title..."
              className="w-full text-sm font-medium text-[var(--ws-text-primary)] placeholder-[var(--ws-text-muted)] outline-none"
            />
          </div>

          {/* Toolbar */}
          <div className="flex gap-1 border-b border-[var(--ws-border)] px-3 py-1.5">
            <button
              onClick={() => editor?.chain().focus().toggleBold().run()}
              className="rounded p-1.5 text-[var(--ws-text-muted)] hover:bg-[var(--ws-border-subtle)]"
            >
              <Bold className="h-4 w-4" />
            </button>
            <button
              onClick={() => editor?.chain().focus().toggleItalic().run()}
              className="rounded p-1.5 text-[var(--ws-text-muted)] hover:bg-[var(--ws-border-subtle)]"
            >
              <Italic className="h-4 w-4" />
            </button>
            <button
              onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
              className="rounded p-1.5 text-[var(--ws-text-muted)] hover:bg-[var(--ws-border-subtle)]"
            >
              <Heading2 className="h-4 w-4" />
            </button>
            <button
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
              className="rounded p-1.5 text-[var(--ws-text-muted)] hover:bg-[var(--ws-border-subtle)]"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
              className="rounded p-1.5 text-[var(--ws-text-muted)] hover:bg-[var(--ws-border-subtle)]"
            >
              <ListOrdered className="h-4 w-4" />
            </button>
          </div>

          {/* Editor area — IMPORTANT: data-testid must be on a wrapper div, not EditorContent */}
          <div data-testid="tiptap-editor">
            <EditorContent editor={editor} />
          </div>

          {/* Footer */}
          <div className="border-t border-[var(--ws-border)] p-4">
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
                  setShowEditor(false);
                  setTitle("");
                  editor?.commands.clearContent();
                  setValidationError(null);
                }}
              >
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save Document"}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {richtextDocs.length === 0 ? (
        <EmptyState
          icon={FileEdit}
          title="No documents created"
          description="Use the rich text editor to write custom knowledge content."
        />
      ) : (
        <div className="space-y-2">
          {richtextDocs.map((doc) => (
            <Card key={doc.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <FileEdit className="h-5 w-5 text-[var(--ws-text-muted)]" />
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
