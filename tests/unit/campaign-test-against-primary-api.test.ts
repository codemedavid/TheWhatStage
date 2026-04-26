import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveSession } from "@/lib/auth/session";

vi.mock("@/lib/auth/session", () => ({
  resolveSession: vi.fn(),
}));

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: mockFrom })),
}));

const mockResolveSession = vi.mocked(resolveSession);
const params = Promise.resolve({ id: "draft-1" });

describe("POST /api/campaigns/[id]/test-against-primary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns 401 when unauthenticated", async () => {
    mockResolveSession.mockResolvedValue(null);

    const { POST } = await import("@/app/api/campaigns/[id]/test-against-primary/route");
    const req = new Request("http://localhost/api/campaigns/draft-1/test-against-primary", {
      method: "POST",
    });

    const res = await POST(req, { params });
    expect(res.status).toBe(401);
  });

  it("activates the draft and creates a running 50/50 experiment", async () => {
    mockResolveSession.mockResolvedValue({ userId: "user-1", tenantId: "tenant-1" });

    const experiment = { id: "exp-1", name: "Primary vs AI Draft", status: "running" };
    const updateDraft = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
    const insertExperiment = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: experiment, error: null }),
      }),
    });
    const insertVariants = vi.fn().mockResolvedValue({ error: null });
    let campaignLookupCount = 0;

    mockFrom.mockImplementation((table: string) => {
      if (table === "campaigns") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockImplementation(async () => {
                  campaignLookupCount += 1;
                  if (campaignLookupCount === 1) {
                    return {
                      data: { id: "draft-1", name: "AI Draft", is_primary: false, status: "draft" },
                      error: null,
                    };
                  }
                  return {
                    data: { id: "primary-1", name: "Primary", is_primary: true, status: "active" },
                    error: null,
                  };
                }),
              }),
            }),
          }),
          update: updateDraft,
        };
      }
      if (table === "experiments") {
        return { insert: insertExperiment };
      }
      if (table === "experiment_campaigns") {
        return { insert: insertVariants };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const { POST } = await import("@/app/api/campaigns/[id]/test-against-primary/route");
    const req = new Request("http://localhost/api/campaigns/draft-1/test-against-primary", {
      method: "POST",
    });

    const res = await POST(req, { params });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.experiment.id).toBe("exp-1");
    expect(updateDraft).toHaveBeenCalledWith({ status: "active", updated_at: expect.any(String) });
    expect(insertVariants).toHaveBeenCalledWith([
      { experiment_id: "exp-1", campaign_id: "primary-1", weight: 50 },
      { experiment_id: "exp-1", campaign_id: "draft-1", weight: 50 },
    ]);
  });

  it("returns 400 when no primary campaign exists", async () => {
    mockResolveSession.mockResolvedValue({ userId: "user-1", tenantId: "tenant-1" });
    let campaignLookupCount = 0;

    mockFrom.mockImplementation((table: string) => {
      if (table === "campaigns") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockImplementation(async () => {
                  campaignLookupCount += 1;
                  if (campaignLookupCount === 1) {
                    return {
                      data: { id: "draft-1", name: "AI Draft", is_primary: false, status: "draft" },
                      error: null,
                    };
                  }
                  return { data: null, error: { message: "No rows" } };
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const { POST } = await import("@/app/api/campaigns/[id]/test-against-primary/route");
    const req = new Request("http://localhost/api/campaigns/draft-1/test-against-primary", {
      method: "POST",
    });

    const res = await POST(req, { params });
    expect(res.status).toBe(400);
  });
});
