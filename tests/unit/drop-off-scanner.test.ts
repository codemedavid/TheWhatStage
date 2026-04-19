import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: mockFrom })),
}));

describe("POST /api/cron/drop-off-scanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("rejects requests without cron secret", async () => {
    const { POST } = await import("@/app/api/cron/drop-off-scanner/route");
    const req = new Request("http://localhost/api/cron/drop-off-scanner", {
      method: "POST",
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
