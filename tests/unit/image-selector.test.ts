import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---
const { mockFrom, mockRpc, mockEmbedText } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockEmbedText: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: mockFrom,
    rpc: mockRpc,
  })),
}));

vi.mock("@/lib/ai/embedding", () => ({
  embedText: mockEmbedText,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

import { selectImages, extractSearchTags } from "@/lib/ai/image-selector";

// --- extractSearchTags tests ---

describe("extractSearchTags", () => {
  it("extracts phase name as a tag", () => {
    const tags = extractSearchTags({
      currentPhaseName: "Product Discovery",
      leadMessage: "",
      retrievedChunks: [],
    });
    expect(tags).toContain("product discovery");
  });

  it("extracts keywords from lead message, filtering stopwords", () => {
    const tags = extractSearchTags({
      currentPhaseName: "",
      leadMessage: "Show me the red shoes please",
      retrievedChunks: [],
    });
    expect(tags).toContain("red");
    expect(tags).toContain("shoes");
    expect(tags).not.toContain("me");
    expect(tags).not.toContain("the");
    expect(tags).not.toContain("please");
  });

  it("extracts image_tags from chunk metadata", () => {
    const tags = extractSearchTags({
      currentPhaseName: "",
      leadMessage: "",
      retrievedChunks: [
        { id: "c1", content: "", similarity: 0.8, metadata: { image_tags: ["sneakers", "athletic"] } },
      ],
    });
    expect(tags).toContain("sneakers");
    expect(tags).toContain("athletic");
  });

  it("deduplicates and lowercases all tags", () => {
    const tags = extractSearchTags({
      currentPhaseName: "Shoes",
      leadMessage: "shoes SHOES",
      retrievedChunks: [],
    });
    const shoeCount = tags.filter((t) => t === "shoes").length;
    expect(shoeCount).toBe(1);
  });

  it("returns empty array when no meaningful tags found", () => {
    const tags = extractSearchTags({
      currentPhaseName: "",
      leadMessage: "the a is",
      retrievedChunks: [],
    });
    expect(tags).toEqual([]);
  });
});

// --- selectImages tests ---

describe("selectImages", () => {
  it("returns empty array when tag filter finds no matches", async () => {
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          overlaps: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    });

    const result = await selectImages({
      tenantId: "t-1",
      leadMessage: "hello",
      currentPhaseName: "Greeting",
      retrievedChunks: [],
      maxImages: 2,
    });

    expect(result).toEqual([]);
  });

  it("returns semantically ranked images when tag filter has matches", async () => {
    // Tag filter returns candidate IDs
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          overlaps: vi.fn().mockResolvedValue({
            data: [{ id: "img-1" }, { id: "img-2" }],
            error: null,
          }),
        }),
      }),
    });

    // Embedding
    mockEmbedText.mockResolvedValueOnce(new Array(1536).fill(0.1));

    // Semantic re-rank via RPC
    mockRpc.mockResolvedValueOnce({
      data: [
        { id: "img-2", url: "https://img2.jpg", description: "Red shoes", context_hint: null, similarity: 0.85 },
        { id: "img-1", url: "https://img1.jpg", description: "Blue shoes", context_hint: "show for footwear", similarity: 0.72 },
      ],
      error: null,
    });

    const result = await selectImages({
      tenantId: "t-1",
      leadMessage: "show me red shoes",
      currentPhaseName: "Product Discovery",
      retrievedChunks: [],
      maxImages: 2,
    });

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("img-2");
    expect(result[0].similarity).toBe(0.85);
    expect(result[1].id).toBe("img-1");
  });

  it("respects maxImages limit", async () => {
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          overlaps: vi.fn().mockResolvedValue({
            data: [{ id: "img-1" }, { id: "img-2" }, { id: "img-3" }],
            error: null,
          }),
        }),
      }),
    });

    mockEmbedText.mockResolvedValueOnce(new Array(1536).fill(0.1));

    mockRpc.mockResolvedValueOnce({
      data: [
        { id: "img-1", url: "https://img1.jpg", description: "A", context_hint: null, similarity: 0.9 },
        { id: "img-2", url: "https://img2.jpg", description: "B", context_hint: null, similarity: 0.8 },
      ],
      error: null,
    });

    const result = await selectImages({
      tenantId: "t-1",
      leadMessage: "products",
      currentPhaseName: "Sales",
      retrievedChunks: [],
      maxImages: 1,
    });

    // RPC called with p_top_k = 1
    expect(mockRpc).toHaveBeenCalledWith("match_knowledge_images", expect.objectContaining({
      p_top_k: 1,
    }));
  });

  it("returns empty array on embedding failure (graceful degradation)", async () => {
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          overlaps: vi.fn().mockResolvedValue({
            data: [{ id: "img-1" }],
            error: null,
          }),
        }),
      }),
    });

    mockEmbedText.mockRejectedValueOnce(new Error("HF API down"));

    const result = await selectImages({
      tenantId: "t-1",
      leadMessage: "show products",
      currentPhaseName: "Sales",
      retrievedChunks: [],
      maxImages: 2,
    });

    expect(result).toEqual([]);
  });

  it("returns empty array when all extracted tags are empty", async () => {
    const result = await selectImages({
      tenantId: "t-1",
      leadMessage: "the a is",
      currentPhaseName: "",
      retrievedChunks: [],
      maxImages: 2,
    });

    expect(result).toEqual([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
