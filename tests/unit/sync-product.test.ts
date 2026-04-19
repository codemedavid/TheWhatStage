import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncProductChunk } from "@/lib/ai/sync-product";

vi.mock("@/lib/ai/embedding", () => ({
  embedText: vi.fn().mockResolvedValue(Array(1024).fill(0.1)),
}));

const mockInsert = vi.fn().mockReturnValue({
  select: vi.fn().mockReturnValue({
    single: vi.fn().mockResolvedValue({ data: { id: "doc-1" }, error: null }),
  }),
});
const mockUpsert = vi.fn().mockReturnValue({ error: null });
const mockDeleteDocs = vi.fn().mockReturnValue({
  eq: vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({ error: null }),
  }),
});

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "knowledge_docs") {
        return { insert: mockInsert, delete: mockDeleteDocs };
      }
      if (table === "knowledge_chunks") {
        return { upsert: mockUpsert };
      }
      return {};
    }),
  })),
}));

beforeEach(() => vi.clearAllMocks());

describe("syncProductChunk", () => {
  it("creates a doc and chunk for a new product (upsert)", async () => {
    await syncProductChunk({
      tenantId: "t-1",
      productId: "prod-1",
      product: { name: "Widget", price: 25, description: "A great widget" },
    });

    expect(mockInsert).toHaveBeenCalledOnce();
    expect(mockUpsert).toHaveBeenCalledOnce();
  });

  it("deletes the doc (cascades to chunks) on product delete", async () => {
    await syncProductChunk({
      tenantId: "t-1",
      productId: "prod-1",
      product: null,
    });

    expect(mockDeleteDocs).toHaveBeenCalledOnce();
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
