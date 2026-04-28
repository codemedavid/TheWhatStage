// tests/integration/prompt-no-copy-leak.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { globSync } from "glob";
import path from "path";

const BANNED_LITERALS = [
  // Copy-bait emoji set
  "👉 📝 🚀 ✅ 💬 📊",
  // Shape templates with placeholders
  "<outcome tied to the lead's specific words",
  "<one-line factual answer>",
  "<next playbook beat phrased as a question>",
  // Mandatory click cue
  "click here 👇",
  "👇",
  // Shape descriptor headers
  "Shape (illustrative",
  "Shape of a high-converting",
];

// Scan every source file that contributes to the system prompt.
// Use forward-slash globs so it works on every platform.
const PROMPT_SOURCE_GLOBS = [
  "src/lib/ai/prompt-builder.ts",
  "src/lib/ai/prompt/**/*.ts",
  "src/lib/ai/step-context.ts",
];

describe("system prompt — no copy-bait (source-level)", () => {
  it("contains zero banned literal phrases or shape templates in any prompt source file", () => {
    const projectRoot = path.resolve(__dirname, "../..");
    const files = PROMPT_SOURCE_GLOBS.flatMap((pattern) =>
      globSync(pattern, { cwd: projectRoot, absolute: true }),
    );
    expect(files.length).toBeGreaterThan(0);

    const hits: { file: string; banned: string }[] = [];
    for (const file of files) {
      const content = readFileSync(file, "utf-8");
      for (const banned of BANNED_LITERALS) {
        if (content.includes(banned)) {
          hits.push({ file: path.relative(projectRoot, file), banned });
        }
      }
    }

    if (hits.length > 0) {
      const lines = hits.map((h) => `  - "${h.banned}" found in ${h.file}`);
      throw new Error(
        `Banned literals found in prompt source files:\n${lines.join("\n")}\n` +
        `These are copy-bait — replace with behavioral rules. See plan: docs/superpowers/plans/2026-04-28-system-prompt-v3-campaign-locked.md`,
      );
    }
  });
});
