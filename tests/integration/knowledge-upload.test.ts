import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}));

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

describe("POST /api/knowledge/upload", () => {
  it("returns 401 if user is not authenticated", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });

    const formData = new FormData();
    formData.append("title", "Test Doc");
    formData.append("type", "pdf");
    formData.append("file", new Blob(["fake"]), "test.pdf");

    const request = new Request("http://localhost/api/knowledge/upload", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("returns 400 for missing required fields", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "user-1", app_metadata: { tenant_id: "t-1" } } },
      error: null,
    });

    const formData = new FormData();
    formData.append("file", new Blob(["fake"]), "test.pdf");

    const request = new Request("http://localhost/api/knowledge/upload", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("returns 201 with docId and kicks off async processing", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "user-1", app_metadata: { tenant_id: "t-1" } } },
      error: null,
    });

    mockInsert.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: "doc-123" },
          error: null,
        }),
      }),
    });

    const formData = new FormData();
    formData.append("title", "Test PDF");
    formData.append("type", "pdf");
    formData.append("file", new Blob(["fake-pdf-content"]), "test.pdf");

    const request = new Request("http://localhost/api/knowledge/upload", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.docId).toBe("doc-123");
    expect(body.status).toBe("processing");
  });

  it("returns 400 for unsupported file type", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "user-1", app_metadata: { tenant_id: "t-1" } } },
      error: null,
    });

    const formData = new FormData();
    formData.append("title", "Test");
    formData.append("type", "txt");
    formData.append("file", new Blob(["data"]), "test.txt");

    const request = new Request("http://localhost/api/knowledge/upload", {
      method: "POST",
      body: formData,
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
