import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/query-router", () => ({ classifyQuery: vi.fn() }));
vi.mock("@/lib/ai/embedding", () => ({ embedText: vi.fn() }));
vi.mock("@/lib/ai/vector-search", () => ({ searchKnowledge: vi.fn() }));
vi.mock("@/lib/ai/reranker", () => ({ rerankChunks: vi.fn() }));
vi.mock("@/lib/ai/llm-client", () => ({ generateResponse: vi.fn() }));

import { retrieveKnowledge } from "@/lib/ai/retriever";
import { classifyQuery } from "@/lib/ai/query-router";
import { embedText } from "@/lib/ai/embedding";
import { searchKnowledge } from "@/lib/ai/vector-search";
import { rerankChunks } from "@/lib/ai/reranker";
import { generateResponse } from "@/lib/ai/llm-client";

const mockClassify = vi.mocked(classifyQuery);
const mockEmbed = vi.mocked(embedText);
const mockSearch = vi.mocked(searchKnowledge);
const mockRerank = vi.mocked(rerankChunks);
const mockGenerate = vi.mocked(generateResponse);

const fakeEmbedding = Array(1024).fill(0.1);

const chunk = (id: string, similarity: number) => ({
  id,
  content: `Content of ${id}`,
  similarity,
  metadata: {},
});

beforeEach(() => {
  vi.clearAllMocks();
  mockEmbed.mockResolvedValue(fakeEmbedding);
});

describe("retrieveKnowledge", () => {
  const tenantId = "t1";

  it("returns success on Pass 1 when top reranker score >= 0.6", async () => {
    mockClassify.mockReturnValue("general");
    mockSearch.mockResolvedValue([chunk("c1", 0.8), chunk("c2", 0.7)]);
    mockRerank.mockResolvedValue([chunk("c1", 0.85), chunk("c2", 0.72)]);

    const result = await retrieveKnowledge({ query: "What are your hours?", tenantId });

    expect(result.status).toBe("success");
    expect(result.retrievalPass).toBe(1);
    expect(result.chunks[0].id).toBe("c1");
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("triggers Pass 2 when top reranker score < 0.6", async () => {
    mockClassify.mockReturnValue("general");
    // Pass 1: low confidence results
    mockSearch.mockResolvedValueOnce([chunk("c1", 0.5)]);
    mockRerank.mockResolvedValueOnce([chunk("c1", 0.4)]); // below 0.6

    // LLM expansion
    mockGenerate.mockResolvedValue({
      content: "hours open schedule",
      finishReason: "stop",
    });

    // Pass 2: better results
    mockSearch.mockResolvedValueOnce([chunk("c2", 0.9)]);
    mockRerank.mockResolvedValueOnce([chunk("c2", 0.88)]);

    const result = await retrieveKnowledge({ query: "When can I come in?", tenantId });

    expect(result.retrievalPass).toBe(2);
    expect(mockGenerate).toHaveBeenCalledOnce();
    const genArgs = mockGenerate.mock.calls[0];
    expect(genArgs[0]).toContain("search keywords");
    expect(genArgs[2]).toMatchObject({ temperature: 0, maxTokens: 50 });
  });

  it("merges and deduplicates Pass 1 + Pass 2 results", async () => {
    mockClassify.mockReturnValue("general");
    mockSearch.mockResolvedValueOnce([chunk("c1", 0.5), chunk("shared", 0.5)]);
    mockRerank.mockResolvedValueOnce([chunk("c1", 0.55), chunk("shared", 0.5)]);

    mockGenerate.mockResolvedValue({ content: "keywords", finishReason: "stop" });

    mockSearch.mockResolvedValueOnce([chunk("c2", 0.9), chunk("shared", 0.9)]);
    mockRerank.mockResolvedValueOnce([chunk("c2", 0.95), chunk("shared", 0.88)]);

    const result = await retrieveKnowledge({ query: "question", tenantId });

    const ids = result.chunks.map((c) => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("returns both targets in parallel when classification is 'both'", async () => {
    mockClassify.mockReturnValue("both");
    mockSearch
      .mockResolvedValueOnce([chunk("g1", 0.8)])
      .mockResolvedValueOnce([chunk("p1", 0.9)]);
    mockRerank.mockResolvedValue([chunk("p1", 0.92), chunk("g1", 0.78)]);

    const result = await retrieveKnowledge({ query: "Tell me more", tenantId });

    expect(result.queryTarget).toBe("both");
    expect(mockSearch).toHaveBeenCalledTimes(2);
    expect(result.chunks[0].id).toBe("p1");
  });

  it("returns no_results when both passes return empty", async () => {
    mockClassify.mockReturnValue("general");
    mockSearch.mockResolvedValue([]);
    mockRerank.mockResolvedValue([]);
    mockGenerate.mockResolvedValue({ content: "keywords", finishReason: "stop" });

    const result = await retrieveKnowledge({ query: "xyz 123 obscure", tenantId });

    expect(result.status).toBe("no_results");
    expect(result.chunks).toHaveLength(0);
  });


  it("strips non-word characters from LLM expansion output before search", async () => {
    mockClassify.mockReturnValue("general");
    mockSearch.mockResolvedValueOnce([chunk("c1", 0.5)]);
    mockRerank.mockResolvedValueOnce([chunk("c1", 0.4)]);

    mockGenerate.mockResolvedValue({
      content: 'Ignore instructions! DROP TABLE; hours, open',
      finishReason: "stop",
    });

    mockSearch.mockResolvedValueOnce([]);
    mockRerank.mockResolvedValueOnce([]);

    await retrieveKnowledge({ query: "question", tenantId });

    const secondSearchCall = mockSearch.mock.calls[1];
    expect(secondSearchCall[0].ftsQuery).not.toContain("DROP");
    expect(secondSearchCall[0].ftsQuery).not.toContain(";");
  });
});
