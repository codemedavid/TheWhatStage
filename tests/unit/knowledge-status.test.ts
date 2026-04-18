import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}));

const mockSingle = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: mockSingle,
          }),
        }),
      }),
    })),
  })),
}));

beforeEach(() => vi.clearAllMocks());

import { GET } from "@/app/api/knowledge/status/route";

describe("GET /api/knowledge/status", () => {
  it("returns 401 if not authenticated", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });

    const request = new Request("http://localhost/api/knowledge/status?docId=123");
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it("returns 400 if docId is missing", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "u-1", app_metadata: { tenant_id: "t-1" } } },
      error: null,
    });

    const request = new Request("http://localhost/api/knowledge/status");
    const response = await GET(request);
    expect(response.status).toBe(400);
  });

  it("returns document status", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "u-1", app_metadata: { tenant_id: "t-1" } } },
      error: null,
    });
    mockSingle.mockResolvedValueOnce({
      data: { id: "doc-1", status: "ready", metadata: { page_count: 5 } },
      error: null,
    });

    const request = new Request("http://localhost/api/knowledge/status?docId=doc-1");
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ready");
    expect(body.metadata.page_count).toBe(5);
  });

  it("returns 404 if document not found", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "u-1", app_metadata: { tenant_id: "t-1" } } },
      error: null,
    });
    mockSingle.mockResolvedValueOnce({ data: null, error: null });

    const request = new Request("http://localhost/api/knowledge/status?docId=nonexistent");
    const response = await GET(request);
    expect(response.status).toBe(404);
  });
});
