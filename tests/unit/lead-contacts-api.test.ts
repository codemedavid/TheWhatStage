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

const params = Promise.resolve({ id: "lead-1" });
const contactParams = Promise.resolve({ id: "lead-1", contactId: "contact-1" });

// ─── GET /api/leads/[id]/contacts ─────────────────────────────────────────────

describe("GET /api/leads/[id]/contacts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns 401 when not authenticated", async () => {
    mockResolveSession.mockResolvedValue(null);
    const { GET } = await import("@/app/api/leads/[id]/contacts/route");
    const req = new Request("http://localhost/api/leads/lead-1/contacts");
    const res = await GET(req, { params });
    expect(res.status).toBe(401);
  });

  it("returns contacts when authenticated", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    const contacts = [
      { id: "contact-1", lead_id: "lead-1", tenant_id: "t1", type: "email", value: "foo@bar.com" },
      { id: "contact-2", lead_id: "lead-1", tenant_id: "t1", type: "phone", value: "+1234567890" },
    ];

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: contacts, error: null }),
          }),
        }),
      }),
    });

    const { GET } = await import("@/app/api/leads/[id]/contacts/route");
    const req = new Request("http://localhost/api/leads/lead-1/contacts");
    const res = await GET(req, { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.contacts).toHaveLength(2);
    expect(body.contacts[0].type).toBe("email");
  });
});

// ─── POST /api/leads/[id]/contacts ────────────────────────────────────────────

describe("POST /api/leads/[id]/contacts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns 400 on invalid contact type (fax)", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    const { POST } = await import("@/app/api/leads/[id]/contacts/route");
    const req = new Request("http://localhost/api/leads/lead-1/contacts", {
      method: "POST",
      body: JSON.stringify({ type: "fax", value: "123456789" }),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(400);
  });

  it("accepts a valid phone number", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    const created = {
      id: "contact-3",
      lead_id: "lead-1",
      tenant_id: "t1",
      type: "phone",
      value: "+1 555 123 4567",
      is_primary: false,
      source: "manual",
    };

    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: created, error: null }),
        }),
      }),
    });

    const { POST } = await import("@/app/api/leads/[id]/contacts/route");
    const req = new Request("http://localhost/api/leads/lead-1/contacts", {
      method: "POST",
      body: JSON.stringify({ type: "phone", value: "+1 555 123 4567" }),
    });
    const res = await POST(req, { params });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.contact.type).toBe("phone");
  });

  it("accepts a valid email address", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    const created = {
      id: "contact-4",
      lead_id: "lead-1",
      tenant_id: "t1",
      type: "email",
      value: "user@example.com",
      is_primary: true,
      source: "manual",
    };

    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: created, error: null }),
        }),
      }),
    });

    const { POST } = await import("@/app/api/leads/[id]/contacts/route");
    const req = new Request("http://localhost/api/leads/lead-1/contacts", {
      method: "POST",
      body: JSON.stringify({ type: "email", value: "user@example.com", is_primary: true }),
    });
    const res = await POST(req, { params });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.contact.value).toBe("user@example.com");
  });

  it("returns 400 on invalid email format", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    const { POST } = await import("@/app/api/leads/[id]/contacts/route");
    const req = new Request("http://localhost/api/leads/lead-1/contacts", {
      method: "POST",
      body: JSON.stringify({ type: "email", value: "not-an-email" }),
    });
    const res = await POST(req, { params });
    expect(res.status).toBe(400);
  });
});

// ─── DELETE /api/leads/[id]/contacts/[contactId] ──────────────────────────────

describe("DELETE /api/leads/[id]/contacts/[contactId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns 401 when not authenticated", async () => {
    mockResolveSession.mockResolvedValue(null);
    const { DELETE } = await import("@/app/api/leads/[id]/contacts/[contactId]/route");
    const req = new Request("http://localhost/api/leads/lead-1/contacts/contact-1", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: contactParams });
    expect(res.status).toBe(401);
  });

  it("deletes a contact when authenticated", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    mockFrom.mockReturnValue({
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    });

    const { DELETE } = await import("@/app/api/leads/[id]/contacts/[contactId]/route");
    const req = new Request("http://localhost/api/leads/lead-1/contacts/contact-1", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: contactParams });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });
});
