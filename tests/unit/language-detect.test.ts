import { describe, it, expect } from "vitest";
import { detectLanguage } from "@/lib/ai/language-detect";

describe("detectLanguage", () => {
  it("returns 'en' for plain English", () => {
    expect(detectLanguage("how much does this cost")).toBe("en");
  });

  it("returns 'tl' for plain Tagalog", () => {
    expect(detectLanguage("magkano po ba ito at saan available")).toBe("tl");
  });

  it("returns 'taglish' for code-switched messages", () => {
    expect(detectLanguage("magkano po yung small size")).toBe("taglish");
  });

  it("returns 'other' for short/empty input", () => {
    expect(detectLanguage("")).toBe("other");
    expect(detectLanguage("ok")).toBe("other");
  });
});
