import { describe, it, expect, vi, beforeEach } from "vitest";
import { embedText, embedBatch, EMBEDDING_DIM } from "@/lib/ai/embedding";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("embedText", () => {
  it("returns an embedding vector for a single string", async () => {
    const fakeEmbedding = Array.from({ length: 4096 }, (_, i) => i * 0.001);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [fakeEmbedding],
    });

    const result = await embedText("Hello world");

    expect(result).toEqual(fakeEmbedding.slice(0, EMBEDDING_DIM));
    expect(result).toHaveLength(EMBEDDING_DIM);
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("Qwen/Qwen3-Embedding-8B");
    expect(options.method).toBe("POST");
    expect(options.headers["Authorization"]).toBe("Bearer test-hf-api-key");

    const body = JSON.parse(options.body);
    expect(body.inputs).toBe("Hello world");
  });

  it("throws on API error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => "Model is loading",
    });

    await expect(embedText("test")).rejects.toThrow(
      "HuggingFace embedding API error (503): Model is loading"
    );
  });
});

describe("embedBatch", () => {
  it("embeds multiple texts in a single API call", async () => {
    const fakeEmbeddings = [
      Array.from({ length: 4096 }, () => 0.1),
      Array.from({ length: 4096 }, () => 0.2),
      Array.from({ length: 4096 }, () => 0.3),
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => fakeEmbeddings,
    });

    const texts = ["one", "two", "three"];
    const result = await embedBatch(texts);

    expect(result).toHaveLength(3);
    expect(result[0]).toHaveLength(EMBEDDING_DIM);
    expect(result[1]).toHaveLength(EMBEDDING_DIM);
    expect(result[2]).toHaveLength(EMBEDDING_DIM);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.inputs).toEqual(["one", "two", "three"]);
  });

  it("chunks large batches into groups of 10", async () => {
    const fakeEmbedding = Array.from({ length: 4096 }, () => 0.1);

    // First batch of 10
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => Array(10).fill(fakeEmbedding),
    });
    // Second batch of 2
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => Array(2).fill(fakeEmbedding),
    });

    const texts = Array.from({ length: 12 }, (_, i) => `text ${i}`);
    const result = await embedBatch(texts);

    expect(result).toHaveLength(12);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const firstBatchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(firstBatchBody.inputs).toHaveLength(10);

    const secondBatchBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(secondBatchBody.inputs).toHaveLength(2);
  });

  it("returns empty array for empty input", async () => {
    const result = await embedBatch([]);
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
