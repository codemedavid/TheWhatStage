// tests/unit/ai-builder-propose-api.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/funnel-builder", () => ({
  proposeFunnelStructure: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({
  requireTenantSession: vi.fn().mockResolvedValue({ tenantId: "t1", userId: "u1" }),
}));

const fakeFrom = vi.fn(() => ({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockResolvedValue({
    data: [{ id: "p-sales", type: "sales", title: "Sales", published: true }],
    error: null,
  }),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: fakeFrom })),
}));

import { POST } from "@/app/api/campaigns/ai-builder/propose/route";
import { proposeFunnelStructure } from "@/lib/ai/funnel-builder";
import { requireTenantSession } from "@/lib/auth/session";

beforeEach(() => {
  vi.mocked(proposeFunnelStructure).mockReset();
  vi.mocked(requireTenantSession).mockResolvedValue({ tenantId: "t1", userId: "u1" });
});

describe("POST /api/campaigns/ai-builder/propose", () => {
  it("returns the proposal", async () => {
    vi.mocked(proposeFunnelStructure).mockResolvedValue({
      action: "propose",
      funnels: [{ actionPageId: "p-sales" }],
      topLevelRules: [],
    });

    const req = new Request("http://x/api/campaigns/ai-builder/propose", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kickoff: "sell my course" }),
    });
    const res = await POST(req as any);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.action).toBe("propose");
    expect(body.funnels).toHaveLength(1);
  });

  it("400s when kickoff is empty", async () => {
    const req = new Request("http://x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kickoff: "" }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it("401s when session is missing", async () => {
    vi.mocked(requireTenantSession).mockRejectedValue(new Error("UNAUTHORIZED"));

    const req = new Request("http://x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kickoff: "sell my course" }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it("409s when no published action pages exist", async () => {
    fakeFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    });

    const req = new Request("http://x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kickoff: "sell my course" }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(409);
  });
});
