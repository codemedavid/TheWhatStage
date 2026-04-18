import { describe, it, expect } from "vitest";
import { formatFaqChunk } from "@/lib/ai/processors/faq";

describe("formatFaqChunk", () => {
  it("formats a Q+A pair into a single chunk string", () => {
    const result = formatFaqChunk("What are your hours?", "We are open 9-5 Mon-Fri.");
    expect(result).toBe("Q: What are your hours?\nA: We are open 9-5 Mon-Fri.");
  });

  it("trims whitespace from question and answer", () => {
    const result = formatFaqChunk("  Where are you?  ", "  123 Main St  ");
    expect(result).toBe("Q: Where are you?\nA: 123 Main St");
  });

  it("throws if question is empty", () => {
    expect(() => formatFaqChunk("", "Some answer")).toThrow("FAQ question cannot be empty");
  });

  it("throws if answer is empty", () => {
    expect(() => formatFaqChunk("Some question", "  ")).toThrow("FAQ answer cannot be empty");
  });
});
