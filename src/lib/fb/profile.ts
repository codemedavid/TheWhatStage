/**
 * Fetch a Messenger lead's profile (name + picture) using a tiered strategy
 * to work around subcode-33 ("PSID not resolvable") errors that hit the
 * direct User Profile API when the app lacks Advanced Access for it.
 *
 * Strategy (in order):
 *   1. Direct User Profile API — `/{PSID}?fields=...`. Cleanest, but gated
 *      by the `pages_user_profile` / Advanced Access requirement.
 *   2. Conversations API — `/me/conversations?user_id={PSID}&fields=participants`.
 *      Gated only by `pages_messaging`, which any working bot already has,
 *      so this generally succeeds when (1) returns subcode 33.
 *
 * Returns whatever fields each step yields. Caller decides what to persist.
 */
const FB_API_VERSION = "v23.0";
const FB_BASE_URL = `https://graph.facebook.com/${FB_API_VERSION}`;

export interface MessengerProfile {
  name?: string;
  first_name?: string;
  last_name?: string;
  profile_pic?: string;
  /** Which strategy actually returned data — useful for logs/debugging. */
  source: "user_profile_api" | "conversations_api" | "none";
}

interface UserProfileResponse {
  name?: string;
  first_name?: string;
  last_name?: string;
  profile_pic?: string;
  error?: { code?: number; error_subcode?: number; message?: string };
}

interface ConversationsResponse {
  data?: Array<{
    id: string;
    participants?: {
      data?: Array<{ id: string; name?: string; email?: string }>;
    };
  }>;
  error?: { code?: number; error_subcode?: number; message?: string };
}

async function fetchUserProfile(psid: string, pageToken: string): Promise<MessengerProfile | null> {
  const res = await fetch(
    `${FB_BASE_URL}/${psid}?fields=first_name,last_name,name,profile_pic&access_token=${pageToken}`
  );
  if (!res.ok) return null;
  const body = (await res.json()) as UserProfileResponse;
  if (body.error) return null;
  if (!body.name && !body.first_name && !body.profile_pic) return null;
  return {
    name: body.name,
    first_name: body.first_name,
    last_name: body.last_name,
    profile_pic: body.profile_pic,
    source: "user_profile_api",
  };
}

async function fetchViaConversations(
  psid: string,
  pageToken: string
): Promise<MessengerProfile | null> {
  // Look up the conversation between the page and this PSID.
  // `participants` returns each side's display name, which works under
  // the pages_messaging permission alone.
  const res = await fetch(
    `${FB_BASE_URL}/me/conversations?user_id=${encodeURIComponent(psid)}&fields=participants&access_token=${pageToken}`
  );
  if (!res.ok) return null;
  const body = (await res.json()) as ConversationsResponse;
  if (body.error || !body.data?.length) return null;

  const participants = body.data[0].participants?.data ?? [];
  // The participant whose id matches the PSID is the lead; the other is the page.
  const lead = participants.find((p) => p.id === psid);
  if (!lead?.name) return null;

  // Conversations API returns `name` only — split into first/last as best-effort.
  const parts = lead.name.trim().split(/\s+/);
  const first_name = parts[0];
  const last_name = parts.length > 1 ? parts.slice(1).join(" ") : undefined;

  return {
    name: lead.name,
    first_name,
    last_name,
    source: "conversations_api",
  };
}

/**
 * Try every available method to resolve a Messenger profile. Never throws.
 */
export async function fetchMessengerProfile(
  psid: string,
  pageToken: string
): Promise<MessengerProfile> {
  try {
    const direct = await fetchUserProfile(psid, pageToken);
    if (direct) return direct;
  } catch (err) {
    console.warn(`User Profile API failed for psid ${psid}:`, err);
  }

  try {
    const conv = await fetchViaConversations(psid, pageToken);
    if (conv) return conv;
  } catch (err) {
    console.warn(`Conversations API profile fallback failed for psid ${psid}:`, err);
  }

  return { source: "none" };
}
