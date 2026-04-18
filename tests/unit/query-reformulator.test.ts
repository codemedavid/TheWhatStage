import { describe, it, expect } from "vitest";
import { reformulateQuery } from "@/lib/ai/query-reformulator";

describe("reformulateQuery", () => {
  it("strips common filler words", () => {
    const result = reformulateQuery("Can you please tell me about the pricing?");
    expect(result).not.toContain("can");
    expect(result).not.toContain("you");
    expect(result).not.toContain("please");
    expect(result).toContain("pricing");
  });

  it("removes question marks and extra whitespace", () => {
    const result = reformulateQuery("What is the price???");
    expect(result).not.toContain("?");
    expect(result).not.toMatch(/\s{2,}/);
  });

  it("preserves key content words", () => {
    const result = reformulateQuery("How much does the premium widget cost?");
    expect(result).toContain("premium");
    expect(result).toContain("widget");
    expect(result).toContain("cost");
  });

  it("returns the original query trimmed if all words are filler", () => {
    const result = reformulateQuery("can you please do it?");
    expect(result.length).toBeGreaterThan(0);
  });

  it("handles empty input", () => {
    expect(reformulateQuery("")).toBe("");
    expect(reformulateQuery("   ")).toBe("");
  });

  it("lowercases the output", () => {
    const result = reformulateQuery("Tell Me About PRODUCTS");
    expect(result).toBe(result.toLowerCase());
  });
});
