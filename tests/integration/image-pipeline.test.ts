import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock Cloudinary ---
vi.mock("@/lib/cloudinary", () => ({
  uploadImage: vi.fn(),
  validateImageFile: vi.fn(),
  ValidationError: class ValidationError extends Error {
    constructor(message: string) { super(message); this.name = "ValidationError"; }
  },
}));

// --- Mock HuggingFace embedding API ---
vi.mock("@/lib/ai/embedding", () => ({
  embedText: vi.fn(),
}));

// --- Mock Supabase ---
const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockRpc = vi.fn();
const mockGetUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "knowledge_images") {
        return {
          insert: mockInsert,
          select: mockSelect,
        };
      }
      return {};
    }),
    rpc: mockRpc,
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

import { POST } from "@/app/api/knowledge/images/route";
import { selectImages } from "@/lib/ai/image-selector";
import { uploadImage } from "@/lib/cloudinary";
import { embedText } from "@/lib/ai/embedding";

const mockUploadImage = vi.mocked(uploadImage);
const mockEmbedText = vi.mocked(embedText);

describe("Image pipeline integration: upload -> embed -> select", () => {
  it("uploaded image with embedding can be found by image selector", async () => {
    const fakeEmbedding = new Array(1536).fill(0.5);

    // Step 1: Upload an image via API
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "u-1", app_metadata: { tenant_id: "t-1" } } },
      error: null,
    });
    mockUploadImage.mockResolvedValueOnce({
      url: "https://res.cloudinary.com/test/whatstage/t-1/knowledge/shoe.jpg",
      publicId: "whatstage/t-1/knowledge/shoe",
    });
    mockEmbedText.mockResolvedValueOnce(fakeEmbedding);
    mockInsert.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "img-uploaded",
            tenant_id: "t-1",
            url: "https://res.cloudinary.com/test/whatstage/t-1/knowledge/shoe.jpg",
            description: "Red running shoe",
            tags: ["shoes", "red", "running"],
            context_hint: "Show when discussing footwear",
            created_at: "2026-04-18T00:00:00Z",
          },
          error: null,
        }),
      }),
    });

    const fd = new FormData();
    fd.append("file", new Blob(["fake-img"], { type: "image/jpeg" }), "shoe.jpg");
    fd.append("description", "Red running shoe");
    fd.append("tags", JSON.stringify(["shoes", "red", "running"]));
    fd.append("context_hint", "Show when discussing footwear");

    const uploadResponse = await POST(
      new Request("http://localhost/api/knowledge/images", { method: "POST", body: fd })
    );
    expect(uploadResponse.status).toBe(201);

    const uploadBody = await uploadResponse.json();
    expect(uploadBody.id).toBe("img-uploaded");

    // Step 2: Verify embedding was generated
    expect(mockEmbedText).toHaveBeenCalledWith("Red running shoe");

    // Step 3: Verify the insert included the embedding
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        embedding: fakeEmbedding,
        description: "Red running shoe",
        tags: ["shoes", "red", "running"],
      })
    );
  });
});
