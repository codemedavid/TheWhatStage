import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();
const mockSendMessage = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock("@/lib/fb/send", () => ({
  sendMessage: vi.fn((...args: unknown[]) => mockSendMessage(...args)),
}));

vi.mock("@/lib/fb/signature", () => ({
  verifyActionPageSignature: vi.fn((psid: string, sig: string) => sig === "valid-sig"),
}));

const params = Promise.resolve({ id: "action-page-1" });

describe("POST /api/action-pages/[id]/submissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns 400 when psid is missing", async () => {
    const { POST } = await import("@/app/api/action-pages/[id]/submissions/route");
    const req = new Request("http://localhost/api/action-pages/ap-1/submissions", {
      method: "POST",
      body: JSON.stringify({ data: { name: "John" } }),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(400);
  });

  it("returns 403 when PSID signature is invalid", async () => {
    // Mock action page lookup
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: "action-page-1", tenant_id: "t1", title: "Form", config: {}, published: true },
              error: null,
            }),
          }),
        }),
      }),
    });

    // Mock tenant lookup
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { fb_app_secret: "secret123", fb_page_token: "token" },
            error: null,
          }),
        }),
      }),
    });

    const { POST } = await import("@/app/api/action-pages/[id]/submissions/route");
    const req = new Request("http://localhost/api/action-pages/ap-1/submissions", {
      method: "POST",
      body: JSON.stringify({ psid: "user-1", sig: "bad-sig", data: { name: "John" } }),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(403);
  });

  it("returns 400 when required fields are missing", async () => {
    // Mock action page
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: "action-page-1", tenant_id: "t1", title: "Quote Form", config: { thank_you_message: "Thanks!" }, published: true },
              error: null,
            }),
          }),
        }),
      }),
    });

    // Mock tenant
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { fb_app_secret: "secret123", fb_page_token: "token" },
            error: null,
          }),
        }),
      }),
    });

    // Mock fields (email is required)
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                { field_key: "email", field_type: "email", required: true, lead_mapping: { target: "lead_contact", type: "email" } },
              ],
              error: null,
            }),
          }),
        }),
      }),
    });

    const { POST } = await import("@/app/api/action-pages/[id]/submissions/route");
    const req = new Request("http://localhost/api/action-pages/ap-1/submissions", {
      method: "POST",
      body: JSON.stringify({ psid: "user-1", sig: "valid-sig", data: {} }),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("email");
  });
});
