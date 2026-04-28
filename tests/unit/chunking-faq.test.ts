import { describe, it, expect } from "vitest";
import { chunkFaqAtomic } from "@/lib/ai/chunking";

describe("chunkFaqAtomic", () => {
  it("emits exactly one chunk per Q+A pair", () => {
    const chunks = chunkFaqAtomic([
      { question: "What's the price?", answer: "Starts at PHP 4,999." },
      { question: "Do you ship to PH?", answer: "Yes, nationwide." },
    ]);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].content).toBe("Q: What's the price?\nA: Starts at PHP 4,999.");
    expect(chunks[0].metadata.qa_question).toBe("What's the price?");
  });

  it("never splits a long answer across chunks", () => {
    const longAnswer = "A".repeat(5000);
    const chunks = chunkFaqAtomic([{ question: "Q?", answer: longAnswer }]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content.length).toBeGreaterThan(5000);
  });

  it("skips empty pairs", () => {
    const chunks = chunkFaqAtomic([{ question: "", answer: "" }]);
    expect(chunks).toHaveLength(0);
  });
});
