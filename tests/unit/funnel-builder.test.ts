// tests/unit/funnel-builder.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/llm-client", () => ({
  generateResponse: vi.fn(),
}));
import { generateResponse } from "@/lib/ai/llm-client";
import { proposeFunnelStructure } from "@/lib/ai/funnel-builder";

const pages = [
  { id: "p-sales", type: "sales", title: "Coaching Sales" },
  { id: "p-qual", type: "qualification", title: "Coaching Qualification" },
  { id: "p-call", type: "calendar", title: "Discovery Call" },
];

beforeEach(() => vi.mocked(generateResponse).mockReset());

describe("proposeFunnelStructure", () => {
  it("returns ordered action page IDs", async () => {
    vi.mocked(generateResponse).mockResolvedValue({
      content: JSON.stringify({
        action: "propose",
        funnels: [{ action_page_id: "p-qual" }, { action_page_id: "p-call" }],
        top_level_rules: ["Be concise."],
      }),
    } as any);

    const result = await proposeFunnelStructure({
      kickoff: "Sell coaching to people who qualify",
      availablePages: pages,
    });

    expect(result.action).toBe("propose");
    if (result.action === "propose") {
      expect(result.funnels.map((f) => f.actionPageId)).toEqual(["p-qual", "p-call"]);
      expect(result.topLevelRules).toContain("Be concise.");
    }
  });

  it("can ask a clarifying question", async () => {
    vi.mocked(generateResponse).mockResolvedValue({
      content: JSON.stringify({ action: "question", question: "What's the offer?" }),
    } as any);
    const result = await proposeFunnelStructure({ kickoff: "uhh", availablePages: pages });
    expect(result.action).toBe("question");
  });

  it("rejects proposals referencing unknown page IDs", async () => {
    vi.mocked(generateResponse).mockResolvedValue({
      content: JSON.stringify({
        action: "propose",
        funnels: [{ action_page_id: "p-nope" }],
        top_level_rules: [],
      }),
    } as any);
    await expect(
      proposeFunnelStructure({ kickoff: "x", availablePages: pages })
    ).rejects.toThrow(/unknown action page/i);
  });

  it("rejects proposals with more than 3 funnels", async () => {
    vi.mocked(generateResponse).mockResolvedValue({
      content: JSON.stringify({
        action: "propose",
        funnels: [
          { action_page_id: "p-sales" },
          { action_page_id: "p-qual" },
          { action_page_id: "p-call" },
          { action_page_id: "p-sales" },
        ],
        top_level_rules: [],
      }),
    } as any);
    await expect(
      proposeFunnelStructure({ kickoff: "x", availablePages: pages })
    ).rejects.toThrow(/at most 3/i);
  });
});
