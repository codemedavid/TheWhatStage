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
  it("calls the match_knowledge_chunks RPC with correct params", async () => {
    const fakeResults = [
      { id: "chunk-1", content: "Answer about pricing", similarity: 0.92, metadata: {} },
      { id: "chunk-2", content: "Another answer", similarity: 0.85, metadata: {} },
    ];
    mockRpc.mockReturnValue({
      data: fakeResults,
      error: null,
    });

    const queryEmbedding = Array.from({ length: 1536 }, () => 0.5);
    const result = await searchKnowledge({
      queryEmbedding,
      tenantId: "tenant-abc",
      kbType: "general",
      topK: 5,
      similarityThreshold: 0.3,
    });

    expect(result).toEqual(fakeResults);
    expect(mockRpc).toHaveBeenCalledWith("match_knowledge_chunks", {
      query_embedding: queryEmbedding,
      p_tenant_id: "tenant-abc",
      p_kb_type: "general",
      p_top_k: 5,
      p_similarity_threshold: 0.3,
    });
  });

  it("uses default topK=5 and threshold=0.3", async () => {
    mockRpc.mockReturnValue({ data: [], error: null });

    const queryEmbedding = Array.from({ length: 1536 }, () => 0.1);
    await searchKnowledge({
      queryEmbedding,
      tenantId: "tenant-abc",
      kbType: "product",
    });

    expect(mockRpc).toHaveBeenCalledWith("match_knowledge_chunks", {
      query_embedding: queryEmbedding,
      p_tenant_id: "tenant-abc",
      p_kb_type: "product",
      p_top_k: 5,
      p_similarity_threshold: 0.3,
    });
  });

  it("throws on Supabase RPC error", async () => {
    mockRpc.mockReturnValue({
      data: null,
      error: { message: "function not found" },
    });

    const queryEmbedding = Array.from({ length: 1536 }, () => 0.1);

    await expect(
      searchKnowledge({
        queryEmbedding,
        tenantId: "tenant-abc",
        kbType: "general",
      })
    ).rejects.toThrow("Vector search failed: function not found");
  });

  it("returns empty array when no results match threshold", async () => {
    mockRpc.mockReturnValue({ data: [], error: null });

    const queryEmbedding = Array.from({ length: 1536 }, () => 0.1);
    const result = await searchKnowledge({
      queryEmbedding,
      tenantId: "tenant-abc",
      kbType: "general",
    });

    expect(result).toEqual([]);
  });
});
