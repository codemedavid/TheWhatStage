// tests/unit/prompt/voice-rules.test.ts
import { describe, it, expect } from "vitest";
import { buildVoiceRules } from "@/lib/ai/prompt/voice-rules";

describe("buildVoiceRules", () => {
  it("contains no quoted example phrases", () => {
    const out = buildVoiceRules({ tenantPersona: "warm and direct" });
    // no double-quoted user-facing strings (we only allow short rule labels)
    const quoted = [...out.matchAll(/"([^"]{3,})"/g)].map((m) => m[1]);
    // permit policy markers like "AI tells" but reject anything that looks like a sample reply
    for (const q of quoted) {
      expect(q.length).toBeLessThan(30);
    }
  });
  it("contains no '👇' or fixed emoji set", () => {
    const out = buildVoiceRules({ tenantPersona: "x" });
    expect(out).not.toContain("👇");
    expect(out).not.toContain("👉 📝 🚀");
  });
  it("contains a mirror-the-lead rule", () => {
    const out = buildVoiceRules({ tenantPersona: "x" });
    expect(out.toLowerCase()).toContain("mirror");
  });
});
