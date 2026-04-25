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

const params = Promise.resolve({ id: "lead-1", contactId: "contact-1" });

describe("PUT /api/leads/[id]/contacts/[contactId]/primary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns 401 when not authenticated", async () => {
    mockResolveSession.mockResolvedValue(null);
    const { PUT } = await import("@/app/api/leads/[id]/contacts/[contactId]/primary/route");
    const req = new Request("http://localhost/api/leads/lead-1/contacts/contact-1/primary", { method: "PUT" });
    const res = await PUT(req, { params });
    expect(res.status).toBe(401);
  });

  it("returns 404 when contact not found", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST116" } }),
            }),
          }),
        }),
      }),
    });

    const { PUT } = await import("@/app/api/leads/[id]/contacts/[contactId]/primary/route");
    const req = new Request("http://localhost/api/leads/lead-1/contacts/contact-1/primary", { method: "PUT" });
    const res = await PUT(req, { params });
    expect(res.status).toBe(404);
  });

  it("sets contact as primary and clears others", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    // Mock contact lookup
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: "contact-1", lead_id: "lead-1", type: "email", value: "a@b.com" },
                error: null,
              }),
            }),
          }),
        }),
      }),
    });

    // Mock clear existing primary
    mockFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      }),
    });

    // Mock set new primary
    mockFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: "contact-1", is_primary: true },
              error: null,
            }),
          }),
        }),
      }),
    });

    const { PUT } = await import("@/app/api/leads/[id]/contacts/[contactId]/primary/route");
    const req = new Request("http://localhost/api/leads/lead-1/contacts/contact-1/primary", { method: "PUT" });
    const res = await PUT(req, { params });
    expect(res.status).toBe(200);
  });
});
