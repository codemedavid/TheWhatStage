import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type Conversation = Database["public"]["Tables"]["conversations"]["Row"];
type MessageRow = Database["public"]["Tables"]["messages"]["Row"];

/**
 * Fetch conversations ordered by last activity. Cached per request.
 */
export const getConversations = cache(
  async (tenantId: string, limit = 50) => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("conversations")
      .select("id, tenant_id, lead_id, last_message_at, needs_human, bot_paused_at, escalation_reason, escalation_message_id")
      .eq("tenant_id", tenantId)
      .order("last_message_at", { ascending: false })
      .limit(limit);
    return (data ?? []) as Conversation[];
  }
);

/**
 * Fetch all messages for a set of conversation IDs.
 */
export async function getMessagesByConversations(convoIds: string[]) {
  if (convoIds.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("messages")
    .select(
      "id, conversation_id, direction, text, attachments, mid, created_at"
    )
    .in("conversation_id", convoIds)
    .order("created_at", { ascending: true });
  return (data ?? []) as MessageRow[];
}

/**
 * Count active conversations (last message within 24h).
 */
export async function countActiveConversations(tenantId: string) {
  const dayAgo = new Date(
    Date.now() - 24 * 60 * 60 * 1000
  ).toISOString();
  const supabase = await createClient();
  const { count } = await supabase
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .gte("last_message_at", dayAgo);
  return count ?? 0;
}
