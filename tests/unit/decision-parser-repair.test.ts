import { describe, it, expect } from "vitest";
import { parseDecision } from "@/lib/ai/decision-parser";

describe("decision parser — repair", () => {
  it("repairs trailing-comma JSON", () => {
    const out = parseDecision('{"message":"hi","cited_chunks":[1,2,],}');
    expect(out.message).toBe("hi");
  });

  it("repairs missing quotes around keys", () => {
    const out = parseDecision('{message:"hello",funnel_action:"stay",confidence:0.8}');
    expect(out.message).toBe("hello");
    expect(out.phaseAction).toBe("stay");
  });

  it("repairs unclosed brackets", () => {
    const out = parseDecision('{"message":"test","funnel_action":"advance"');
    expect(out.message).toBe("test");
    expect(out.phaseAction).toBe("advance");
  });

  it("falls back to extraction when repair fails completely", () => {
    const out = parseDecision("totally invalid json");
    // Should default to escalate with empty message
    expect(out.phaseAction).toBe("escalate");
    expect(out.message).toBe("");
  });
});
