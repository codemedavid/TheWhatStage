# Phase 6: Knowledge Upload Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the tenant-facing dashboard UI for managing the knowledge base — document uploads with drag-and-drop, FAQ pair editing, a Tiptap rich text editor, product knowledge entry, and real-time processing status indicators. All wired to existing Phase 2 API routes.

**Architecture:** Replace the placeholder `KnowledgeTab` in `BotClient.tsx` with a full sub-tab system (Documents, FAQ, Editor, Products). Each sub-tab is a standalone component under `src/components/dashboard/knowledge/`. A shared `useKnowledgeDocs` hook handles fetching and polling. A new `GET /api/knowledge/docs` endpoint lists documents. The existing `POST /api/knowledge/upload`, `POST /api/knowledge/faq`, and `GET /api/knowledge/status` endpoints are already built (Phase 2).

**Tech Stack:** TypeScript, React (Next.js App Router client components), Tiptap editor (`@tiptap/react`, `@tiptap/starter-kit`), Vitest + React Testing Library (component tests), Playwright (E2E tests), existing UI components (`Button`, `Card`, `Badge`, `EmptyState`), existing design tokens (`--ws-*` CSS variables), Lucide React icons

---

## File Structure

```
src/components/dashboard/knowledge/
├── KnowledgePanel.tsx          # Sub-tab container (Documents | FAQ | Editor | Products)
├── DocumentUpload.tsx          # Drag-and-drop file upload + document list
├── FaqEditor.tsx               # FAQ Q+A pair list + add/edit form
├── RichTextEditor.tsx          # Tiptap block editor for freeform content
├── ProductKnowledge.tsx        # Product knowledge entry form (links to existing products)
├── ProcessingStatus.tsx        # Status badge/indicator for document processing state

src/hooks/
├── useKnowledgeDocs.ts         # Fetch + poll knowledge_docs for current tenant

src/app/api/knowledge/docs/
├── route.ts                    # GET: list knowledge_docs for tenant

src/app/(tenant)/app/bot/
├── BotClient.tsx               # Modify: replace KnowledgeTab with KnowledgePanel

tests/unit/
├── knowledge-panel.test.tsx
├── document-upload.test.tsx
├── faq-editor.test.tsx
├── rich-text-editor.test.tsx
├── product-knowledge.test.tsx
├── processing-status.test.tsx
├── use-knowledge-docs.test.ts

tests/e2e/
├── knowledge-dashboard.spec.ts
```

---

## Task 1: Knowledge Docs List API Endpoint

**Files:**
- Create: `src/app/api/knowledge/docs/route.ts`
- Test: `tests/unit/knowledge-docs-api.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/knowledge-docs-api.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Supabase clients
const mockGetUser = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
    })
  ),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() =>
            Promise.resolve({
              data: [
                {
                  id: "doc-1",
                  title: "Test PDF",
                  type: "pdf",
                  status: "ready",
                  metadata: {},
                  created_at: "2026-01-01T00:00:00Z",
                },
              ],
              error: null,
            })
          ),
        })),
      })),
    })),
  })),
}));

describe("GET /api/knowledge/docs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "No session" } });

    const { GET } = await import("@/app/api/knowledge/docs/route");
    const response = await GET(new Request("http://localhost/api/knowledge/docs"));

    expect(response.status).toBe(401);
  });

  it("returns 403 when user has no tenant", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: {} } },
      error: null,
    });

    const { GET } = await import("@/app/api/knowledge/docs/route");
    const response = await GET(new Request("http://localhost/api/knowledge/docs"));

    expect(response.status).toBe(403);
  });

  it("returns docs list for authenticated tenant user", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", app_metadata: { tenant_id: "t1" } } },
      error: null,
    });

    const { GET } = await import("@/app/api/knowledge/docs/route");
    const response = await GET(new Request("http://localhost/api/knowledge/docs"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.docs).toBeDefined();
    expect(Array.isArray(body.docs)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/knowledge-docs-api.test.ts`
Expected: FAIL — module `@/app/api/knowledge/docs/route` not found

- [ ] **Step 3: Create the API route**

Create `src/app/api/knowledge/docs/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = user.app_metadata?.tenant_id as string | undefined;
  if (!tenantId) {
    return NextResponse.json({ error: "No tenant associated" }, { status: 403 });
  }

  const service = createServiceClient();
  const { data: docs, error } = await service
    .from("knowledge_docs")
    .select("id, title, type, status, metadata, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch documents" }, { status: 500 });
  }

  return NextResponse.json({ docs: docs ?? [] });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/knowledge-docs-api.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/knowledge/docs/route.ts tests/unit/knowledge-docs-api.test.ts
git commit -m "feat: add GET /api/knowledge/docs endpoint for listing knowledge documents"
```

---

## Task 2: `useKnowledgeDocs` Hook

**Files:**
- Create: `src/hooks/useKnowledgeDocs.ts`
- Test: `tests/unit/use-knowledge-docs.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/use-knowledge-docs.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useKnowledgeDocs } from "@/hooks/useKnowledgeDocs";

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("useKnowledgeDocs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fetches docs on mount", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          docs: [
            { id: "1", title: "Doc 1", type: "pdf", status: "ready", metadata: {}, created_at: "2026-01-01" },
          ],
        }),
    });

    const { result } = renderHook(() => useKnowledgeDocs());

    await waitFor(() => {
      expect(result.current.docs).toHaveLength(1);
    });

    expect(result.current.docs[0].title).toBe("Doc 1");
    expect(result.current.loading).toBe(false);
  });

  it("polls when there are processing docs", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            docs: [{ id: "1", title: "Doc", type: "pdf", status: "processing", metadata: {}, created_at: "2026-01-01" }],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            docs: [{ id: "1", title: "Doc", type: "pdf", status: "ready", metadata: {}, created_at: "2026-01-01" }],
          }),
      });

    const { result } = renderHook(() => useKnowledgeDocs());

    await waitFor(() => {
      expect(result.current.docs).toHaveLength(1);
      expect(result.current.docs[0].status).toBe("processing");
    });

    // Advance past polling interval (3 seconds)
    await act(async () => {
      vi.advanceTimersByTime(3500);
    });

    await waitFor(() => {
      expect(result.current.docs[0].status).toBe("ready");
    });
  });

  it("exposes a refetch function", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ docs: [] }),
    });

    const { result } = renderHook(() => useKnowledgeDocs());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      result.current.refetch();
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/use-knowledge-docs.test.ts`
Expected: FAIL — module `@/hooks/useKnowledgeDocs` not found

- [ ] **Step 3: Create the hook**

Create `src/hooks/useKnowledgeDocs.ts`:

```typescript
"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export interface KnowledgeDoc {
  id: string;
  title: string;
  type: "pdf" | "docx" | "xlsx" | "faq" | "richtext" | "product";
  status: "processing" | "ready" | "error";
  metadata: Record<string, unknown>;
  created_at: string;
}

export function useKnowledgeDocs() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDocs = useCallback(async () => {
    try {
      const res = await fetch("/api/knowledge/docs");
      if (!res.ok) {
        setError("Failed to fetch documents");
        return;
      }
      const data = await res.json();
      setDocs(data.docs);
      setError(null);
    } catch {
      setError("Failed to fetch documents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  // Poll every 3s when any doc is still processing
  useEffect(() => {
    const hasProcessing = docs.some((d) => d.status === "processing");

    if (hasProcessing) {
      intervalRef.current = setInterval(fetchDocs, 3000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [docs, fetchDocs]);

  return { docs, loading, error, refetch: fetchDocs };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/use-knowledge-docs.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useKnowledgeDocs.ts tests/unit/use-knowledge-docs.test.ts
git commit -m "feat: add useKnowledgeDocs hook with auto-polling for processing docs"
```

---

## Task 3: `ProcessingStatus` Component

**Files:**
- Create: `src/components/dashboard/knowledge/ProcessingStatus.tsx`
- Test: `tests/unit/processing-status.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/processing-status.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ProcessingStatus from "@/components/dashboard/knowledge/ProcessingStatus";

describe("ProcessingStatus", () => {
  it("shows processing state with spinner", () => {
    render(<ProcessingStatus status="processing" />);
    expect(screen.getByText("Processing")).toBeInTheDocument();
  });

  it("shows ready state", () => {
    render(<ProcessingStatus status="ready" />);
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("shows error state with message", () => {
    render(<ProcessingStatus status="error" errorMessage="Parse failed" />);
    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.getByText("Parse failed")).toBeInTheDocument();
  });

  it("shows error state without message", () => {
    render(<ProcessingStatus status="error" />);
    expect(screen.getByText("Error")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/processing-status.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create the component**

Create `src/components/dashboard/knowledge/ProcessingStatus.tsx`:

```tsx
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import Badge from "@/components/ui/Badge";

interface ProcessingStatusProps {
  status: "processing" | "ready" | "error";
  errorMessage?: string;
}

export default function ProcessingStatus({ status, errorMessage }: ProcessingStatusProps) {
  if (status === "processing") {
    return (
      <div className="flex items-center gap-1.5">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--ws-warning)]" />
        <Badge variant="warning">Processing</Badge>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex items-center gap-1.5">
        <AlertCircle className="h-3.5 w-3.5 text-[var(--ws-danger)]" />
        <Badge variant="danger">Error</Badge>
        {errorMessage && (
          <span className="text-xs text-[var(--ws-text-muted)]">{errorMessage}</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <CheckCircle2 className="h-3.5 w-3.5 text-[var(--ws-success)]" />
      <Badge variant="success">Ready</Badge>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/processing-status.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/knowledge/ProcessingStatus.tsx tests/unit/processing-status.test.tsx
git commit -m "feat: add ProcessingStatus component with processing/ready/error states"
```

---

## Task 4: `DocumentUpload` Component

**Files:**
- Create: `src/components/dashboard/knowledge/DocumentUpload.tsx`
- Test: `tests/unit/document-upload.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/document-upload.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DocumentUpload from "@/components/dashboard/knowledge/DocumentUpload";

const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockDocs = [
  { id: "1", title: "Test PDF", type: "pdf", status: "ready", metadata: {}, created_at: "2026-01-01T00:00:00Z" },
  { id: "2", title: "Processing Doc", type: "docx", status: "processing", metadata: {}, created_at: "2026-01-02T00:00:00Z" },
];

describe("DocumentUpload", () => {
  const mockRefetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders document list", () => {
    render(<DocumentUpload docs={mockDocs} onUploadComplete={mockRefetch} />);
    expect(screen.getByText("Test PDF")).toBeInTheDocument();
    expect(screen.getByText("Processing Doc")).toBeInTheDocument();
  });

  it("shows empty state when no docs", () => {
    render(<DocumentUpload docs={[]} onUploadComplete={mockRefetch} />);
    expect(screen.getByText("No documents uploaded")).toBeInTheDocument();
  });

  it("shows drop zone", () => {
    render(<DocumentUpload docs={[]} onUploadComplete={mockRefetch} />);
    expect(screen.getByText(/drag.*drop/i)).toBeInTheDocument();
  });

  it("uploads file on drop", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ docId: "new-1", status: "processing" }),
    });

    render(<DocumentUpload docs={[]} onUploadComplete={mockRefetch} />);

    const dropZone = screen.getByTestId("drop-zone");
    const file = new File(["content"], "test.pdf", { type: "application/pdf" });

    fireEvent.drop(dropZone, {
      dataTransfer: { files: [file] },
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/knowledge/upload",
        expect.objectContaining({ method: "POST" })
      );
    });

    await waitFor(() => {
      expect(mockRefetch).toHaveBeenCalled();
    });
  });

  it("rejects unsupported file types", async () => {
    render(<DocumentUpload docs={[]} onUploadComplete={mockRefetch} />);

    const dropZone = screen.getByTestId("drop-zone");
    const file = new File(["content"], "test.txt", { type: "text/plain" });

    fireEvent.drop(dropZone, {
      dataTransfer: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getByText(/unsupported file type/i)).toBeInTheDocument();
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("shows file type badges", () => {
    render(<DocumentUpload docs={mockDocs} onUploadComplete={mockRefetch} />);
    expect(screen.getByText("PDF")).toBeInTheDocument();
    expect(screen.getByText("DOCX")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/document-upload.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create the component**

Create `src/components/dashboard/knowledge/DocumentUpload.tsx`:

```tsx
"use client";

import { useState, useCallback } from "react";
import { Upload, FileText, Trash2 } from "lucide-react";
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
        <label>
          <Button variant="secondary" disabled={uploading} asChild>
            <span>{uploading ? "Uploading..." : "Browse Files"}</span>
          </Button>
          <input
            type="file"
            className="hidden"
            accept=".pdf,.docx,.xlsx"
            onChange={handleFileInput}
            disabled={uploading}
          />
        </label>
      </div>

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/document-upload.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/knowledge/DocumentUpload.tsx tests/unit/document-upload.test.tsx
git commit -m "feat: add DocumentUpload component with drag-and-drop and document list"
```

---

## Task 5: `FaqEditor` Component

**Files:**
- Create: `src/components/dashboard/knowledge/FaqEditor.tsx`
- Test: `tests/unit/faq-editor.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/faq-editor.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FaqEditor from "@/components/dashboard/knowledge/FaqEditor";

const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockFaqDocs = [
  {
    id: "faq-1",
    title: "What are your hours?",
    type: "faq" as const,
    status: "ready" as const,
    metadata: {},
    created_at: "2026-01-01",
  },
];

describe("FaqEditor", () => {
  const mockRefetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders FAQ list from docs", () => {
    render(<FaqEditor docs={mockFaqDocs} onFaqAdded={mockRefetch} />);
    expect(screen.getByText("What are your hours?")).toBeInTheDocument();
  });

  it("shows empty state when no FAQs", () => {
    render(<FaqEditor docs={[]} onFaqAdded={mockRefetch} />);
    expect(screen.getByText("No FAQs added")).toBeInTheDocument();
  });

  it("shows add FAQ form when button clicked", async () => {
    const user = userEvent.setup();
    render(<FaqEditor docs={[]} onFaqAdded={mockRefetch} />);

    await user.click(screen.getByText("Add FAQ"));

    expect(screen.getByPlaceholderText(/question/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/answer/i)).toBeInTheDocument();
  });

  it("submits FAQ via API", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ docId: "new-faq" }),
    });

    const user = userEvent.setup();
    render(<FaqEditor docs={[]} onFaqAdded={mockRefetch} />);

    await user.click(screen.getByText("Add FAQ"));
    await user.type(screen.getByPlaceholderText(/question/i), "How much?");
    await user.type(screen.getByPlaceholderText(/answer/i), "Starting at $99");
    await user.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/knowledge/faq",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ question: "How much?", answer: "Starting at $99" }),
        })
      );
    });

    await waitFor(() => {
      expect(mockRefetch).toHaveBeenCalled();
    });
  });

  it("validates empty fields", async () => {
    const user = userEvent.setup();
    render(<FaqEditor docs={[]} onFaqAdded={mockRefetch} />);

    await user.click(screen.getByText("Add FAQ"));
    await user.click(screen.getByText("Save"));

    expect(screen.getByText(/question is required/i)).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/faq-editor.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create the component**

Create `src/components/dashboard/knowledge/FaqEditor.tsx`:

```tsx
"use client";

import { useState } from "react";
import { HelpCircle, Plus } from "lucide-react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/faq-editor.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/knowledge/FaqEditor.tsx tests/unit/faq-editor.test.tsx
git commit -m "feat: add FaqEditor component with Q+A form and FAQ list"
```

---

## Task 6: `RichTextEditor` Component (Tiptap)

**Files:**
- Create: `src/components/dashboard/knowledge/RichTextEditor.tsx`
- Test: `tests/unit/rich-text-editor.test.tsx`

- [ ] **Step 1: Install Tiptap dependencies**

```bash
npm install @tiptap/react @tiptap/starter-kit @tiptap/pm
```

- [ ] **Step 2: Write the failing test**

Create `tests/unit/rich-text-editor.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RichTextEditor from "@/components/dashboard/knowledge/RichTextEditor";

const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockRichtextDocs = [
  {
    id: "rt-1",
    title: "About Us",
    type: "richtext" as const,
    status: "ready" as const,
    metadata: {},
    created_at: "2026-01-01",
  },
];

describe("RichTextEditor", () => {
  const mockRefetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders existing rich text documents list", () => {
    render(<RichTextEditor docs={mockRichtextDocs} onSaveComplete={mockRefetch} />);
    expect(screen.getByText("About Us")).toBeInTheDocument();
  });

  it("shows empty state when no documents", () => {
    render(<RichTextEditor docs={[]} onSaveComplete={mockRefetch} />);
    expect(screen.getByText("No documents created")).toBeInTheDocument();
  });

  it("shows editor form when New Document clicked", async () => {
    const user = userEvent.setup();
    render(<RichTextEditor docs={[]} onSaveComplete={mockRefetch} />);

    await user.click(screen.getByText("New Document"));

    expect(screen.getByPlaceholderText(/document title/i)).toBeInTheDocument();
    expect(screen.getByTestId("tiptap-editor")).toBeInTheDocument();
  });

  it("validates empty title", async () => {
    const user = userEvent.setup();
    render(<RichTextEditor docs={[]} onSaveComplete={mockRefetch} />);

    await user.click(screen.getByText("New Document"));
    await user.click(screen.getByText("Save Document"));

    expect(screen.getByText(/title is required/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/unit/rich-text-editor.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 4: Create a new API route for rich text documents**

Create `src/app/api/knowledge/richtext/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";
import { ingestDocument } from "@/lib/ai/ingest";

const schema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = user.app_metadata?.tenant_id as string | undefined;
  if (!tenantId) {
    return NextResponse.json({ error: "No tenant associated" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const { data: doc, error: insertError } = await service
    .from("knowledge_docs")
    .insert({
      tenant_id: tenantId,
      title: parsed.data.title,
      type: "richtext",
      content: parsed.data.content,
      status: "processing",
      metadata: {},
    })
    .select("id")
    .single();

  if (insertError || !doc) {
    return NextResponse.json({ error: "Failed to create document" }, { status: 500 });
  }

  // Strip HTML for plain text, then ingest
  const plainText = parsed.data.content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const buffer = Buffer.from(plainText, "utf-8");

  const processPromise = Promise.resolve(
    ingestDocument({
      docId: doc.id,
      tenantId,
      type: "richtext",
      kbType: "general",
      buffer,
    })
  );

  // @ts-expect-error waitUntil exists on Vercel runtime
  if (typeof globalThis.waitUntil === "function") {
    // @ts-expect-error waitUntil is a Vercel runtime API
    globalThis.waitUntil(processPromise);
  } else {
    processPromise.catch((err) => console.error("Richtext processing failed:", err));
  }

  return NextResponse.json({ docId: doc.id, status: "processing" }, { status: 201 });
}
```

- [ ] **Step 5: Create the component**

Create `src/components/dashboard/knowledge/RichTextEditor.tsx`:

```tsx
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
    extensions: [StarterKit],
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none p-4 min-h-[200px] outline-none focus:outline-none",
        "data-testid": "tiptap-editor",
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
              className={`rounded p-1.5 ${
                editor?.isActive("bold")
                  ? "bg-[var(--ws-border-subtle)] text-[var(--ws-text-primary)]"
                  : "text-[var(--ws-text-muted)] hover:bg-[var(--ws-border-subtle)]"
              }`}
            >
              <Bold className="h-4 w-4" />
            </button>
            <button
              onClick={() => editor?.chain().focus().toggleItalic().run()}
              className={`rounded p-1.5 ${
                editor?.isActive("italic")
                  ? "bg-[var(--ws-border-subtle)] text-[var(--ws-text-primary)]"
                  : "text-[var(--ws-text-muted)] hover:bg-[var(--ws-border-subtle)]"
              }`}
            >
              <Italic className="h-4 w-4" />
            </button>
            <button
              onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
              className={`rounded p-1.5 ${
                editor?.isActive("heading", { level: 2 })
                  ? "bg-[var(--ws-border-subtle)] text-[var(--ws-text-primary)]"
                  : "text-[var(--ws-text-muted)] hover:bg-[var(--ws-border-subtle)]"
              }`}
            >
              <Heading2 className="h-4 w-4" />
            </button>
            <button
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
              className={`rounded p-1.5 ${
                editor?.isActive("bulletList")
                  ? "bg-[var(--ws-border-subtle)] text-[var(--ws-text-primary)]"
                  : "text-[var(--ws-text-muted)] hover:bg-[var(--ws-border-subtle)]"
              }`}
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
              className={`rounded p-1.5 ${
                editor?.isActive("orderedList")
                  ? "bg-[var(--ws-border-subtle)] text-[var(--ws-text-primary)]"
                  : "text-[var(--ws-text-muted)] hover:bg-[var(--ws-border-subtle)]"
              }`}
            >
              <ListOrdered className="h-4 w-4" />
            </button>
          </div>

          {/* Editor area */}
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
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- tests/unit/rich-text-editor.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/knowledge/RichTextEditor.tsx src/app/api/knowledge/richtext/route.ts tests/unit/rich-text-editor.test.tsx
git commit -m "feat: add RichTextEditor component with Tiptap and richtext API endpoint"
```

---

## Task 7: `ProductKnowledge` Component

**Files:**
- Create: `src/components/dashboard/knowledge/ProductKnowledge.tsx`
- Test: `tests/unit/product-knowledge.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/product-knowledge.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ProductKnowledge from "@/components/dashboard/knowledge/ProductKnowledge";

describe("ProductKnowledge", () => {
  const mockProductDocs = [
    {
      id: "prod-1",
      title: "Blue Widget",
      type: "product" as const,
      status: "ready" as const,
      metadata: {},
      created_at: "2026-01-01",
    },
  ];

  it("renders product knowledge list", () => {
    render(<ProductKnowledge docs={mockProductDocs} />);
    expect(screen.getByText("Blue Widget")).toBeInTheDocument();
  });

  it("shows empty state when no product docs", () => {
    render(<ProductKnowledge docs={[]} />);
    expect(screen.getByText("No product knowledge")).toBeInTheDocument();
  });

  it("shows explanation about auto-sync", () => {
    render(<ProductKnowledge docs={[]} />);
    expect(screen.getByText(/automatically synced/i)).toBeInTheDocument();
  });

  it("filters to only product type docs", () => {
    const mixedDocs = [
      ...mockProductDocs,
      { id: "faq-1", title: "Some FAQ", type: "faq" as const, status: "ready" as const, metadata: {}, created_at: "2026-01-01" },
    ];
    render(<ProductKnowledge docs={mixedDocs} />);
    expect(screen.getByText("Blue Widget")).toBeInTheDocument();
    expect(screen.queryByText("Some FAQ")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/product-knowledge.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create the component**

Create `src/components/dashboard/knowledge/ProductKnowledge.tsx`:

```tsx
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
          Product knowledge is automatically synced from your product catalog. When you add or update products, the bot's knowledge updates too.
        </p>
      </div>

      {productDocs.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No product knowledge"
          description="Add products to your catalog and they'll appear here automatically. The bot will use product details to answer customer questions."
          actionLabel="Go to Products"
          actionHref="/app/actions"
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/product-knowledge.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/knowledge/ProductKnowledge.tsx tests/unit/product-knowledge.test.tsx
git commit -m "feat: add ProductKnowledge component showing auto-synced product docs"
```

---

## Task 8: `KnowledgePanel` Container + Wire into BotClient

**Files:**
- Create: `src/components/dashboard/knowledge/KnowledgePanel.tsx`
- Modify: `src/app/(tenant)/app/bot/BotClient.tsx`
- Test: `tests/unit/knowledge-panel.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/knowledge-panel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import KnowledgePanel from "@/components/dashboard/knowledge/KnowledgePanel";

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("KnowledgePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ docs: [] }),
    });
  });

  it("renders four sub-tabs", async () => {
    render(<KnowledgePanel />);

    await waitFor(() => {
      expect(screen.getByText("Documents")).toBeInTheDocument();
      expect(screen.getByText("FAQ")).toBeInTheDocument();
      expect(screen.getByText("Editor")).toBeInTheDocument();
      expect(screen.getByText("Products")).toBeInTheDocument();
    });
  });

  it("defaults to Documents tab", async () => {
    render(<KnowledgePanel />);

    await waitFor(() => {
      expect(screen.getByText("No documents uploaded")).toBeInTheDocument();
    });
  });

  it("switches to FAQ tab", async () => {
    const user = userEvent.setup();
    render(<KnowledgePanel />);

    await waitFor(() => {
      expect(screen.getByText("FAQ")).toBeInTheDocument();
    });

    await user.click(screen.getByText("FAQ"));

    await waitFor(() => {
      expect(screen.getByText("No FAQs added")).toBeInTheDocument();
    });
  });

  it("switches to Editor tab", async () => {
    const user = userEvent.setup();
    render(<KnowledgePanel />);

    await waitFor(() => {
      expect(screen.getByText("Editor")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Editor"));

    await waitFor(() => {
      expect(screen.getByText("No documents created")).toBeInTheDocument();
    });
  });

  it("switches to Products tab", async () => {
    const user = userEvent.setup();
    render(<KnowledgePanel />);

    await waitFor(() => {
      expect(screen.getByText("Products")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Products"));

    await waitFor(() => {
      expect(screen.getByText("No product knowledge")).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/knowledge-panel.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create the KnowledgePanel component**

Create `src/components/dashboard/knowledge/KnowledgePanel.tsx`:

```tsx
"use client";

import { useState } from "react";
import { clsx } from "clsx";
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
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-white text-[var(--ws-text-primary)] shadow-sm"
                  : "text-[var(--ws-text-tertiary)] hover:text-[var(--ws-text-primary)]"
              )}
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
```

- [ ] **Step 4: Wire KnowledgePanel into BotClient**

In `src/app/(tenant)/app/bot/BotClient.tsx`:

1. Add import at the top:

```typescript
import KnowledgePanel from "@/components/dashboard/knowledge/KnowledgePanel";
```

2. Replace the existing `KnowledgeTab` function (lines 39-58) with:

```typescript
function KnowledgeTab() {
  return <KnowledgePanel />;
}
```

3. Remove the now-unused imports: `Upload` from lucide-react, and `EmptyState` (if only used in KnowledgeTab — check that ReviewTab still uses it; it does via its own import so keep `EmptyState` if ReviewTab references it).

Actually, `EmptyState` is still used in `ReviewTab` and `RulesTab`, and `Upload` is only used in the old `KnowledgeTab`, so remove only `Upload` from the lucide import.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/unit/knowledge-panel.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/knowledge/KnowledgePanel.tsx src/app/(tenant)/app/bot/BotClient.tsx tests/unit/knowledge-panel.test.tsx
git commit -m "feat: add KnowledgePanel container with sub-tabs and wire into BotClient"
```

---

## Task 9: E2E Tests

**Files:**
- Create: `tests/e2e/knowledge-dashboard.spec.ts`

- [ ] **Step 1: Create the E2E test file**

Create `tests/e2e/knowledge-dashboard.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

// These tests require a running dev server and an authenticated tenant user session.
// Use Playwright's storageState or a login helper to set up auth before running.

test.describe("Knowledge Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to bot page (knowledge tab is default)
    await page.goto("/app/bot");
    await page.waitForSelector("text=Knowledge Base");
  });

  test("shows knowledge sub-tabs", async ({ page }) => {
    await expect(page.getByText("Documents")).toBeVisible();
    await expect(page.getByText("FAQ")).toBeVisible();
    await expect(page.getByText("Editor")).toBeVisible();
    await expect(page.getByText("Products")).toBeVisible();
  });

  test("Documents tab shows empty state initially", async ({ page }) => {
    await expect(page.getByText("No documents uploaded")).toBeVisible();
  });

  test("Documents tab shows drag and drop zone", async ({ page }) => {
    await expect(page.getByText(/drag.*drop/i)).toBeVisible();
  });

  test("FAQ tab shows empty state and add form", async ({ page }) => {
    await page.click("text=FAQ");
    await expect(page.getByText("No FAQs added")).toBeVisible();

    await page.click("text=Add FAQ");
    await expect(page.getByPlaceholder(/question/i)).toBeVisible();
    await expect(page.getByPlaceholder(/answer/i)).toBeVisible();
  });

  test("FAQ tab validates empty fields", async ({ page }) => {
    await page.click("text=FAQ");
    await page.click("text=Add FAQ");
    await page.click("text=Save");

    await expect(page.getByText(/question is required/i)).toBeVisible();
  });

  test("Editor tab shows empty state and editor form", async ({ page }) => {
    await page.click("text=Editor");
    await expect(page.getByText("No documents created")).toBeVisible();

    await page.click("text=New Document");
    await expect(page.getByPlaceholder(/document title/i)).toBeVisible();
  });

  test("Products tab shows auto-sync explanation", async ({ page }) => {
    await page.click("text=Products");
    await expect(page.getByText(/automatically synced/i)).toBeVisible();
  });

  test("upload PDF and see it appear in list", async ({ page }) => {
    // Create a fake PDF file for upload
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.click("text=Browse Files");
    const fileChooser = await fileChooserPromise;

    // This test needs a real file — use a test fixture
    // For CI, create a minimal PDF buffer or use a fixture file
    await fileChooser.setFiles({
      name: "test-doc.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 test content"),
    });

    // Should show the doc in list after upload
    await expect(page.getByText("test-doc")).toBeVisible({ timeout: 10000 });
  });

  test("add FAQ and see it appear in list", async ({ page }) => {
    await page.click("text=FAQ");
    await page.click("text=Add FAQ");

    await page.fill('[placeholder*="question"]', "What are your hours?");
    await page.fill('[placeholder*="answer"]', "We are open 9-5 Monday to Friday.");
    await page.click("text=Save");

    await expect(page.getByText("What are your hours?")).toBeVisible({ timeout: 5000 });
  });
});
```

- [ ] **Step 2: Run E2E tests (requires dev server)**

Run: `npx playwright test tests/e2e/knowledge-dashboard.spec.ts`
Expected: Tests run against local dev server. Some may need auth setup adjustments.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/knowledge-dashboard.spec.ts
git commit -m "test: add E2E tests for knowledge dashboard"
```

---

## Self-Review Checklist

**1. Spec coverage:**
- [x] Document upload UI (drag & drop, progress) — Task 4 (DocumentUpload)
- [x] FAQ editor UI — Task 5 (FaqEditor)
- [x] Rich text editor (Tiptap) — Task 6 (RichTextEditor)
- [x] Product knowledge entry form — Task 7 (ProductKnowledge) — Note: products auto-sync from catalog, no separate entry form needed per spec
- [x] Processing status indicators — Task 3 (ProcessingStatus)
- [x] Knowledge base page with tabs — Task 8 (KnowledgePanel with sub-tabs inside existing Bot page)
- [x] Component tests — Tasks 1-8
- [x] E2E tests — Task 9
- [x] List API endpoint — Task 1 (GET /api/knowledge/docs)
- [x] Richtext API endpoint — Task 6 (POST /api/knowledge/richtext)
- [x] Auto-polling for processing status — Task 2 (useKnowledgeDocs hook)

**2. Placeholder scan:** No TBDs, TODOs, or "fill in later" found.

**3. Type consistency:** `KnowledgeDoc` type defined in `useKnowledgeDocs.ts` and used consistently across all components. `ProcessingStatus` takes `status` prop matching the DB enum. API routes follow the same auth pattern as existing Phase 2 endpoints.
