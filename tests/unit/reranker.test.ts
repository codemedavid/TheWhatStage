import { describe, it, expect, vi, beforeEach } from "vitest";

const mockTextClassification = vi.fn();

vi.mock("@huggingface/inference", () => ({
  InferenceClient: vi.fn(() => ({
    textClassification: mockTextClassification,
  })),
}));

import { rerankChunks } from "@/lib/ai/reranker";
import type { ChunkResult } from "@/lib/ai/vector-search";

const chunk = (id: string, content: string, similarity = 0.5): ChunkResult => ({
  id,
  content,
  similarity,
  metadata: {},
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("HF_TOKEN", "test-token");
});

describe("rerankChunks", () => {
  it("returns empty array when given no chunks", async () => {
    const result = await rerankChunks("test query", []);
    expect(result).toEqual([]);
    expect(mockTextClassification).not.toHaveBeenCalled();
  });

  it("returns the single chunk without calling reranker", async () => {
    const result = await rerankChunks("test query", [chunk("c1", "Only chunk")]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("c1");
    expect(mockTextClassification).not.toHaveBeenCalled();
  });

  it("sorts chunks by reranker score descending", async () => {
    mockTextClassification.mockResolvedValue([
      [{ score: 0.2 }],
      [{ score: 0.9 }],
      [{ score: 0.5 }],
    ]);

    const chunks = [
      chunk("c1", "Low relevance", 0.8),
      chunk("c2", "High relevance", 0.6),
      chunk("c3", "Mid relevance", 0.7),
    ];

    const result = await rerankChunks("query", chunks);

    expect(result[0].id).toBe("c2");
    expect(result[1].id).toBe("c3");
    expect(result[2].id).toBe("c1");
  });

  it("returns at most 8 chunks", async () => {
    mockTextClassification.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => [{ score: i * 0.1 }])
    );

    const chunks = Array.from({ length: 10 }, (_, i) => chunk(`c${i}`, `Chunk ${i}`));
    const result = await rerankChunks("query", chunks);

    expect(result).toHaveLength(8);
  });

  it("updates similarity to reranker score", async () => {
    mockTextClassification.mockResolvedValue([
      [{ score: 0.95 }],
      [{ score: 0.4 }],
    ]);

    const chunks = [chunk("c1", "First", 0.5), chunk("c2", "Second", 0.5)];
    const result = await rerankChunks("query", chunks);

    expect(result[0].similarity).toBeCloseTo(0.95);
    expect(result[1].similarity).toBeCloseTo(0.4);
  });

  it("falls back to similarity ordering when reranker throws", async () => {
    mockTextClassification.mockRejectedValue(new Error("503 Service Unavailable"));

    const chunks = [
      chunk("c1", "Low similarity chunk", 0.5),
      chunk("c2", "High similarity chunk", 0.9),
    ];

    const result = await rerankChunks("query", chunks);

    expect(result[0].id).toBe("c2");
    expect(result[1].id).toBe("c1");
  });

  it("passes correct inputs to HF textClassification", async () => {
    mockTextClassification.mockResolvedValue([
      [{ score: 0.8 }],
      [{ score: 0.6 }],
    ]);

    await rerankChunks("what are your hours?", [
      chunk("c1", "We are open 9-5"),
      chunk("c2", "Our products are great"),
    ]);

    expect(mockTextClassification).toHaveBeenCalledWith({
      model: "BAAI/bge-reranker-v2-m3",
      inputs: [
        { text: "what are your hours?", text_pair: "We are open 9-5" },
        { text: "what are your hours?", text_pair: "Our products are great" },
      ],
    });
  });
});
