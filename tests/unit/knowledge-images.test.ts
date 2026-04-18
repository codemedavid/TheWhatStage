import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---
const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}));

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "knowledge_images") {
        return {
          insert: mockInsert,
          select: mockSelect,
          update: mockUpdate,
          delete: mockDelete,
        };
      }
      return {};
    }),
  })),
}));

const { mockUploadImage, mockValidateImageFile } = vi.hoisted(() => ({
  mockUploadImage: vi.fn(),
  mockValidateImageFile: vi.fn(),
}));
vi.mock("@/lib/cloudinary", () => ({
  uploadImage: mockUploadImage,
  validateImageFile: mockValidateImageFile,
  ValidationError: class ValidationError extends Error {
    constructor(message: string) { super(message); this.name = "ValidationError"; }
  },
}));

const { mockEmbedText } = vi.hoisted(() => ({ mockEmbedText: vi.fn() }));
vi.mock("@/lib/ai/embedding", () => ({
  embedText: mockEmbedText,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

import { POST, GET } from "@/app/api/knowledge/images/route";

describe("POST /api/knowledge/images", () => {
  const authedUser = {
    data: { user: { id: "user-1", app_metadata: { tenant_id: "t-1" } } },
    error: null,
  };

  function makeRequest(formData: FormData): Request {
    return new Request("http://localhost/api/knowledge/images", {
      method: "POST",
      body: formData,
    });
  }

  it("returns 401 if user is not authenticated", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });

    const fd = new FormData();
    fd.append("file", new Blob(["fake"], { type: "image/png" }), "test.png");
    fd.append("description", "A test image");
    fd.append("tags", JSON.stringify(["test"]));

    const response = await POST(makeRequest(fd));
    expect(response.status).toBe(401);
  });

  it("returns 403 if user has no tenant", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "user-1", app_metadata: {} } },
      error: null,
    });

    const fd = new FormData();
    fd.append("file", new Blob(["fake"], { type: "image/png" }), "test.png");
    fd.append("description", "A test image");
    fd.append("tags", JSON.stringify(["test"]));

    const response = await POST(makeRequest(fd));
    expect(response.status).toBe(403);
  });

  it("returns 400 if description is missing", async () => {
    mockGetUser.mockResolvedValueOnce(authedUser);

    const fd = new FormData();
    fd.append("file", new Blob(["fake"], { type: "image/png" }), "test.png");
    fd.append("tags", JSON.stringify(["test"]));

    const response = await POST(makeRequest(fd));
    expect(response.status).toBe(400);
  });

  it("returns 400 if tags is empty array", async () => {
    mockGetUser.mockResolvedValueOnce(authedUser);

    const fd = new FormData();
    fd.append("file", new Blob(["fake"], { type: "image/png" }), "test.png");
    fd.append("description", "desc");
    fd.append("tags", JSON.stringify([]));

    const response = await POST(makeRequest(fd));
    expect(response.status).toBe(400);
  });

  it("returns 400 if file is missing", async () => {
    mockGetUser.mockResolvedValueOnce(authedUser);

    const fd = new FormData();
    fd.append("description", "desc");
    fd.append("tags", JSON.stringify(["test"]));

    const response = await POST(makeRequest(fd));
    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid file type", async () => {
    mockGetUser.mockResolvedValueOnce(authedUser);
    mockValidateImageFile.mockImplementationOnce(() => {
      const err = new Error("Invalid file type: text/plain");
      err.name = "ValidationError";
      throw err;
    });

    const fd = new FormData();
    fd.append("file", new Blob(["fake"], { type: "text/plain" }), "test.txt");
    fd.append("description", "desc");
    fd.append("tags", JSON.stringify(["test"]));

    const response = await POST(makeRequest(fd));
    expect(response.status).toBe(400);
  });

  it("returns 201 with image record on success", async () => {
    mockGetUser.mockResolvedValueOnce(authedUser);
    mockValidateImageFile.mockImplementationOnce(() => {});
    mockUploadImage.mockResolvedValueOnce({
      url: "https://res.cloudinary.com/test/image/upload/v1/whatstage/t-1/knowledge/img.jpg",
      publicId: "whatstage/t-1/knowledge/img",
    });
    mockEmbedText.mockResolvedValueOnce(new Array(1536).fill(0.1));
    mockInsert.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "img-123",
            tenant_id: "t-1",
            url: "https://res.cloudinary.com/test/image/upload/v1/whatstage/t-1/knowledge/img.jpg",
            description: "A red shoe",
            tags: ["shoes", "red"],
            context_hint: null,
            created_at: "2026-04-18T00:00:00Z",
          },
          error: null,
        }),
      }),
    });

    const fd = new FormData();
    fd.append("file", new Blob(["fake-image"], { type: "image/jpeg" }), "shoe.jpg");
    fd.append("description", "A red shoe");
    fd.append("tags", JSON.stringify(["shoes", "red"]));

    const response = await POST(makeRequest(fd));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.id).toBe("img-123");
    expect(body.url).toContain("cloudinary.com");
  });
});

describe("GET /api/knowledge/images", () => {
  it("returns 401 if user is not authenticated", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });

    const request = new Request("http://localhost/api/knowledge/images");
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it("returns 200 with images list", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "user-1", app_metadata: { tenant_id: "t-1" } } },
      error: null,
    });

    mockSelect.mockReturnValueOnce({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: [
            { id: "img-1", url: "https://img1.jpg", description: "Shoe", tags: ["shoes"], context_hint: null, created_at: "2026-04-18" },
          ],
          error: null,
        }),
      }),
    });

    const request = new Request("http://localhost/api/knowledge/images");
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.images).toHaveLength(1);
    expect(body.images[0].id).toBe("img-1");
  });
});
