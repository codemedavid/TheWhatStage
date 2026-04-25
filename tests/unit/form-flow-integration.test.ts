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
  verifyActionPageSignature: vi.fn(() => true),
}));

vi.mock("@/lib/leads/key-normalizer", () => ({
  normalizeKey: vi.fn((key: string) => key.toLowerCase().replace(/\s+/g, "_")),
}));

const params = Promise.resolve({ id: "page-1" });

describe("Form submission → lead mapping → Messenger confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("processes a full form submission with email and knowledge mapping", async () => {
    const insertCalls: Array<{ table: string; data: unknown }> = [];

    // Mock action page
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: "page-1",
                tenant_id: "t1",
                title: "Quote Form",
                config: { thank_you_message: "Thanks, we'll call you!" },
                published: true,
              },
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
            data: { fb_app_secret: "secret", fb_page_token: "token123" },
            error: null,
          }),
        }),
      }),
    });

    // Mock fields
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                {
                  field_key: "email",
                  field_type: "email",
                  required: true,
                  lead_mapping: { target: "lead_contact", type: "email" },
                },
                {
                  field_key: "budget",
                  field_type: "text",
                  required: false,
                  lead_mapping: { target: "lead_knowledge", key: "budget" },
                },
              ],
              error: null,
            }),
          }),
        }),
      }),
    });

    // Mock lead lookup
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: "lead-1" },
              error: null,
            }),
          }),
        }),
      }),
    });

    // Mock submission insert
    mockFrom.mockReturnValueOnce({
      insert: vi.fn().mockImplementation((data: unknown) => {
        insertCalls.push({ table: "action_submissions", data });
        return {
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: "sub-1" },
              error: null,
            }),
          }),
        };
      }),
    });

    // Mock lead_contacts upsert
    mockFrom.mockReturnValueOnce({
      upsert: vi.fn().mockImplementation((data: unknown) => {
        insertCalls.push({ table: "lead_contacts", data });
        return Promise.resolve({ error: null });
      }),
    });

    // Mock lead_knowledge upsert
    mockFrom.mockReturnValueOnce({
      upsert: vi.fn().mockImplementation((data: unknown) => {
        insertCalls.push({ table: "lead_knowledge", data });
        return Promise.resolve({ error: null });
      }),
    });

    // Mock lead_events insert
    mockFrom.mockReturnValueOnce({
      insert: vi.fn().mockImplementation((data: unknown) => {
        insertCalls.push({ table: "lead_events", data });
        return Promise.resolve({ error: null });
      }),
    });

    mockSendMessage.mockResolvedValue({ messageId: "msg-1" });

    const { POST } = await import("@/app/api/action-pages/[id]/submissions/route");
    const req = new Request("http://localhost/api/action-pages/page-1/submissions", {
      method: "POST",
      body: JSON.stringify({
        psid: "psid-123",
        sig: "valid",
        data: { email: "john@test.com", budget: "$50k" },
      }),
    });

    const res = await POST(req, { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.submission_id).toBe("sub-1");

    // Verify Messenger confirmation was sent
    expect(mockSendMessage).toHaveBeenCalledWith(
      "psid-123",
      { type: "text", text: "Thanks, we'll call you!" },
      "token123"
    );

    // Verify all database operations were performed
    expect(insertCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "action_submissions",
          data: expect.objectContaining({
            tenant_id: "t1",
            action_page_id: "page-1",
            lead_id: "lead-1",
            psid: "psid-123",
          }),
        }),
        expect.objectContaining({
          table: "lead_contacts",
          data: expect.objectContaining({
            tenant_id: "t1",
            lead_id: "lead-1",
            type: "email",
            value: "john@test.com",
            source: "form_submit",
          }),
        }),
        expect.objectContaining({
          table: "lead_knowledge",
          data: expect.objectContaining({
            tenant_id: "t1",
            lead_id: "lead-1",
            key: "budget",
            value: "$50k",
            source: "form_submit",
          }),
        }),
        expect.objectContaining({
          table: "lead_events",
          data: expect.objectContaining({
            tenant_id: "t1",
            lead_id: "lead-1",
            type: "form_submit",
            payload: expect.objectContaining({
              submission_id: "sub-1",
              form_title: "Quote Form",
              action_page_id: "page-1",
            }),
          }),
        }),
      ])
    );
  });

  it("sends default thank you message when config is missing", async () => {
    // Mock action page with no thank_you_message in config
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: "page-1",
                tenant_id: "t1",
                title: "Contact Form",
                config: {},
                published: true,
              },
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
            data: { fb_app_secret: "secret", fb_page_token: "token123" },
            error: null,
          }),
        }),
      }),
    });

    // Mock fields (no required fields)
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          }),
        }),
      }),
    });

    // Mock lead lookup
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: "lead-1" },
              error: null,
            }),
          }),
        }),
      }),
    });

    // Mock submission insert
    mockFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: "sub-1" },
            error: null,
          }),
        }),
      }),
    });

    // Mock lead_events insert
    mockFrom.mockReturnValueOnce({
      insert: vi.fn().mockResolvedValue({ error: null }),
    });

    mockSendMessage.mockResolvedValue({ messageId: "msg-1" });

    const { POST } = await import("@/app/api/action-pages/[id]/submissions/route");
    const req = new Request("http://localhost/api/action-pages/page-1/submissions", {
      method: "POST",
      body: JSON.stringify({
        psid: "psid-123",
        sig: "valid",
        data: {},
      }),
    });

    const res = await POST(req, { params });
    expect(res.status).toBe(200);

    // Verify default message was sent
    expect(mockSendMessage).toHaveBeenCalledWith(
      "psid-123",
      { type: "text", text: "Thanks for submitting!" },
      "token123"
    );
  });

  it("handles missing optional fields gracefully", async () => {
    // Mock action page
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: "page-1",
                tenant_id: "t1",
                title: "Form",
                config: { thank_you_message: "Got it!" },
                published: true,
              },
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
            data: { fb_app_secret: "secret", fb_page_token: "token123" },
            error: null,
          }),
        }),
      }),
    });

    // Mock fields (email required, phone optional)
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                {
                  field_key: "email",
                  field_type: "email",
                  required: true,
                  lead_mapping: { target: "lead_contact", type: "email" },
                },
                {
                  field_key: "phone",
                  field_type: "text",
                  required: false,
                  lead_mapping: { target: "lead_contact", type: "phone" },
                },
              ],
              error: null,
            }),
          }),
        }),
      }),
    });

    // Mock lead lookup
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: "lead-1" },
              error: null,
            }),
          }),
        }),
      }),
    });

    // Mock submission insert
    mockFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: "sub-1" },
            error: null,
          }),
        }),
      }),
    });

    // Mock lead_contacts upsert for email only
    mockFrom.mockReturnValueOnce({
      upsert: vi.fn().mockResolvedValue({ error: null }),
    });

    // Mock lead_events insert
    mockFrom.mockReturnValueOnce({
      insert: vi.fn().mockResolvedValue({ error: null }),
    });

    mockSendMessage.mockResolvedValue({ messageId: "msg-1" });

    const { POST } = await import("@/app/api/action-pages/[id]/submissions/route");
    const req = new Request("http://localhost/api/action-pages/page-1/submissions", {
      method: "POST",
      body: JSON.stringify({
        psid: "psid-123",
        sig: "valid",
        data: { email: "john@test.com" },
      }),
    });

    const res = await POST(req, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
