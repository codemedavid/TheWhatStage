import { describe, it, expect, vi, beforeEach } from "vitest";
import { retrieveKnowledge } from "@/lib/ai/retriever";

vi.mock("@/lib/ai/query-router", () => ({
  classifyQuery: vi.fn(),
}));
vi.mock("@/lib/ai/query-reformulator", () => ({
  reformulateQuery: vi.fn(),
}));
vi.mock("@/lib/ai/embedding", () => ({
  embedText: vi.fn(),
}));
vi.mock("@/lib/ai/vector-search", () => ({
  searchKnowledge: vi.fn(),
}));

import { classifyQuery } from "@/lib/ai/query-router";
import { reformulateQuery } from "@/lib/ai/query-reformulator";
import { embedText } from "@/lib/ai/embedding";
import { searchKnowledge } from "@/lib/ai/vector-search";

const mockClassify = vi.mocked(classifyQuery);
const mockReformulate = vi.mocked(reformulateQuery);
const mockEmbed = vi.mocked(embedText);
const mockSearch = vi.mocked(searchKnowledge);

const fakeEmbedding = Array(1536).fill(0.1);

beforeEach(() => {
  vi.clearAllMocks();
  mockEmbed.mockResolvedValue(fakeEmbedding);
});

describe("retrieveKnowledge", () => {
  const tenantId = "tenant-1";

  it("routes to general KB and returns ranked chunks", async () => {
    mockClassify.mockReturnValue("general");
    mockSearch.mockResolvedValueOnce([
      { id: "c1", content: "Our hours are 9-5.", similarity: 0.85, metadata: {} },
      { id: "c2", content: "We are in Springfield.", similarity: 0.72, metadata: {} },
    ]);

    const result = await retrieveKnowledge({ query: "What are your hours?", tenantId });

    expect(result.status).toBe("success");
    expect(result.chunks).toHaveLength(2);
    expect(result.chunks[0].similarity).toBeGreaterThanOrEqual(result.chunks[1].similarity);
    expect(result.queryTarget).toBe("general");
    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({ kbType: "general", topK: 5 })
    );
  });

  it("routes to product KB with topK=3", async () => {
    mockClassify.mockReturnValue("product");
    mockSearch.mockResolvedValueOnce([
      { id: "p1", content: "Widget costs $25.", similarity: 0.90, metadata: {} },
    ]);

    const result = await retrieveKnowledge({ query: "How much is the widget?", tenantId });

    expect(result.status).toBe("success");
    expect(result.queryTarget).toBe("product");
    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({ kbType: "product", topK: 3 })
    );
  });

  it("queries both KBs when classification is 'both' and merges results", async () => {
    mockClassify.mockReturnValue("both");
    mockSearch.mockResolvedValueOnce([
      { id: "g1", content: "General info.", similarity: 0.60, metadata: {} },
    ]);
    mockSearch.mockResolvedValueOnce([
      { id: "p1", content: "Product info.", similarity: 0.80, metadata: {} },
    ]);

    const result = await retrieveKnowledge({ query: "Tell me more", tenantId });

    expect(result.status).toBe("success");
    expect(result.chunks).toHaveLength(2);
    expect(result.chunks[0].id).toBe("p1");
    expect(result.chunks[1].id).toBe("g1");
    expect(result.queryTarget).toBe("both");
  });

  it("reformulates and retries when all results are below threshold", async () => {
    mockClassify.mockReturnValue("general");
    mockSearch.mockResolvedValueOnce([
      { id: "c1", content: "Vaguely related.", similarity: 0.25, metadata: {} },
    ]);
    mockReformulate.mockReturnValue("hours open");
    mockEmbed.mockResolvedValueOnce(fakeEmbedding);
    mockSearch.mockResolvedValueOnce([
      { id: "c2", content: "We are open 9-5.", similarity: 0.75, metadata: {} },
    ]);

    const result = await retrieveKnowledge({ query: "Can you tell me when you're open?", tenantId });

    expect(result.status).toBe("success");
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0].similarity).toBeGreaterThan(0.3);
    expect(mockReformulate).toHaveBeenCalledOnce();
    expect(mockEmbed).toHaveBeenCalledTimes(2);
  });

  it("returns low_confidence when reformulation also yields low results", async () => {
    mockClassify.mockReturnValue("general");
    mockSearch.mockResolvedValueOnce([
      { id: "c1", content: "Not relevant.", similarity: 0.20, metadata: {} },
    ]);
    mockReformulate.mockReturnValue("something");
    mockEmbed.mockResolvedValueOnce(fakeEmbedding);
    mockSearch.mockResolvedValueOnce([
      { id: "c2", content: "Still not relevant.", similarity: 0.22, metadata: {} },
    ]);

    const result = await retrieveKnowledge({ query: "xyz abc 123", tenantId });

    expect(result.status).toBe("low_confidence");
    expect(result.chunks).toHaveLength(0);
  });

  it("returns no_results when search returns empty", async () => {
    mockClassify.mockReturnValue("general");
    mockSearch.mockResolvedValueOnce([]);
    mockReformulate.mockReturnValue("query");
    mockEmbed.mockResolvedValueOnce(fakeEmbedding);
    mockSearch.mockResolvedValueOnce([]);

    const result = await retrieveKnowledge({ query: "Something obscure", tenantId });

    expect(result.status).toBe("no_results");
    expect(result.chunks).toHaveLength(0);
  });

  it("filters out chunks below the similarity threshold", async () => {
    mockClassify.mockReturnValue("general");
    mockSearch.mockResolvedValueOnce([
      { id: "c1", content: "Good match.", similarity: 0.85, metadata: {} },
      { id: "c2", content: "Weak match.", similarity: 0.25, metadata: {} },
      { id: "c3", content: "Decent match.", similarity: 0.55, metadata: {} },
    ]);

    const result = await retrieveKnowledge({ query: "Tell me about services", tenantId });

    expect(result.status).toBe("success");
    expect(result.chunks).toHaveLength(2);
    expect(result.chunks.every((c) => c.similarity >= 0.3)).toBe(true);
  });
});
