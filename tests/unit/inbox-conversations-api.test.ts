import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockMembershipChain = {
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
};
const mockConversationsChain = {
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
};

// Two separate from() calls: tenant_members and conversations
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
    })
  ),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupMembershipChain(membershipResult: unknown) {
  const maybeSingle = vi.fn().mockResolvedValue(membershipResult);
  const eqUser = vi.fn().mockReturnValue({ maybeSingle });
  const selectMembership = vi.fn().mockReturnValue({ eq: eqUser });
  return selectMembership;
}

function setupConversationsChain(conversationsResult: unknown) {
  const limit = vi.fn().mockResolvedValue(conversationsResult);
  const order2 = vi.fn().mockReturnValue({ limit });
  const order1 = vi.fn().mockReturnValue({ order: order2 });
  const eqTenant = vi.fn().mockReturnValue({ order: order1 });
  const selectConvs = vi.fn().mockReturnValue({ eq: eqTenant });
  return selectConvs;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/inbox/conversations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "No session" } });

    const { GET } = await import("@/app/api/inbox/conversations/route");
    const response = await GET();

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when user has no tenant membership", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1" } },
      error: null,
    });

    const selectMembership = setupMembershipChain({ data: null, error: null });
    mockFrom.mockReturnValue({ select: selectMembership });

    const { GET } = await import("@/app/api/inbox/conversations/route");
    const response = await GET();

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("No tenant membership");
  });

  it("returns conversations sorted by escalation status with correct shape", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1" } },
      error: null,
    });

    const sampleConversations = [
      {
        id: "conv-1",
        lead_id: "lead-1",
        last_message_at: "2026-04-19T10:00:00Z",
        needs_human: true,
        bot_paused_at: "2026-04-19T09:55:00Z",
        escalation_reason: "User requested human",
        escalation_message_id: "msg-abc",
        leads: { fb_name: "Alice", fb_profile_pic: "https://example.com/alice.jpg" },
        messages: [
          { text: "Hello, I need help", created_at: "2026-04-19T10:00:00Z" },
          { text: "Is anyone there?", created_at: "2026-04-19T09:58:00Z" },
        ],
      },
      {
        id: "conv-2",
        lead_id: "lead-2",
        last_message_at: "2026-04-18T08:00:00Z",
        needs_human: false,
        bot_paused_at: null,
        escalation_reason: null,
        escalation_message_id: null,
        leads: { fb_name: "Bob", fb_profile_pic: null },
        messages: [{ text: "Thanks!", created_at: "2026-04-18T08:00:00Z" }],
      },
    ];

    // First call: tenant_members
    const selectMembership = setupMembershipChain({
      data: { tenant_id: "t1", role: "owner" },
      error: null,
    });

    // Second call: conversations
    const selectConvs = setupConversationsChain({
      data: sampleConversations,
      error: null,
    });

    mockFrom
      .mockReturnValueOnce({ select: selectMembership })
      .mockReturnValueOnce({ select: selectConvs });

    const { GET } = await import("@/app/api/inbox/conversations/route");
    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.conversations).toBeDefined();
    expect(Array.isArray(body.conversations)).toBe(true);
    expect(body.conversations).toHaveLength(2);

    // First conversation — escalated
    const first = body.conversations[0];
    expect(first.id).toBe("conv-1");
    expect(first.leadId).toBe("lead-1");
    expect(first.leadName).toBe("Alice");
    expect(first.leadPic).toBe("https://example.com/alice.jpg");
    expect(first.needsHuman).toBe(true);
    expect(first.escalationReason).toBe("User requested human");
    expect(first.escalationMessageId).toBe("msg-abc");
    // lastMessage should be the most recent message
    expect(first.lastMessage).toBe("Hello, I need help");
    expect(first.lastMessageAt).toBe("2026-04-19T10:00:00Z");

    // Second conversation — normal
    const second = body.conversations[1];
    expect(second.id).toBe("conv-2");
    expect(second.leadId).toBe("lead-2");
    expect(second.leadName).toBe("Bob");
    expect(second.leadPic).toBeNull();
    expect(second.needsHuman).toBe(false);
    expect(second.botPausedAt).toBeNull();
    expect(second.escalationReason).toBeNull();
    expect(second.escalationMessageId).toBeNull();
    expect(second.lastMessage).toBe("Thanks!");
  });

  it("returns 500 when database query fails", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1" } },
      error: null,
    });

    const selectMembership = setupMembershipChain({
      data: { tenant_id: "t1", role: "owner" },
      error: null,
    });

    const selectConvs = setupConversationsChain({
      data: null,
      error: { message: "DB error" },
    });

    mockFrom
      .mockReturnValueOnce({ select: selectMembership })
      .mockReturnValueOnce({ select: selectConvs });

    const { GET } = await import("@/app/api/inbox/conversations/route");
    const response = await GET();

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Failed to fetch conversations");
  });
});
