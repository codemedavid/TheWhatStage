import { describe, it, expect, vi, beforeEach } from "vitest";
import { retrieveKnowledge } from "@/lib/ai/retriever";

// Mock fetch for HuggingFace embedding API
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock Supabase service client for vector search
const mockRpc = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    rpc: mockRpc,
  })),
}));

const API_DIM = 4096;
const fakeEmbedding = Array.from({ length: API_DIM }, (_, i) => Math.sin(i) * 0.01);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RAG Retrieval Integration", () => {
  const tenantId = "tenant-integration";

  it("routes a pricing query to product KB and returns ranked results", async () => {
    // Embed the query
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [fakeEmbedding],
    });

    // Vector search returns product results
    mockRpc.mockReturnValueOnce({
      data: [
        { id: "p1", content: "Widget costs $25.", similarity: 0.90, metadata: {} },
        { id: "p2", content: "Gadget costs $50.", similarity: 0.72, metadata: {} },
      ],
      error: null,
    });

    const result = await retrieveKnowledge({
      query: "How much does the widget cost?",
      tenantId,
    });

    expect(result.status).toBe("success");
    expect(result.queryTarget).toBe("product");
    expect(result.chunks).toHaveLength(2);
    expect(result.chunks[0].similarity).toBeGreaterThanOrEqual(result.chunks[1].similarity);
  });

  it("queries both KBs for ambiguous queries and merges results", async () => {
    // Embed the query
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [fakeEmbedding],
    });

    // General KB results (called first in Promise.all)
    mockRpc.mockReturnValueOnce({
      data: [
        { id: "g1", content: "We are a software company.", similarity: 0.65, metadata: {} },
      ],
      error: null,
    });
    // Product KB results (called second in Promise.all)
    mockRpc.mockReturnValueOnce({
      data: [
        { id: "p1", content: "Our main product is a CRM.", similarity: 0.78, metadata: {} },
      ],
      error: null,
    });

    const result = await retrieveKnowledge({
      query: "Tell me more about what you do",
      tenantId,
    });

    expect(result.status).toBe("success");
    expect(result.queryTarget).toBe("both");
    expect(result.chunks).toHaveLength(2);
    expect(result.chunks[0].id).toBe("p1");
  });

  it("reformulates and retries when initial results are weak", async () => {
    // First embed
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [fakeEmbedding],
    });

    // First search: weak results
    mockRpc.mockReturnValueOnce({
      data: [
        { id: "c1", content: "Vague match.", similarity: 0.20, metadata: {} },
      ],
      error: null,
    });

    // Second embed (reformulated query)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [fakeEmbedding],
    });

    // Second search: strong results
    mockRpc.mockReturnValueOnce({
      data: [
        { id: "c2", content: "Business hours are 9-5.", similarity: 0.82, metadata: {} },
      ],
      error: null,
    });

    const result = await retrieveKnowledge({
      query: "Can you please tell me what time you open?",
      tenantId,
    });

    expect(result.status).toBe("success");
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0].content).toContain("9-5");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("returns no_results when KB is empty", async () => {
    // First embed
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [fakeEmbedding],
    });

    // First search: "both" target calls RPC twice (general + product in parallel)
    mockRpc.mockReturnValueOnce({ data: [], error: null });
    mockRpc.mockReturnValueOnce({ data: [], error: null });

    // Second embed (reformulated)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [fakeEmbedding],
    });

    // Second search: "both" target calls RPC twice again
    mockRpc.mockReturnValueOnce({ data: [], error: null });
    mockRpc.mockReturnValueOnce({ data: [], error: null });

    const result = await retrieveKnowledge({
      query: "Something nobody has asked before",
      tenantId,
    });

    expect(result.status).toBe("no_results");
    expect(result.chunks).toHaveLength(0);
  });
});
