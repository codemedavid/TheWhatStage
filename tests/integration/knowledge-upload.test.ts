import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveSession } from "@/lib/auth/session";

vi.mock("@/lib/auth/session", () => ({
  resolveSession: vi.fn(),
}));

const mockResolveSession = vi.mocked(resolveSession);

const mockInsert = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: mockInsert,
    })),
  })),
}));

vi.mock("@/lib/ai/ingest", () => ({
  ingestDocument: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

import { POST } from "@/app/api/knowledge/upload/route";

/**
 * Build a Request whose formData() is synchronously mocked.
 * This avoids jsdom multipart parsing issues with Blob bodies.
 */
function makeRequest(fields: Record<string, string | File | null>) {
  const req = new Request("http://localhost/api/knowledge/upload", {
    method: "POST",
  });
  const mockFd = {
    get: (key: string) => fields[key] ?? null,
  };
  vi.spyOn(req, "formData").mockResolvedValue(mockFd as unknown as FormData);
  return req;
}

function makeFileField(content = "fake-content") {
  return {
    size: content.length,
    arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(content.length)),
    name: "test.pdf",
    type: "application/pdf",
  } as unknown as File;
}

describe("POST /api/knowledge/upload", () => {
  it("returns 401 if user is not authenticated", async () => {
    mockResolveSession.mockResolvedValueOnce(null);

    const response = await POST(makeRequest({ title: "Test Doc", type: "pdf", file: makeFileField() }));
    expect(response.status).toBe(401);
  });

  it("returns 400 for missing required fields", async () => {
    mockResolveSession.mockResolvedValueOnce({ userId: "user-1", tenantId: "t-1" });

    // Missing title
    const response = await POST(makeRequest({ type: "pdf", file: makeFileField() }));
    expect(response.status).toBe(400);
  });

  it("returns 201 with docId and kicks off async processing", async () => {
    mockResolveSession.mockResolvedValueOnce({ userId: "user-1", tenantId: "t-1" });

    mockInsert.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: "doc-123" },
          error: null,
        }),
      }),
    });

    const response = await POST(makeRequest({ title: "Test PDF", type: "pdf", file: makeFileField() }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.docId).toBe("doc-123");
    expect(body.status).toBe("processing");
  });

  it("returns 400 for unsupported file type", async () => {
    mockResolveSession.mockResolvedValueOnce({ userId: "user-1", tenantId: "t-1" });

    const response = await POST(makeRequest({ title: "Test", type: "txt", file: makeFileField() }));
    expect(response.status).toBe(400);
  });
});
