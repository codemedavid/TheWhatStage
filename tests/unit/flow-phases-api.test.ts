import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveSession } from "@/lib/auth/session";

vi.mock("@/lib/auth/session", () => ({
  resolveSession: vi.fn(),
}));

const mockResolveSession = vi.mocked(resolveSession);

const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockInsert = vi.fn();
const mockSingle = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: mockFrom.mockReturnValue({
      select: mockSelect.mockReturnValue({
        eq: mockEq.mockReturnValue({
          order: mockOrder.mockReturnValue(
            Promise.resolve({
              data: [
                {
                  id: "p1",
                  name: "Greet",
                  order_index: 0,
                  max_messages: 1,
                  system_prompt: "Welcome the lead",
                  tone: "friendly",
                  goals: "Greet the lead",
                  transition_hint: "Move to nurture",
                  action_button_ids: null,
                  image_attachment_ids: [],
                  created_at: "2026-01-01T00:00:00Z",
                },
              ],
              error: null,
            })
          ),
        }),
      }),
      insert: mockInsert.mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: mockSingle.mockReturnValue(
            Promise.resolve({
              data: {
                id: "p-new",
                name: "New Phase",
                order_index: 1,
                max_messages: 3,
                system_prompt: "New prompt",
                tone: "friendly",
                goals: null,
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
  })),
}));

describe("GET /api/bot/phases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockResolveSession.mockResolvedValue(null);

    const { GET } = await import("@/app/api/bot/phases/route");
    const response = await GET(new Request("http://localhost/api/bot/phases"));

    expect(response.status).toBe(401);
  });

  it("returns phases list ordered by order_index", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    const { GET } = await import("@/app/api/bot/phases/route");
    const response = await GET(new Request("http://localhost/api/bot/phases"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.phases).toBeDefined();
    expect(Array.isArray(body.phases)).toBe(true);
    expect(body.phases[0].name).toBe("Greet");
  });
});

describe("POST /api/bot/phases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a new phase", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    const { POST } = await import("@/app/api/bot/phases/route");
    const response = await POST(
      new Request("http://localhost/api/bot/phases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "New Phase",
          order_index: 1,
          max_messages: 3,
          system_prompt: "New prompt",
        }),
      })
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.phase.id).toBe("p-new");
  });

  it("returns 400 for missing required fields", async () => {
    mockResolveSession.mockResolvedValue({ userId: "u1", tenantId: "t1" });

    const { POST } = await import("@/app/api/bot/phases/route");
    const response = await POST(
      new Request("http://localhost/api/bot/phases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "" }),
      })
    );

    expect(response.status).toBe(400);
  });
});
