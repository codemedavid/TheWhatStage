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

vi.mock("@/lib/auth/session", () => ({
  resolveSession: vi.fn(),
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
import { resolveSession } from "@/lib/auth/session";

const mockUploadImage = vi.mocked(uploadImage);
const mockEmbedText = vi.mocked(embedText);
const mockResolveSession = vi.mocked(resolveSession);

describe("Image pipeline integration: upload -> embed -> select", () => {
  it("uploaded image with embedding can be found by image selector", async () => {
    const fakeEmbedding = new Array(1024).fill(0.5);

    // Step 1: Upload an image via API
    mockResolveSession.mockResolvedValueOnce({ userId: "u-1", tenantId: "t-1" });
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

    // jsdom's Request.formData() hangs with Blob bodies (multipart parsing).
    // Use a spy to mock request.formData directly.
    const mockFile = {
      size: 10,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(10)),
      name: "shoe.jpg",
      type: "image/jpeg",
    } as unknown as File;

    const req = new Request("http://localhost/api/knowledge/images", { method: "POST" });
    const mockFd = {
      get: (key: string) => {
        if (key === "file") return mockFile;
        if (key === "description") return "Red running shoe";
        if (key === "tags") return JSON.stringify(["shoes", "red", "running"]);
        if (key === "context_hint") return "Show when discussing footwear";
        return null;
      },
    };
    vi.spyOn(req, "formData").mockResolvedValue(mockFd as unknown as FormData);

    const uploadResponse = await POST(req);
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
