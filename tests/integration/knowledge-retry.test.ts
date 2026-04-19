/**
 * Feature: Knowledge Document Retry
 *
 * Testable units:
 * 1. POST /api/knowledge/retry/[id] — auth enforcement (401)
 * 2. POST /api/knowledge/retry/[id] — 400 when type is invalid (before DB)
 * 3. POST /api/knowledge/retry/[id] — 400 when file is missing (before DB)
 * 4. POST /api/knowledge/retry/[id] — 404 when doc not found or wrong tenant
 * 5. POST /api/knowledge/retry/[id] — 409 when doc is not in error state
 * 6. POST /api/knowledge/retry/[id] — deletes old chunks, resets status, returns 200
 *
 * Note: jsdom's Request.formData() hangs with Blob bodies (multipart parsing).
 * Tests that exercise formData use a spy to mock request.formData directly.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveSession } from "@/lib/auth/session";

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth/session", () => ({
  resolveSession: vi.fn(),
}));

const mockResolveSession = vi.mocked(resolveSession);

const mockDocSelect = vi.fn();
const mockChunkDelete = vi.fn();
const mockDocUpdate = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "knowledge_chunks") {
        return {
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => mockChunkDelete()),
            })),
          })),
        };
      }
      // knowledge_docs — used for both select and update
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => mockDocSelect()),
            })),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => mockDocUpdate()),
        })),
      };
    }),
  })),
}));

vi.mock("@/lib/ai/ingest", () => ({
  ingestDocument: vi.fn(),
}));

import { POST } from "@/app/api/knowledge/retry/[id]/route";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeCtx(docId = "doc-123") {
  return { params: Promise.resolve({ id: docId }) };
}

/**
 * Build a Request whose formData() is synchronously mocked.
 * This avoids jsdom multipart parsing issues with Blob bodies.
 */
function makeRequest(fields: Record<string, string | null>, docId = "doc-123") {
  const req = new Request(`http://localhost/api/knowledge/retry/${docId}`, {
    method: "POST",
  });

  const mockFd = {
    get: (key: string) => fields[key] ?? null,
  };

  vi.spyOn(req, "formData").mockResolvedValue(mockFd as unknown as FormData);

  return req;
}

/**
 * For the 200 case, we need a File so arrayBuffer() can be called.
 * Mock that too.
 */
function makeRequestWithFile(type: string, docId = "doc-123") {
  const mockFile = {
    size: 10,
    arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(10)),
  } as unknown as File;

  const req = new Request(`http://localhost/api/knowledge/retry/${docId}`, {
    method: "POST",
  });

  const mockFd = {
    get: (key: string) => {
      if (key === "type") return type;
      if (key === "file") return mockFile;
      return null;
    },
  };

  vi.spyOn(req, "formData").mockResolvedValue(mockFd as unknown as FormData);

  return req;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("POST /api/knowledge/retry/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockResolveSession.mockResolvedValueOnce(null);

    const res = await POST(makeRequest({ type: "pdf", file: "file" }), makeCtx());

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "Unauthorized" });
  });

  it("returns 400 when type is invalid (before DB access)", async () => {
    mockResolveSession.mockResolvedValueOnce({ userId: "u1", tenantId: "tenant-1" });

    const res = await POST(makeRequest({ type: "txt", file: "file" }), makeCtx());

    expect(res.status).toBe(400);
  });

  it("returns 400 when file is missing (before DB access)", async () => {
    mockResolveSession.mockResolvedValueOnce({ userId: "u1", tenantId: "tenant-1" });

    const res = await POST(makeRequest({ type: "pdf", file: null }), makeCtx());

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "File is required" });
  });

  it("returns 404 when document is not found", async () => {
    mockResolveSession.mockResolvedValueOnce({ userId: "u1", tenantId: "tenant-1" });
    mockDocSelect.mockResolvedValueOnce({
      data: null,
      error: { message: "Not found" },
    });

    const res = await POST(makeRequest({ type: "pdf", file: "file" }), makeCtx());

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "Document not found" });
  });

  it("returns 409 when document is not in error state", async () => {
    mockResolveSession.mockResolvedValueOnce({ userId: "u1", tenantId: "tenant-1" });
    mockDocSelect.mockResolvedValueOnce({
      data: { id: "doc-123", type: "pdf", status: "ready" },
      error: null,
    });

    const res = await POST(makeRequest({ type: "pdf", file: "file" }), makeCtx());

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: /error status/ });
  });

  it("returns 409 when document is still processing", async () => {
    mockResolveSession.mockResolvedValueOnce({ userId: "u1", tenantId: "tenant-1" });
    mockDocSelect.mockResolvedValueOnce({
      data: { id: "doc-123", type: "pdf", status: "processing" },
      error: null,
    });

    const res = await POST(makeRequest({ type: "pdf", file: "file" }), makeCtx());

    expect(res.status).toBe(409);
  });

  it("deletes old chunks, resets status to processing, returns 200", async () => {
    mockResolveSession.mockResolvedValueOnce({ userId: "u1", tenantId: "tenant-1" });
    mockDocSelect.mockResolvedValueOnce({
      data: { id: "doc-123", type: "pdf", status: "error" },
      error: null,
    });
    mockChunkDelete.mockResolvedValueOnce({ error: null });
    mockDocUpdate.mockResolvedValueOnce({ error: null });

    const res = await POST(makeRequestWithFile("pdf"), makeCtx());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ docId: "doc-123", status: "processing" });
  });
});
