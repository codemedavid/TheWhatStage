import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
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

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/inbox/resume", {
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

/** Build a chained mock for .update().eq().eq() */
function chainUpdateWithTwoEqs() {
  const eqSecond = vi.fn().mockResolvedValue({ data: null, error: null });
  const eqFirst = vi.fn().mockReturnValue({ eq: eqSecond });
  const update = vi.fn().mockReturnValue({ eq: eqFirst });
  return { update };
}

/** Build a chained mock for .insert() that returns directly */
function chainInsert() {
  const insert = vi.fn().mockResolvedValue({ data: null, error: null });
  return { insert };
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
 * 2. conversations -> update
 * 3. escalation_events -> insert
 */
function setupFullHappyPath() {
  const membership = chainMaybeSingle({ data: { tenant_id: "t1", role: "agent" }, error: null });
  const conversationUpdate = chainUpdateWithTwoEqs();
  const escalationInsert = chainInsert();

  mockFrom
    .mockReturnValueOnce(membership)           // tenant_members
    .mockReturnValueOnce(conversationUpdate)   // conversations (update)
    .mockReturnValueOnce(escalationInsert);    // escalation_events (insert)

  return {
    membership,
    conversationUpdate,
    escalationInsert,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/inbox/resume", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "No session" } });

    const { POST } = await import("@/app/api/inbox/resume/route");
    const response = await POST(makeRequest({ conversation_id: "00000000-0000-0000-0000-000000000001" }));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 400 for invalid JSON", async () => {
    setupAuthenticatedUser();

    const { POST } = await import("@/app/api/inbox/resume/route");
    const response = await POST(
      new NextRequest("http://localhost/api/inbox/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not valid json",
      })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid JSON");
  });

  it("returns 400 for missing conversation_id", async () => {
    setupAuthenticatedUser();

    const { POST } = await import("@/app/api/inbox/resume/route");
    const response = await POST(makeRequest({}));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  it("returns 400 for invalid conversation_id UUID", async () => {
    setupAuthenticatedUser();

    const { POST } = await import("@/app/api/inbox/resume/route");
    const response = await POST(makeRequest({ conversation_id: "not-a-uuid" }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  it("returns 403 when user has no tenant membership", async () => {
    setupAuthenticatedUser();
    const noMembership = chainMaybeSingle({ data: null, error: null });
    mockFrom.mockReturnValueOnce(noMembership);

    const { POST } = await import("@/app/api/inbox/resume/route");
    const response = await POST(
      makeRequest({ conversation_id: "00000000-0000-0000-0000-000000000001" })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("No tenant membership");
  });

  it("clears pause state and logs resume event, returns 200", async () => {
    setupAuthenticatedUser();
    const chains = setupFullHappyPath();

    const { POST } = await import("@/app/api/inbox/resume/route");
    const response = await POST(
      makeRequest({ conversation_id: "00000000-0000-0000-0000-000000000001" })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    // Verify conversation update was called with correct fields
    const updateChain = mockFrom.mock.results[1]?.value;
    expect(updateChain?.update).toBeDefined();
    expect(updateChain.update).toHaveBeenCalledWith({
      bot_paused_at: null,
      needs_human: false,
      escalation_reason: null,
      escalation_message_id: null,
    });

    // Verify escalation_events insert was called
    const escalationChain = mockFrom.mock.results[2]?.value;
    expect(escalationChain?.insert).toBeDefined();
    expect(escalationChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: "00000000-0000-0000-0000-000000000001",
        tenant_id: "t1",
        type: "bot_resumed",
        reason: "manual",
        agent_user_id: "u1",
      })
    );
  });
});
