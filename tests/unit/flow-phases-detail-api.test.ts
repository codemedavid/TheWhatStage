import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveSession } from "@/lib/auth/session";

vi.mock("@/lib/auth/session", () => ({
  resolveSession: vi.fn(),
}));

const mockResolveSession = vi.mocked(resolveSession);

const mockFrom = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: mockFrom.mockReturnValue({
      update: mockUpdate.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockReturnValue(
                Promise.resolve({
                  data: {
                    id: "p1",
                    name: "Updated Phase",
                    order_index: 0,
                    max_messages: 5,
                    system_prompt: "Updated prompt",
                    tone: "professional",
                    goals: "Updated goals",
                    transition_hint: null,
                    action_button_ids: null,
                    image_attachment_ids: [],
                    created_at: "2026-01-01T00:00:00Z",
                  },
                  error: null,
                })
              ),
            }),
          }),
        }),
      }),
      delete: mockDelete.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue(
            Promise.resolve({ error: null })
          ),
        }),
      }),
    }),
  })),
}));

describe("PATCH /api/bot/phases/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockResolveSession.mockResolvedValue(null);

    const { PATCH } = await import("@/app/api/bot/phases/[id]/route");
    const response = await PATCH(
      new Request("http://localhost/api/bot/phases/p1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated" }),
      }),
      { params: Promise.resolve({ id: "p1" }) }
    );

    expect(response.status).toBe(401);
  });

  it("updates a phase", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    const { PATCH } = await import("@/app/api/bot/phases/[id]/route");
    const response = await PATCH(
      new Request("http://localhost/api/bot/phases/p1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated Phase", max_messages: 5 }),
      }),
      { params: Promise.resolve({ id: "p1" }) }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.phase.name).toBe("Updated Phase");
  });
});

describe("DELETE /api/bot/phases/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes a phase", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    const { DELETE: deleteFn } = await import("@/app/api/bot/phases/[id]/route");
    const response = await deleteFn(
      new Request("http://localhost/api/bot/phases/p1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "p1" }) }
    );

    expect(response.status).toBe(204);
  });
});
