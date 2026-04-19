import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveSession } from "@/lib/auth/session";

// --- Mocks ---
vi.mock("@/lib/auth/session", () => ({
  resolveSession: vi.fn(),
}));

const mockResolveSession = vi.mocked(resolveSession);

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

/**
 * Build a Request whose formData() is synchronously mocked.
 * This avoids jsdom multipart parsing issues with Blob bodies.
 */
function makeRequest(fields: Record<string, string | File | null>): Request {
  const req = new Request("http://localhost/api/knowledge/images", {
    method: "POST",
  });
  const mockFd = {
    get: (key: string) => fields[key] ?? null,
  };
  vi.spyOn(req, "formData").mockResolvedValue(mockFd as unknown as FormData);
  return req;
}

function makeFileField(content = "fake-image") {
  return {
    size: content.length,
    arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(content.length)),
    name: "test.jpg",
    type: "image/jpeg",
  } as unknown as File;
}

describe("POST /api/knowledge/images", () => {
  it("returns 401 if user is not authenticated", async () => {
    mockResolveSession.mockResolvedValueOnce(null);

    const response = await POST(makeRequest({
      file: makeFileField(),
      description: "A test image",
      tags: JSON.stringify(["test"]),
    }));
    expect(response.status).toBe(401);
  });

  it("returns 400 if description is missing", async () => {
    mockResolveSession.mockResolvedValueOnce({ userId: "user-1", tenantId: "t-1" });

    const response = await POST(makeRequest({
      file: makeFileField(),
      tags: JSON.stringify(["test"]),
    }));
    expect(response.status).toBe(400);
  });

  it("returns 400 if tags is empty array", async () => {
    mockResolveSession.mockResolvedValueOnce({ userId: "user-1", tenantId: "t-1" });

    const response = await POST(makeRequest({
      file: makeFileField(),
      description: "desc",
      tags: JSON.stringify([]),
    }));
    expect(response.status).toBe(400);
  });

  it("returns 400 if file is missing", async () => {
    mockResolveSession.mockResolvedValueOnce({ userId: "user-1", tenantId: "t-1" });

    const response = await POST(makeRequest({
      file: null,
      description: "desc",
      tags: JSON.stringify(["test"]),
    }));
    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid file type", async () => {
    mockResolveSession.mockResolvedValueOnce({ userId: "user-1", tenantId: "t-1" });
    mockValidateImageFile.mockImplementationOnce(() => {
      const err = new Error("Invalid file type: text/plain");
      err.name = "ValidationError";
      throw err;
    });

    const response = await POST(makeRequest({
      file: makeFileField(),
      description: "desc",
      tags: JSON.stringify(["test"]),
    }));
    expect(response.status).toBe(400);
  });

  it("returns 201 with image record on success", async () => {
    mockResolveSession.mockResolvedValueOnce({ userId: "user-1", tenantId: "t-1" });
    mockValidateImageFile.mockImplementationOnce(() => {});
    mockUploadImage.mockResolvedValueOnce({
      url: "https://res.cloudinary.com/test/image/upload/v1/whatstage/t-1/knowledge/img.jpg",
      publicId: "whatstage/t-1/knowledge/img",
    });
    mockEmbedText.mockResolvedValueOnce(new Array(1024).fill(0.1));
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

    const response = await POST(makeRequest({
      file: makeFileField("fake-image"),
      description: "A red shoe",
      tags: JSON.stringify(["shoes", "red"]),
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.id).toBe("img-123");
    expect(body.url).toContain("cloudinary.com");
  });
});

describe("GET /api/knowledge/images", () => {
  it("returns 401 if user is not authenticated", async () => {
    mockResolveSession.mockResolvedValueOnce(null);

    const request = new Request("http://localhost/api/knowledge/images");
    const response = await GET(request);
    expect(response.status).toBe(401);
  });

  it("returns 200 with images list", async () => {
    mockResolveSession.mockResolvedValueOnce({ userId: "user-1", tenantId: "t-1" });

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
