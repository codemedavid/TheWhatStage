import { defineConfig } from "vitest/config";
import { resolve } from "path";

// Live integration config: NO env-override setup file, so .env.local values win.
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/live/**/*.test.ts"],
    testTimeout: 300_000,
    hookTimeout: 30_000,
    env: loadDotEnvLocal(),
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});

function loadDotEnvLocal(): Record<string, string> {
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  const file = path.resolve(__dirname, ".env.local");
  if (!fs.existsSync(file)) return {};
  const raw = fs.readFileSync(file, "utf8");
  const env: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[k] = v;
  }
  return env;
}
