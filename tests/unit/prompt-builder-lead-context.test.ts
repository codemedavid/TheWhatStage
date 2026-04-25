import { describe, it, expect } from "vitest";

describe("buildLeadContext", () => {
  it("returns empty section when no lead data", async () => {
    const { buildLeadContext } = await import("@/lib/ai/prompt-builder");
    const result = buildLeadContext({ contacts: [], knowledge: [], submissions: [] });
    expect(result).toContain("No lead-specific data");
  });

  it("includes contacts grouped by type", async () => {
    const { buildLeadContext } = await import("@/lib/ai/prompt-builder");
    const result = buildLeadContext({
      contacts: [
        { type: "email", value: "john@example.com", is_primary: true },
        { type: "email", value: "j@work.com", is_primary: false },
        { type: "phone", value: "+639123456789", is_primary: true },
      ],
      knowledge: [],
      submissions: [],
    });
    expect(result).toContain("john@example.com");
    expect(result).toContain("j@work.com");
    expect(result).toContain("+639123456789");
    expect(result).toContain("primary");
  });

  it("includes knowledge key-value pairs", async () => {
    const { buildLeadContext } = await import("@/lib/ai/prompt-builder");
    const result = buildLeadContext({
      contacts: [],
      knowledge: [
        { key: "budget", value: "$50k" },
        { key: "timeline", value: "3 months" },
      ],
      submissions: [],
    });
    expect(result).toContain("budget");
    expect(result).toContain("$50k");
    expect(result).toContain("timeline");
    expect(result).toContain("3 months");
  });

  it("includes recent form submissions", async () => {
    const { buildLeadContext } = await import("@/lib/ai/prompt-builder");
    const result = buildLeadContext({
      contacts: [],
      knowledge: [],
      submissions: [
        { form_title: "Quote Form", submitted_at: "2026-04-25", data: { budget: "$50k", name: "John" } },
      ],
    });
    expect(result).toContain("Quote Form");
    expect(result).toContain("budget");
  });
});
