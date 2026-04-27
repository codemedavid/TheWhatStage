import { describe, it, expect, vi, beforeEach } from "vitest";

const { embedBatchMock } = vi.hoisted(() => ({
  embedBatchMock: vi.fn(
    async (texts: string[]) => texts.map(() => new Array(1024).fill(0.1))
  ),
}));

vi.mock("@/lib/ai/embedding", () => ({
  embedText: vi.fn(async () => new Array(1024).fill(0.1)),
  embedBatch: embedBatchMock,
}));
vi.mock("@/lib/ai/chunking", () => ({
  chunkText: (s: string) => [s], // 1 chunk per section in tests
}));

vi.mock("@/lib/auth/session", () => ({
  resolveSession: vi.fn(async () => ({ tenantId: "tenant-1", userId: "u-1" })),
}));

const supabaseMock: any = { from: vi.fn() };
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => supabaseMock,
}));

import { GET } from "@/app/api/knowledge/richtext/list/route";
import { PUT } from "@/app/api/knowledge/richtext/bulk/route";
import { hashContent } from "@/lib/knowledge/section-diff";

beforeEach(() => {
  vi.clearAllMocks();
  embedBatchMock.mockClear();
});

describe("GET /api/knowledge/richtext/list", () => {
  it("returns sections ordered by display_order", async () => {
    supabaseMock.from.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              data: [
                { id: "1", title: "About", content: "hi", display_order: 0 },
                { id: "2", title: "Pricing", content: "$10", display_order: 1 },
              ],
              error: null,
            }),
          }),
        }),
      }),
    });

    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.sections).toEqual([
      { id: "1", title: "About", content: "hi", order: 0 },
      { id: "2", title: "Pricing", content: "$10", order: 1 },
    ]);
  });
});

describe("PUT /api/knowledge/richtext/bulk", () => {
  it("returns 400 on duplicate titles", async () => {
    const req = new Request("http://localhost/api/knowledge/richtext/bulk", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sections: [
          { title: "About", content: "a", order: 0 },
          { title: "about", content: "b", order: 1 },
        ],
      }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/duplicate/i);
  });

  it("creates new sections, updates changed, deletes removed, skips unchanged", async () => {
    const existing = [
      { id: "doc-a", title: "About", content_hash: hashContent("Hello"), display_order: 0 },
      { id: "doc-b", title: "Pricing", content_hash: hashContent("Old price"), display_order: 1 },
      { id: "doc-c", title: "Refunds", content_hash: hashContent("30 days"), display_order: 2 },
    ];

    let insertedDoc = { id: "doc-new" };
    const insertSpy = vi.fn().mockReturnValue({
      select: () => ({ single: async () => ({ data: insertedDoc, error: null }) }),
    });
    const updateSpy = vi.fn().mockReturnValue({
      eq: () => ({ eq: () => ({ error: null }) }),
    });
    const deleteSpy = vi.fn().mockReturnValue({
      in: () => ({ eq: () => ({ error: null }) }),
    });
    const chunkDeleteSpy = vi.fn().mockReturnValue({
      eq: () => ({ eq: () => ({ error: null }) }),
    });
    const chunkInsertSpy = vi.fn().mockReturnValue({ error: null });

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === "knowledge_docs") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                data: existing,
                error: null,
              }),
            }),
          }),
          insert: (...args: unknown[]) => insertSpy(...args),
          update: (...args: unknown[]) => updateSpy(...args),
          delete: (...args: unknown[]) => deleteSpy(...args),
        };
      }
      if (table === "knowledge_chunks") {
        return {
          insert: (...args: unknown[]) => chunkInsertSpy(...args),
          delete: (...args: unknown[]) => chunkDeleteSpy(...args),
        };
      }
      throw new Error("unexpected table " + table);
    });

    const req = new Request("http://localhost/api/knowledge/richtext/bulk", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sections: [
          { title: "About", content: "Hello", order: 0 },        // unchanged
          { title: "Pricing", content: "New price", order: 1 },  // updated
          { title: "Team", content: "We are 3", order: 2 },       // created
          // Refunds → deleted
        ],
      }),
    });

    const res = await PUT(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      created: 1,
      updated: 1,
      deleted: 1,
      unchanged: 1,
    });
    // Embedding called for created + updated only (1 chunk each = 2 texts total)
    expect(embedBatchMock).toHaveBeenCalledTimes(1);
    expect(embedBatchMock.mock.calls[0][0]).toHaveLength(2);
  });
});
