import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveSession } from "@/lib/auth/session";
import { moveLeadToStage } from "@/lib/leads/move-stage";

const mockFrom = vi.fn();
const mockResolveSession = vi.mocked(resolveSession);
const mockMoveLeadToStage = vi.mocked(moveLeadToStage);

vi.mock("@/lib/auth/session", () => ({
  resolveSession: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock("@/lib/leads/move-stage", () => ({
  moveLeadToStage: vi.fn(),
}));

const params = Promise.resolve({ id: "lead-1" });

// ---------------------------------------------------------------------------
// GET /api/leads/[id]
// ---------------------------------------------------------------------------

describe("GET /api/leads/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns 401 when unauthenticated", async () => {
    mockResolveSession.mockResolvedValue(null);
    const { GET } = await import("@/app/api/leads/[id]/route");
    const res = await GET(new Request("http://localhost/api/leads/lead-1"), { params });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 404 when lead not found", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    // All five parallel queries — lead returns an error
    mockFrom.mockImplementation((table: string) => {
      if (table === "leads") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: { message: "not found" } }),
              }),
            }),
          }),
        };
      }
      // Other tables return empty arrays
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                // For tables without .limit (lead_knowledge):
                then: undefined,
              }),
            }),
          }),
        }),
      };
    });

    const { GET } = await import("@/app/api/leads/[id]/route");
    const res = await GET(new Request("http://localhost/api/leads/lead-1"), { params });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Lead not found");
  });

  it("returns full lead profile with all relations", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    const lead = { id: "lead-1", first_name: "Alice", tenant_id: "t1", stage_id: "s1" };
    const contacts = [{ id: "c1", lead_id: "lead-1", email: "alice@example.com" }];
    const knowledge = [{ id: "k1", lead_id: "lead-1", key: "budget", value: "10000" }];
    const stageHistory = [{ id: "h1", lead_id: "lead-1", to_stage_id: "s1" }];
    const notes = [{ id: "n1", lead_id: "lead-1", body: "Interested in plan A" }];

    mockFrom.mockImplementation((table: string) => {
      if (table === "leads") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: lead, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "lead_contacts") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: contacts, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "lead_knowledge") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: knowledge, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "lead_stage_history") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: stageHistory, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "lead_notes") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: notes, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      return { select: vi.fn() };
    });

    const { GET } = await import("@/app/api/leads/[id]/route");
    const res = await GET(new Request("http://localhost/api/leads/lead-1"), { params });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.lead).toEqual(lead);
    expect(body.contacts).toEqual(contacts);
    expect(body.knowledge).toEqual(knowledge);
    expect(body.stageHistory).toEqual(stageHistory);
    expect(body.notes).toEqual(notes);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/leads/[id]
// ---------------------------------------------------------------------------

describe("PATCH /api/leads/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns 401 when unauthenticated", async () => {
    mockResolveSession.mockResolvedValue(null);
    const { PATCH } = await import("@/app/api/leads/[id]/route");
    const res = await PATCH(
      new Request("http://localhost/api/leads/lead-1", {
        method: "PATCH",
        body: JSON.stringify({ first_name: "Bob" }),
      }),
      { params }
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 400 on invalid input (first_name as number)", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    const { PATCH } = await import("@/app/api/leads/[id]/route");
    const res = await PATCH(
      new Request("http://localhost/api/leads/lead-1", {
        method: "PATCH",
        body: JSON.stringify({ first_name: 12345 }),
      }),
      { params }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid input");
    expect(body.details).toBeDefined();
  });

  it("returns 400 when tags array exceeds max length", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    const { PATCH } = await import("@/app/api/leads/[id]/route");
    const tooManyTags = Array.from({ length: 21 }, (_, i) => `tag${i}`);
    const res = await PATCH(
      new Request("http://localhost/api/leads/lead-1", {
        method: "PATCH",
        body: JSON.stringify({ tags: tooManyTags }),
      }),
      { params }
    );
    expect(res.status).toBe(400);
  });

  it("calls moveLeadToStage when stage_id changes", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    const fromStageId = "00000000-0000-0000-0000-000000000001";
    const toStageId = "00000000-0000-0000-0000-000000000002";
    const updatedLead = { id: "lead-1", first_name: "Alice", stage_id: toStageId };

    // select is called twice: once for current stage lookup, once for final re-fetch
    // We return the current stage on the first call and updatedLead on the second
    let selectCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "leads") {
        return {
          select: vi.fn().mockImplementation(() => {
            selectCallCount += 1;
            const isFirstCall = selectCallCount === 1;
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: isFirstCall ? { stage_id: fromStageId } : updatedLead,
                    error: null,
                  }),
                }),
              }),
            };
          }),
        };
      }
      return {};
    });

    // Capture the moveLeadToStage mock from the freshly imported module
    const moveStageModule = await import("@/lib/leads/move-stage");
    const moveStageSpy = vi.mocked(moveStageModule.moveLeadToStage);
    moveStageSpy.mockResolvedValue(undefined);

    const { PATCH } = await import("@/app/api/leads/[id]/route");
    const res = await PATCH(
      new Request("http://localhost/api/leads/lead-1", {
        method: "PATCH",
        body: JSON.stringify({
          stage_id: toStageId,
          stage_reason: "Qualified by sales agent",
        }),
      }),
      { params }
    );

    expect(moveStageSpy).toHaveBeenCalledWith({
      tenantId: "t1",
      leadId: "lead-1",
      fromStageId,
      toStageId,
      reason: "Qualified by sales agent",
      actorType: "agent",
      actorId: "u1",
    });

    expect(res.status).toBe(200);
  });

  it("does not call moveLeadToStage when stage_id is unchanged", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    const stageId = "00000000-0000-0000-0000-000000000001";
    const lead = { id: "lead-1", first_name: "Alice", stage_id: stageId };

    mockFrom.mockImplementation((table: string) => {
      if (table === "leads") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: lead, error: null }),
              }),
            }),
          }),
        };
      }
      return {};
    });

    // Capture the moveLeadToStage mock from the freshly imported module
    const moveStageModule = await import("@/lib/leads/move-stage");
    const moveStageSpy = vi.mocked(moveStageModule.moveLeadToStage);

    const { PATCH } = await import("@/app/api/leads/[id]/route");
    const res = await PATCH(
      new Request("http://localhost/api/leads/lead-1", {
        method: "PATCH",
        body: JSON.stringify({ stage_id: stageId }),
      }),
      { params }
    );

    expect(moveStageSpy).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it("updates lead fields without stage change", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    const updatedLead = { id: "lead-1", first_name: "Bob", last_name: "Smith", stage_id: "s1" };
    const updateFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "leads") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: updatedLead, error: null }),
              }),
            }),
          }),
          update: updateFn,
        };
      }
      return {};
    });

    const { PATCH } = await import("@/app/api/leads/[id]/route");
    const res = await PATCH(
      new Request("http://localhost/api/leads/lead-1", {
        method: "PATCH",
        body: JSON.stringify({ first_name: "Bob", last_name: "Smith" }),
      }),
      { params }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lead.first_name).toBe("Bob");
    expect(updateFn).toHaveBeenCalledWith({ first_name: "Bob", last_name: "Smith" });
  });
});
