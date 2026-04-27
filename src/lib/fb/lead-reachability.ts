import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { FacebookUnreachableLeadError } from "./send";

type Supabase = SupabaseClient<Database>;

/**
 * Persist that a lead can no longer be reached via Messenger.
 * Idempotent — overwrites the most recent reason/timestamp.
 */
export async function markLeadUnreachable(
  supabase: Supabase,
  leadId: string,
  err: FacebookUnreachableLeadError
): Promise<void> {
  const reason = `${err.reason}:${err.fbCode ?? "?"}/${err.fbSubcode ?? "?"}`;
  await supabase
    .from("leads")
    .update({
      unreachable_reason: reason,
      unreachable_at: new Date().toISOString(),
    } as Database["public"]["Tables"]["leads"]["Update"])
    .eq("id", leadId);
}
