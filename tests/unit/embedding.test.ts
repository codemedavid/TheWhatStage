import { describe, it, expect, vi, beforeEach } from "vitest";
import { embedText, embedBatch, EMBEDDING_DIM } from "@/lib/ai/embedding";

const mockFeatureExtraction = vi.fn();

vi.mock("@huggingface/inference", () => ({
  InferenceClient: vi.fn().mockImplementation(() => ({
    featureExtraction: mockFeatureExtraction,
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.HF_TOKEN = "test-hf-token";
});

describe("embedText", () => {
  it("returns a 1024-dim embedding vector for a single string", async () => {
    const fakeEmbedding = Array.from({ length: EMBEDDING_DIM }, (_, i) => i * 0.001);
    mockFeatureExtraction.mockResolvedValueOnce(fakeEmbedding);

    const result = await embedText("Hello world");

    expect(result).toEqual(fakeEmbedding);
    expect(result).toHaveLength(EMBEDDING_DIM);
    expect(mockFeatureExtraction).toHaveBeenCalledOnce();
    expect(mockFeatureExtraction).toHaveBeenCalledWith({
      model: "BAAI/bge-m3",
      inputs: "Hello world",
      provider: "hf-inference",
    });
  });

  it("throws if HF_TOKEN is not set", async () => {
    delete process.env.HF_TOKEN;
    await expect(embedText("test")).rejects.toThrow("HF_TOKEN is not set");
  });

  it("throws on API error", async () => {
    mockFeatureExtraction.mockRejectedValueOnce(new Error("API request failed: 400 Bad request"));

    await expect(embedText("test")).rejects.toThrow("400");
    expect(mockFeatureExtraction).toHaveBeenCalledOnce();
  });

  it("retries on 503 then succeeds", async () => {
    const fakeEmbedding = Array.from({ length: EMBEDDING_DIM }, () => 0.5);
    mockFeatureExtraction
      .mockRejectedValueOnce(new Error("503 Model is loading"))
      .mockResolvedValueOnce(fakeEmbedding);

    const result = await embedText("test");
    expect(result).toHaveLength(EMBEDDING_DIM);
    expect(mockFeatureExtraction).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting retries on 503", async () => {
    const error503 = new Error("503 Service Unavailable");
    mockFeatureExtraction
      .mockRejectedValueOnce(error503)
      .mockRejectedValueOnce(error503)
      .mockRejectedValueOnce(error503);

    await expect(embedText("test")).rejects.toThrow("503");
    expect(mockFeatureExtraction).toHaveBeenCalledTimes(3);
  });

  it("handles number[][] response (SDK wraps single input in array)", async () => {
    const fakeEmbedding = Array.from({ length: EMBEDDING_DIM }, () => 0.42);
    // SDK may return [[...]] for single string on some endpoints
    mockFeatureExtraction.mockResolvedValueOnce([fakeEmbedding]);

    const result = await embedText("test");
    expect(result).toHaveLength(EMBEDDING_DIM);
  });

  it("throws on wrong embedding dimension", async () => {
    mockFeatureExtraction.mockResolvedValueOnce(Array(512).fill(0.1));
    await expect(embedText("test")).rejects.toThrow("dimension mismatch");
  });
});

describe("embedBatch", () => {
  it("embeds multiple texts in a single SDK call", async () => {
    const fakeEmbeddings = [
      Array.from({ length: EMBEDDING_DIM }, () => 0.1),
      Array.from({ length: EMBEDDING_DIM }, () => 0.2),
      Array.from({ length: EMBEDDING_DIM }, () => 0.3),
    ];
    mockFeatureExtraction.mockResolvedValueOnce(fakeEmbeddings);

    const result = await embedBatch(["one", "two", "three"]);

    expect(result).toHaveLength(3);
    expect(result[0]).toHaveLength(EMBEDDING_DIM);
    expect(result[1]).toHaveLength(EMBEDDING_DIM);
    expect(result[2]).toHaveLength(EMBEDDING_DIM);
    expect(mockFeatureExtraction).toHaveBeenCalledOnce();
    expect(mockFeatureExtraction).toHaveBeenCalledWith({
      model: "BAAI/bge-m3",
      inputs: ["one", "two", "three"],
      provider: "hf-inference",
    });
  });

  it("chunks large batches into groups of 10", async () => {
    const fakeEmbedding = Array.from({ length: EMBEDDING_DIM }, () => 0.1);
    mockFeatureExtraction
      .mockResolvedValueOnce(Array(10).fill(fakeEmbedding))
      .mockResolvedValueOnce(Array(2).fill(fakeEmbedding));

    const texts = Array.from({ length: 12 }, (_, i) => `text ${i}`);
    const result = await embedBatch(texts);

    expect(result).toHaveLength(12);
    expect(mockFeatureExtraction).toHaveBeenCalledTimes(2);

    const [, firstBatchArgs] = mockFeatureExtraction.mock.calls[0];
    expect(firstBatchArgs).toBeUndefined(); // args are in first positional param
    expect(mockFeatureExtraction.mock.calls[0][0].inputs).toHaveLength(10);
    expect(mockFeatureExtraction.mock.calls[1][0].inputs).toHaveLength(2);
  });

  it("returns empty array for empty input", async () => {
    const result = await embedBatch([]);
    expect(result).toEqual([]);
    expect(mockFeatureExtraction).not.toHaveBeenCalled();
  });
});

// Live multilingual tests (env-gated, only run with HF_TOKEN)
// NOTE: These tests are skipped when HF_TOKEN is not set. They are integration tests
// that require a real HuggingFace API token and real network access. They verify that
// the embedding model correctly handles multilingual inputs.
const REAL_EMBEDDING_TESTS = process.env.HF_TOKEN ? describe : describe.skip;

REAL_EMBEDDING_TESTS("embedText (live multilingual)", () => {
  it("returns a 1024-dim vector for English", async () => {
    const v = await embedText("how much does this cost");
    expect(v).toHaveLength(EMBEDDING_DIM);
  });

  it("returns a 1024-dim vector for Tagalog", async () => {
    const v = await embedText("magkano po ba ito");
    expect(v).toHaveLength(EMBEDDING_DIM);
  });

  it("English and Tagalog 'how much' have cosine similarity > 0.5", async () => {
    const [a, b] = await Promise.all([
      embedText("how much does this cost"),
      embedText("magkano po ba ito"),
    ]);
    const dot = a.reduce((s, x, i) => s + x * b[i], 0);
    const na = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
    const nb = Math.sqrt(b.reduce((s, x) => s + x * x, 0));
    expect(dot / (na * nb)).toBeGreaterThan(0.5);
  });
});
