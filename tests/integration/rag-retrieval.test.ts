import { describe, it, expect, vi, beforeEach } from "vitest";
import { retrieveKnowledge } from "@/lib/ai/retriever";

// Mock @huggingface/inference SDK
const mockFeatureExtraction = vi.fn();
vi.mock("@huggingface/inference", () => ({
  InferenceClient: vi.fn().mockImplementation(() => ({
    featureExtraction: mockFeatureExtraction,
  })),
}));

// Mock LLM client for query expansion (expandQuery in retriever)
const mockGenerateResponse = vi.fn();
vi.mock("@/lib/ai/llm-client", () => ({
  generateResponse: (...args: unknown[]) => mockGenerateResponse(...args),
}));

// Mock Supabase service client for vector search
const mockRpc = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    rpc: mockRpc,
  })),
}));

const fakeEmbedding = Array.from({ length: 1024 }, (_, i) => Math.sin(i) * 0.01);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.HF_TOKEN = "test-hf-token";
  // Default: expandQuery returns keywords (so pass2 runs when pass1 is weak)
  mockGenerateResponse.mockResolvedValue({ content: "open, hours, time", finishReason: "stop" });
});

describe("RAG Retrieval Integration", () => {
  const tenantId = "tenant-integration";

  it("routes a pricing query to product KB and returns ranked results", async () => {
    mockFeatureExtraction.mockResolvedValueOnce(fakeEmbedding);

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
    mockFeatureExtraction.mockResolvedValueOnce(fakeEmbedding);

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
    mockFeatureExtraction.mockResolvedValueOnce(fakeEmbedding);

    // First search: weak results
    mockRpc.mockReturnValueOnce({
      data: [
        { id: "c1", content: "Vague match.", similarity: 0.20, metadata: {} },
      ],
      error: null,
    });

    // Second embed (reformulated query)
    mockFeatureExtraction.mockResolvedValueOnce(fakeEmbedding);

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
    expect(mockFeatureExtraction).toHaveBeenCalledTimes(2);
  });

  it("returns no_results when KB is empty", async () => {
    // First embed
    mockFeatureExtraction.mockResolvedValueOnce(fakeEmbedding);

    // First search: "both" target calls RPC twice (general + product in parallel)
    mockRpc.mockReturnValueOnce({ data: [], error: null });
    mockRpc.mockReturnValueOnce({ data: [], error: null });

    // Second embed (reformulated)
    mockFeatureExtraction.mockResolvedValueOnce(fakeEmbedding);

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
