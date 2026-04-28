import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchKnowledge } from "@/lib/ai/vector-search";

const mockRpc = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    rpc: mockRpc,
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("searchKnowledge", () => {
  it("calls match_knowledge_chunks_hybrid with correct params", async () => {
    const fakeResults = [
      { id: "chunk-1", content: "Answer about pricing", similarity: 0.92, metadata: {} },
      { id: "chunk-2", content: "Another answer", similarity: 0.85, metadata: {} },
    ];
    mockRpc.mockReturnValue({ data: fakeResults, error: null });

    const queryEmbedding = Array.from({ length: 1024 }, () => 0.5);
    const result = await searchKnowledge({
      queryEmbedding,
      ftsQuery: "pricing answer",
      tenantId: "tenant-abc",
      kbType: "general",
      topK: 5,
      language: "tl",
    });

    expect(result).toEqual(fakeResults);
    expect(mockRpc).toHaveBeenCalledWith("match_knowledge_chunks_hybrid", {
      query_embedding: queryEmbedding,
      fts_query: "pricing answer",
      p_tenant_id: "tenant-abc",
      p_kb_type: "general",
      p_top_k: 5,
      p_language: "tl",
    });
  });

  it("uses default topK=20 and language=null", async () => {
    mockRpc.mockReturnValue({ data: [], error: null });

    await searchKnowledge({
      queryEmbedding: Array.from({ length: 1024 }, () => 0.1),
      ftsQuery: "test query",
      tenantId: "tenant-abc",
      kbType: "product",
    });

    expect(mockRpc).toHaveBeenCalledWith("match_knowledge_chunks_hybrid", {
      query_embedding: expect.any(Array),
      fts_query: "test query",
      p_tenant_id: "tenant-abc",
      p_kb_type: "product",
      p_top_k: 20,
      p_language: null,
    });
  });

  it("filters out chunks with similarity below 0.45", async () => {
    mockRpc.mockReturnValue({
      data: [
        { id: "c1", content: "Good", similarity: 0.9, metadata: {} },
        { id: "c2", content: "Weak", similarity: 0.3, metadata: {} },
        { id: "c3", content: "Border", similarity: 0.45, metadata: {} },
      ],
      error: null,
    });

    const result = await searchKnowledge({
      queryEmbedding: Array.from({ length: 1024 }, () => 0.1),
      ftsQuery: "query",
      tenantId: "t1",
      kbType: "general",
    });

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual(["c1", "c3"]);
  });

  it("throws on Supabase RPC error", async () => {
    mockRpc.mockReturnValue({ data: null, error: { message: "function not found" } });

    await expect(
      searchKnowledge({
        queryEmbedding: Array.from({ length: 1024 }, () => 0.1),
        ftsQuery: "query",
        tenantId: "t1",
        kbType: "general",
      })
    ).rejects.toThrow("Vector search failed: function not found");
  });
});
