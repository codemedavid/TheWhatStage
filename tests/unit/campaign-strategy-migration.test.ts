import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("0026_campaign_strategy_fields migration", () => {
  const sql = readFileSync(
    path.join(process.cwd(), "supabase/migrations/0026_campaign_strategy_fields.sql"),
    "utf-8"
  );

  it("adds campaign main goal and optional personality override", () => {
    expect(sql).toMatch(/add column if not exists main_goal\s+text/i);
    expect(sql).toMatch(/add column if not exists campaign_personality\s+text/i);
  });

  it("adds funnel pitch and qualification question fields for existing deployments", () => {
    expect(sql).toMatch(/alter table campaign_funnels/i);
    expect(sql).toMatch(/add column if not exists pitch\s+text/i);
    expect(sql).toMatch(/add column if not exists qualification_questions\s+text\[\]\s+not null default '\{\}'/i);
  });
});
