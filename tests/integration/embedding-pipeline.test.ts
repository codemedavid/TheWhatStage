import { describe, it, expect, vi, beforeEach } from "vitest";
import { embedText, embedBatch, EMBEDDING_DIM } from "@/lib/ai/embedding";
import { searchKnowledge } from "@/lib/ai/vector-search";

// Mock fetch for HuggingFace API
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock Supabase service client for vector search
const mockRpc = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    rpc: mockRpc,
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Embedding Pipeline Integration", () => {
  // API returns 4096-dim vectors, but client truncates to EMBEDDING_DIM (1536)
  const API_DIMENSION = 4096;
  const tenantId = "tenant-integration-test";

  it("embeds a text, then retrieves it via vector search", async () => {
    // Step 1: Embed a document chunk
    const fakeEmbedding = Array.from({ length: API_DIMENSION }, (_, i) => Math.sin(i) * 0.01);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [fakeEmbedding],
    });

    const embedding = await embedText("Our office is located at 123 Main St, Springfield");
    expect(embedding).toHaveLength(EMBEDDING_DIM);

    // Step 2: Embed a query
    const fakeQueryEmbedding = Array.from({ length: API_DIMENSION }, (_, i) => Math.sin(i) * 0.01 + 0.001);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [fakeQueryEmbedding],
    });

    const queryEmbedding = await embedText("Where is your office?");
    expect(queryEmbedding).toHaveLength(EMBEDDING_DIM);

    // Step 3: Search for matching chunks
    mockRpc.mockReturnValue({
      data: [
        {
          id: "chunk-1",
          content: "Our office is located at 123 Main St, Springfield",
          similarity: 0.95,
          metadata: {},
        },
      ],
      error: null,
    });

    const results = await searchKnowledge({
      queryEmbedding,
      tenantId,
      kbType: "general",
      topK: 5,
      similarityThreshold: 0.3,
    });

    expect(results).toHaveLength(1);
    expect(results[0].content).toContain("123 Main St");
    expect(results[0].similarity).toBeGreaterThan(0.3);
  });

  it("embeds a batch of documents and searches across them", async () => {
    // Step 1: Batch embed 3 chunks
    const fakeEmbeddings = [
      Array.from({ length: API_DIMENSION }, () => 0.1),
      Array.from({ length: API_DIMENSION }, () => 0.2),
      Array.from({ length: API_DIMENSION }, () => 0.3),
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => fakeEmbeddings,
    });

    const chunks = [
      "We offer web development services",
      "Our pricing starts at $500/month",
      "Contact us at hello@example.com",
    ];
    const embeddings = await embedBatch(chunks);

    expect(embeddings).toHaveLength(3);
    expect(mockFetch).toHaveBeenCalledTimes(1); // All fit in one batch

    // Step 2: Query for pricing
    const fakeQueryEmbedding = Array.from({ length: API_DIMENSION }, () => 0.2);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [fakeQueryEmbedding],
    });

    const queryEmbedding = await embedText("How much does it cost?");

    // Step 3: Search returns the pricing chunk as top result
    mockRpc.mockReturnValue({
      data: [
        {
          id: "chunk-pricing",
          content: "Our pricing starts at $500/month",
          similarity: 0.91,
          metadata: {},
        },
        {
          id: "chunk-services",
          content: "We offer web development services",
          similarity: 0.72,
          metadata: {},
        },
      ],
      error: null,
    });

    const results = await searchKnowledge({
      queryEmbedding,
      tenantId,
      kbType: "general",
      topK: 3,
    });

    expect(results).toHaveLength(2);
    expect(results[0].content).toContain("pricing");
    expect(results[0].similarity).toBeGreaterThan(results[1].similarity);
  });

  it("handles the full pipeline error gracefully when HF API is down", async () => {
    // 503 is retried — need initial + 2 retries = 3 mock responses
    const error503 = {
      ok: false,
      status: 503,
      text: async () => "Service Unavailable",
    };
    mockFetch
      .mockResolvedValueOnce(error503)
      .mockResolvedValueOnce(error503)
      .mockResolvedValueOnce(error503);

    await expect(embedText("test query")).rejects.toThrow(
      "HuggingFace embedding API error (503)"
    );
  });

  it("handles vector search error when RPC fails", async () => {
    const queryEmbedding = Array.from({ length: API_DIMENSION }, () => 0.1);
    mockRpc.mockReturnValue({
      data: null,
      error: { message: "connection refused" },
    });

    await expect(
      searchKnowledge({
        queryEmbedding,
        tenantId,
        kbType: "general",
      })
    ).rejects.toThrow("Vector search failed: connection refused");
  });
});
