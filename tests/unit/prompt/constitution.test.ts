import { describe, it, expect } from "vitest";
import { buildConstitution } from "@/lib/ai/prompt/constitution";

describe("buildConstitution", () => {
  it("emits a ranked, numbered list", () => {
    const out = buildConstitution();
    expect(out).toMatch(/--- CONSTITUTION/);
    expect(out).toMatch(/^1\./m);
    expect(out).toMatch(/^2\./m);
  });
  it("places factual grounding before persona", () => {
    const out = buildConstitution();
    const factualIdx = out.indexOf("invent");
    const personaIdx = out.indexOf("persona");
    expect(factualIdx).toBeGreaterThan(-1);
    expect(personaIdx).toBeGreaterThan(-1);
    expect(factualIdx).toBeLessThan(personaIdx);
  });
  it("contains zero example phrases", () => {
    const out = buildConstitution();
    expect(out).not.toMatch(/e\.g\./i);
    expect(out).not.toMatch(/example/i);
    // no placeholder templates (allow literal tag names like <untrusted>)
    expect(out).not.toMatch(/<(?!untrusted)[^>]+>/); // placeholder-style, not tag names
  });
});
