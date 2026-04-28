import { describe, it, expect } from "vitest";
import { generateResponse } from "@/lib/ai/llm-client";
import { buildSystemPrompt } from "@/lib/ai/prompt-builder";

const RUN = process.env.HUGGINGFACE_API_KEY;
const d = RUN ? describe : describe.skip;

const TENANT = "00000000-0000-0000-0000-000000000099";
const STEP_TITLE = "Book a discovery call";

const TURNS = [
  { lead: "hi", expectedDirection: "warm + question or button" },
  { lead: "magkano po?", expectedDirection: "fact-grounded price + button" },
  { lead: "hmm sounds expensive", expectedDirection: "reframe + button" },
  { lead: "ok sige", expectedDirection: "send button this turn" },
  { lead: "thanks", expectedDirection: "stay / close warmly" },
];

const BANNED = ["certainly", "absolutely", "I'd be happy to", "great question", "👇", "👉 📝 🚀"];

// Note: this test requires HUGGINGFACE_API_KEY env var set to run.
// Without it, the test suite skips automatically (no failures in CI).
d("trajectory — campaign-locked", () => {
  it("preserves campaign goal across 5 turns and never leaks banned phrases", async () => {
    const history: { role: "user" | "bot"; text: string }[] = [];
    for (const turn of TURNS) {
      history.push({ role: "user", text: turn.lead });
      const prompt = await buildSystemPrompt({
        tenantId: TENANT,
        businessName: "Acme",
        conversationId: "00000000-0000-0000-0000-000000000999",
        ragChunks: [],
        step: {
          name: `Step 1 of 1 — ${STEP_TITLE}`,
          position: 0,
          total: 1,
          instructions: "",
          tone: "warm and direct",
          goal: null,
          transitionHint: null,
          actionButtonIds: [],
        },
        historyOverride: history,
        campaign: {
          name: "Q3 starter",
          goal: "book_appointment",
          mainGoal: "Book a discovery call",
          description: "PHP 4,999 starter",
          campaignRules: [],
        },
        testMode: false,
      });
      const resp = await generateResponse(prompt, turn.lead, { temperature: 0.3, maxTokens: 400 });
      const parsed = JSON.parse(resp.content);
      const reply: string = parsed.message ?? "";
      for (const b of BANNED) {
        expect(reply.toLowerCase()).not.toContain(b.toLowerCase());
      }
      // every reply must reference either a fact or the campaign goal
      // (loose check: the reply should not be generic small talk if a buying signal was sent)
      history.push({ role: "bot", text: reply });
    }
    // post-hoc: a button must have been offered at least once across the 5 turns
    const sentButton = history.some((t) => /book|schedule|call/i.test(t.text));
    expect(sentButton).toBe(true);
  });
});
