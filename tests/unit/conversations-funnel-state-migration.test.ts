// tests/unit/conversations-funnel-state-migration.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("0022_conversations_funnel_state migration", () => {
  const sql = readFileSync(
    path.join(process.cwd(), "supabase/migrations/0022_conversations_funnel_state.sql"),
    "utf-8"
  );

  it("adds current_campaign_id column", () => {
    expect(sql).toMatch(/add column current_campaign_id\s+uuid/i);
    expect(sql).toMatch(/references campaigns\(id\)/i);
  });
  it("adds current_funnel_id column with on delete set null", () => {
    expect(sql).toMatch(/add column current_funnel_id\s+uuid/i);
    expect(sql).toMatch(/references campaign_funnels\(id\) on delete set null/i);
  });
  it("adds current_funnel_position with default 0", () => {
    expect(sql).toMatch(/current_funnel_position\s+integer not null default 0/i);
  });
  it("adds funnel_message_count with default 0", () => {
    expect(sql).toMatch(/funnel_message_count\s+integer not null default 0/i);
  });
  it("indexes current_campaign_id and current_funnel_id", () => {
    expect(sql).toMatch(/create index .* on conversations \(current_campaign_id\)/i);
    expect(sql).toMatch(/create index .* on conversations \(current_funnel_id\)/i);
  });
});
