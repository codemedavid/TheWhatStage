import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveSession } from "@/lib/auth/session";

const mockFrom = vi.fn();
const mockResolveSession = vi.mocked(resolveSession);

vi.mock("@/lib/auth/session", () => ({
  resolveSession: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: mockFrom })),
}));

const params = Promise.resolve({ id: "action-page-1" });

// ─── GET /api/action-pages/[id]/fields ───────────────────────────────────────

describe("GET /api/action-pages/[id]/fields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns 401 when not authenticated", async () => {
    mockResolveSession.mockResolvedValue(null);
    const { GET } = await import("@/app/api/action-pages/[id]/fields/route");
    const req = new Request("http://localhost/api/action-pages/ap-1/fields");
    const res = await GET(req, { params });
    expect(res.status).toBe(401);
  });

  it("returns fields ordered by order_index", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    const fields = [
      { id: "f1", label: "Name", field_key: "name", field_type: "text", order_index: 0 },
      { id: "f2", label: "Email", field_key: "email", field_type: "email", order_index: 1 },
    ];

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: fields, error: null }),
          }),
        }),
      }),
    });

    const { GET } = await import("@/app/api/action-pages/[id]/fields/route");
    const req = new Request("http://localhost/api/action-pages/ap-1/fields");
    const res = await GET(req, { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.fields).toHaveLength(2);
    expect(body.fields[0].field_key).toBe("name");
  });
});

// ─── PUT /api/action-pages/[id]/fields ───────────────────────────────────────

describe("PUT /api/action-pages/[id]/fields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns 401 when not authenticated", async () => {
    mockResolveSession.mockResolvedValue(null);
    const { PUT } = await import("@/app/api/action-pages/[id]/fields/route");
    const req = new Request("http://localhost/api/action-pages/ap-1/fields", {
      method: "PUT",
      body: JSON.stringify({ fields: [] }),
    });
    const res = await PUT(req, { params });
    expect(res.status).toBe(401);
  });

  it("returns 400 when fields array is missing", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });
    const { PUT } = await import("@/app/api/action-pages/[id]/fields/route");
    const req = new Request("http://localhost/api/action-pages/ap-1/fields", {
      method: "PUT",
      body: JSON.stringify({}),
    });
    const res = await PUT(req, { params });
    expect(res.status).toBe(400);
  });

  it("replaces fields successfully", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    const newFields = [
      { label: "Full Name", field_key: "full_name", field_type: "text", required: true, order_index: 0 },
      { label: "Email", field_key: "email", field_type: "email", required: true, order_index: 1 },
    ];

    // Mock delete then insert
    mockFrom
      .mockReturnValueOnce({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      })
      .mockReturnValueOnce({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ data: newFields, error: null }),
        }),
      });

    const { PUT } = await import("@/app/api/action-pages/[id]/fields/route");
    const req = new Request("http://localhost/api/action-pages/ap-1/fields", {
      method: "PUT",
      body: JSON.stringify({ fields: newFields }),
    });
    const res = await PUT(req, { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.fields).toHaveLength(2);
  });

  it("returns 400 for invalid field type", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });
    const { PUT } = await import("@/app/api/action-pages/[id]/fields/route");
    const req = new Request("http://localhost/api/action-pages/ap-1/fields", {
      method: "PUT",
      body: JSON.stringify({
        fields: [{ label: "X", field_key: "x", field_type: "color", required: false, order_index: 0 }],
      }),
    });
    const res = await PUT(req, { params });
    expect(res.status).toBe(400);
  });
});
