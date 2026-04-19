import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockSendMessage = vi.fn();

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

vi.mock("@/lib/fb/send", () => ({
  sendMessage: (...args: unknown[]) => mockSendMessage(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/inbox/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Build a chained mock for a single .from() call that ends with .maybeSingle() */
function chainMaybeSingle(result: unknown) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eqSecond = vi.fn().mockReturnValue({ maybeSingle });
  const eqFirst = vi.fn().mockReturnValue({ eq: eqSecond, maybeSingle });
  const select = vi.fn().mockReturnValue({ eq: eqFirst });
  return { select };
}

/** Build a chained mock for .insert().select().single() */
function chainInsertSingle(result: unknown) {
  const single = vi.fn().mockResolvedValue(result);
  const selectAfterInsert = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select: selectAfterInsert });
  return { insert };
}

/** Build a chained mock for .insert() that returns directly */
function chainInsert() {
  const insert = vi.fn().mockResolvedValue({ data: null, error: null });
  return { insert };
}

/** Build a chained mock for .update().eq() */
function chainUpdate() {
  const eq = vi.fn().mockResolvedValue({ data: null, error: null });
  const update = vi.fn().mockReturnValue({ eq });
  return { update };
}

function setupAuthenticatedUser(userId = "u1") {
  mockGetUser.mockResolvedValue({
    data: { user: { id: userId } },
    error: null,
  });
}

/**
 * Set up all the .from() calls in order:
 * 1. tenant_members -> membership
 * 2. conversations -> conversation
 * 3. leads -> lead
 * 4. tenants -> tenant
 * 5. messages -> insert
 * 6. lead_events -> insert
 * 7. conversations -> update
 * 8. escalation_events -> insert (only if bot was not paused)
 */
function setupFullHappyPath(opts: { botPausedAt?: string | null } = {}) {
  const botPausedAt = opts.botPausedAt ?? null;

  const membership = chainMaybeSingle({ data: { tenant_id: "t1", role: "agent" }, error: null });
  const conversation = chainMaybeSingle({
    data: { id: "conv-1", lead_id: "lead-1", bot_paused_at: botPausedAt, tenant_id: "t1" },
    error: null,
  });
  const lead = chainMaybeSingle({ data: { psid: "psid-123" }, error: null });
  const tenant = chainMaybeSingle({ data: { fb_page_token: "fb-token-abc" }, error: null });
  const messagesInsert = chainInsertSingle({ data: { id: "msg-stored-1" }, error: null });
  const leadEventsInsert = chainInsert();
  const conversationUpdate = chainUpdate();
  const escalationInsert = chainInsert();

  mockFrom
    .mockReturnValueOnce(membership)    // tenant_members
    .mockReturnValueOnce(conversation)  // conversations (select)
    .mockReturnValueOnce(lead)          // leads
    .mockReturnValueOnce(tenant)        // tenants
    .mockReturnValueOnce(messagesInsert)// messages (insert)
    .mockReturnValueOnce(leadEventsInsert) // lead_events (insert)
    .mockReturnValueOnce(conversationUpdate) // conversations (update)
    .mockReturnValueOnce(escalationInsert); // escalation_events (insert)

  return {
    membership,
    conversation,
    lead,
    tenant,
    messagesInsert,
    leadEventsInsert,
    conversationUpdate,
    escalationInsert,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/inbox/send", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
    mockSendMessage.mockReset();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "No session" } });

    const { POST } = await import("@/app/api/inbox/send/route");
    const response = await POST(makeRequest({ conversation_id: "00000000-0000-0000-0000-000000000001", message: "hi" }));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 400 when neither message nor image_url provided", async () => {
    setupAuthenticatedUser();

    const { POST } = await import("@/app/api/inbox/send/route");
    const response = await POST(
      makeRequest({ conversation_id: "00000000-0000-0000-0000-000000000001" })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  it("sends text message via Messenger and returns 200", async () => {
    setupAuthenticatedUser();
    setupFullHappyPath({ botPausedAt: "2026-04-19T09:00:00Z" });
    mockSendMessage.mockResolvedValue({ messageId: "mid.fb-123" });

    const { POST } = await import("@/app/api/inbox/send/route");
    const response = await POST(
      makeRequest({ conversation_id: "00000000-0000-0000-0000-000000000001", message: "Hello lead!" })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.messageId).toBe("mid.fb-123");

    // Verify sendMessage was called with correct args
    expect(mockSendMessage).toHaveBeenCalledWith(
      "psid-123",
      { type: "text", text: "Hello lead!" },
      "fb-token-abc"
    );
  });

  it("auto-pauses bot on first human reply (when bot_paused_at is null)", async () => {
    setupAuthenticatedUser();
    const chains = setupFullHappyPath({ botPausedAt: null });
    mockSendMessage.mockResolvedValue({ messageId: "mid.fb-456" });

    const { POST } = await import("@/app/api/inbox/send/route");
    const response = await POST(
      makeRequest({ conversation_id: "00000000-0000-0000-0000-000000000001", message: "I will help you" })
    );

    expect(response.status).toBe(200);

    // The 7th .from() call should be conversations update with bot_paused_at
    const updateCall = mockFrom.mock.results[6]; // conversations update
    const updateChain = mockFrom.mock.results[6]?.value;
    expect(updateChain?.update).toBeDefined();
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        bot_paused_at: expect.any(String),
        last_message_at: expect.any(String),
      })
    );

    // The 8th .from() call should be escalation_events insert
    const escalationChain = mockFrom.mock.results[7]?.value;
    expect(escalationChain?.insert).toBeDefined();
    expect(escalationChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: "00000000-0000-0000-0000-000000000001",
        type: "agent_took_over",
        agent_user_id: "u1",
      })
    );
  });
});
