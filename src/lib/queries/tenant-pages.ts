// src/lib/queries/tenant-pages.ts

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export interface TenantPage {
  id: string;
  tenant_id: string;
  fb_page_id: string;
  fb_page_name: string | null;
  fb_page_avatar: string | null;
  fb_page_token: string;
  status: string;
  connected_at: string;
}

export interface PageStats {
  pageId: string;
  messageCount: number;
  leadCount: number;
}

export const getTenantPages = cache(async (tenantId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tenant_pages")
    .select("id, tenant_id, fb_page_id, fb_page_name, fb_page_avatar, fb_page_token, status, connected_at")
    .eq("tenant_id", tenantId)
    .order("connected_at", { ascending: true });
  return (data ?? []) as TenantPage[];
});

export const hasExpiredPages = cache(async (tenantId: string) => {
  const supabase = await createClient();
  const { count } = await supabase
    .from("tenant_pages")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("status", "token_expired");
  return (count ?? 0) > 0;
});

export const hasActivePages = cache(async (tenantId: string) => {
  const supabase = await createClient();
  const { count } = await supabase
    .from("tenant_pages")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("status", "active");
  return (count ?? 0) > 0;
});

export async function getPageStats(tenantId: string): Promise<PageStats[]> {
  const supabase = await createClient();

  const { data: leadCounts } = await supabase
    .rpc("get_page_lead_counts", { p_tenant_id: tenantId });

  const { data: messageCounts } = await supabase
    .rpc("get_page_message_counts", { p_tenant_id: tenantId });

  const statsMap = new Map<string, PageStats>();

  for (const row of (leadCounts ?? []) as { page_id: string; count: number }[]) {
    statsMap.set(row.page_id, {
      pageId: row.page_id,
      leadCount: Number(row.count),
      messageCount: 0,
    });
  }

  for (const row of (messageCounts ?? []) as { page_id: string; count: number }[]) {
    const existing = statsMap.get(row.page_id);
    if (existing) {
      existing.messageCount = Number(row.count);
    } else {
      statsMap.set(row.page_id, {
        pageId: row.page_id,
        leadCount: 0,
        messageCount: Number(row.count),
      });
    }
  }

  return Array.from(statsMap.values());
}
