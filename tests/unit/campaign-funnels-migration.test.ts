// tests/unit/campaign-funnels-migration.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("0021_campaign_funnels migration", () => {
  const sql = readFileSync(
    path.join(process.cwd(), "supabase/migrations/0021_campaign_funnels.sql"),
    "utf-8"
  );

  it("creates campaign_funnels table", () => {
    expect(sql).toMatch(/create table campaign_funnels/i);
  });
  it("references action_pages with on delete restrict", () => {
    expect(sql).toMatch(/references action_pages\(id\) on delete restrict/i);
  });
  it("declares unique (campaign_id, position)", () => {
    expect(sql).toMatch(/unique \(campaign_id, position\)/i);
  });
  it("enables RLS with tenant scoping", () => {
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toMatch(/current_tenant_id\(\)/);
  });
});
