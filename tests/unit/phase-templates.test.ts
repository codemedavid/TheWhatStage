import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDefaultPhases, seedPhaseTemplates } from "@/lib/ai/phase-templates";

const mockInsert = vi.fn().mockReturnValue({ error: null });
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: mockInsert,
    })),
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getDefaultPhases", () => {
  it("returns 5 phases for ecommerce", () => {
    const phases = getDefaultPhases("ecommerce");

    expect(phases).toHaveLength(5);
    expect(phases[0].name).toBe("Greet");
    expect(phases[0].order_index).toBe(0);
    expect(phases[4].name).toBe("Follow-up");
    expect(phases[4].order_index).toBe(4);
  });

  it("returns 5 phases for real_estate", () => {
    const phases = getDefaultPhases("real_estate");

    expect(phases).toHaveLength(5);
    expect(phases[0].name).toBe("Greet");
    expect(phases[1].name).toBe("Understand Needs");
    expect(phases[4].name).toBe("Schedule Viewing");
  });

  it("returns 5 phases for digital_product", () => {
    const phases = getDefaultPhases("digital_product");

    expect(phases).toHaveLength(5);
    expect(phases[1].name).toBe("Educate");
    expect(phases[4].name).toBe("Close");
  });

  it("returns 5 phases for services", () => {
    const phases = getDefaultPhases("services");

    expect(phases).toHaveLength(5);
    expect(phases[1].name).toBe("Nurture");
    expect(phases[2].name).toBe("Qualify");
    expect(phases[3].name).toBe("Pitch");
    expect(phases[4].name).toBe("Close");
  });

  it("all phases have required fields", () => {
    const businessTypes = ["ecommerce", "real_estate", "digital_product", "services"] as const;

    for (const type of businessTypes) {
      const phases = getDefaultPhases(type);
      for (const phase of phases) {
        expect(phase.name).toBeTruthy();
        expect(typeof phase.order_index).toBe("number");
        expect(typeof phase.max_messages).toBe("number");
        expect(phase.max_messages).toBeGreaterThan(0);
        expect(phase.system_prompt).toBeTruthy();
        expect(phase.tone).toBeTruthy();
        expect(phase.goals).toBeTruthy();
        expect(phase.transition_hint).toBeTruthy();
      }
    }
  });

  it("phases have sequential order_index starting from 0", () => {
    const phases = getDefaultPhases("services");

    phases.forEach((phase, i) => {
      expect(phase.order_index).toBe(i);
    });
  });

  it("first phase always has max_messages of 1", () => {
    const businessTypes = ["ecommerce", "real_estate", "digital_product", "services"] as const;

    for (const type of businessTypes) {
      const phases = getDefaultPhases(type);
      expect(phases[0].max_messages).toBe(1);
    }
  });
});

describe("seedPhaseTemplates", () => {
  it("inserts phases into bot_flow_phases with tenant_id", async () => {
    await seedPhaseTemplates("tenant-1", "services");

    expect(mockInsert).toHaveBeenCalledOnce();
    const insertedRows = mockInsert.mock.calls[0][0];
    expect(insertedRows).toHaveLength(5);
    expect(insertedRows[0].tenant_id).toBe("tenant-1");
    expect(insertedRows[0].name).toBe("Greet");
  });

  it("throws when insert fails", async () => {
    mockInsert.mockReturnValueOnce({ error: { message: "DB error" } });

    await expect(seedPhaseTemplates("tenant-1", "ecommerce")).rejects.toThrow(
      "Failed to seed phase templates: DB error"
    );
  });
});
