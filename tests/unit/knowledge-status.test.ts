import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveSession } from "@/lib/auth/session";

vi.mock("@/lib/auth/session", () => ({
  resolveSession: vi.fn(),
}));

const mockResolveSession = vi.mocked(resolveSession);

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
    mockResolveSession.mockResolvedValueOnce(null);

    const request = new Request("http://localhost/api/knowledge/status?docId=123");
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it("returns 400 if docId is missing", async () => {
    mockResolveSession.mockResolvedValueOnce({ userId: "u-1", tenantId: "t-1" });

    const request = new Request("http://localhost/api/knowledge/status");
    const response = await GET(request);
    expect(response.status).toBe(400);
  });

  it("returns document status", async () => {
    mockResolveSession.mockResolvedValueOnce({ userId: "u-1", tenantId: "t-1" });
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
    mockResolveSession.mockResolvedValueOnce({ userId: "u-1", tenantId: "t-1" });
    mockSingle.mockResolvedValueOnce({ data: null, error: null });

    const request = new Request("http://localhost/api/knowledge/status?docId=nonexistent");
    const response = await GET(request);
    expect(response.status).toBe(404);
  });
});
