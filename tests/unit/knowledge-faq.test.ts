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
    from: vi.fn((table: string) => {
      if (table === "knowledge_docs") {
        return { insert: mockInsert };
      }
      if (table === "knowledge_chunks") {
        return { insert: mockInsert };
      }
      return {};
    }),
  })),
}));

vi.mock("@/lib/ai/embedding", () => ({
  embedText: vi.fn().mockResolvedValue(Array(1536).fill(0.1)),
}));

beforeEach(() => vi.clearAllMocks());

import { POST } from "@/app/api/knowledge/faq/route";

describe("POST /api/knowledge/faq", () => {
  const authedUser = {
    data: { user: { id: "u-1", app_metadata: { tenant_id: "t-1" } } },
    error: null,
  };

  it("returns 401 if not authenticated", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });

    const request = new Request("http://localhost/api/knowledge/faq", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "Q?", answer: "A." }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("returns 400 if question or answer is missing", async () => {
    mockGetUser.mockResolvedValueOnce(authedUser);

    const request = new Request("http://localhost/api/knowledge/faq", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "Q?" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("creates a FAQ doc + chunk and returns 201", async () => {
    mockGetUser.mockResolvedValueOnce(authedUser);

    // knowledge_docs insert
    mockInsert.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: "faq-doc-1" },
          error: null,
        }),
      }),
    });
    // knowledge_chunks insert
    mockInsert.mockReturnValueOnce({ error: null });

    const request = new Request("http://localhost/api/knowledge/faq", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "What time?", answer: "9 to 5." }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.docId).toBe("faq-doc-1");
  });
});
