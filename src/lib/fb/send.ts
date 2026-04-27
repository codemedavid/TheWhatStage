// Bumped from v19.0 → v23.0 (April 2026). Older versions are deprecated by Meta;
// keep this in sync with the version that the official docs show in examples.
const FB_API_VERSION = "v23.0";
const FB_BASE_URL = `https://graph.facebook.com/${FB_API_VERSION}`;

export interface TextMessage {
  type: "text";
  text: string;
}

export interface ButtonMessage {
  type: "buttons";
  text: string;
  buttons: Array<{
    type: "web_url" | "postback";
    title: string;
    url?: string;
    payload?: string;
  }>;
}

export interface QuickRepliesMessage {
  type: "quick_replies";
  text: string;
  quickReplies: Array<{ title: string; payload: string }>;
}

export interface ImageMessage {
  type: "image";
  url: string;
}

export type OutboundMessage = TextMessage | ButtonMessage | QuickRepliesMessage | ImageMessage;

function buildMessageBody(message: OutboundMessage): Record<string, unknown> {
  switch (message.type) {
    case "text":
      return { text: message.text };

    case "buttons":
      return {
        attachment: {
          type: "template",
          payload: {
            template_type: "button",
            text: message.text,
            buttons: message.buttons,
          },
        },
      };

    case "quick_replies":
      return {
        text: message.text,
        quick_replies: message.quickReplies.map((qr) => ({
          content_type: "text",
          title: qr.title,
          payload: qr.payload,
        })),
      };

    case "image":
      return {
        attachment: {
          type: "image",
          payload: {
            url: message.url,
            is_reusable: true,
          },
        },
      };
  }
}

export class FacebookTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FacebookTokenError";
  }
}

/**
 * Thrown when the recipient PSID cannot be messaged. Common causes:
 * - App lacks Advanced Access for `pages_messaging` (dev-mode + non-tester user)
 * - Recipient is outside the 24-hour standard messaging window
 * - PSID is not resolvable (subcode 33)
 * - User has blocked the page or deleted their account
 *
 * Callers should mark the lead as unreachable rather than retry.
 */
export class FacebookUnreachableLeadError extends Error {
  readonly reason: string;
  readonly fbCode: number | null;
  readonly fbSubcode: number | null;
  constructor(reason: string, fbCode: number | null, fbSubcode: number | null, raw: string) {
    super(`FB Send unreachable: ${reason} (code=${fbCode}, subcode=${fbSubcode}) — ${raw}`);
    this.name = "FacebookUnreachableLeadError";
    this.reason = reason;
    this.fbCode = fbCode;
    this.fbSubcode = fbSubcode;
  }
}

interface FBErrorEnvelope {
  error?: {
    code?: number;
    error_subcode?: number;
    message?: string;
  };
}

function classifyFBError(err: FBErrorEnvelope): { type: "token" | "unreachable" | "other"; reason: string } {
  const code = err?.error?.code;
  const subcode = err?.error?.error_subcode;

  if (code === 190) return { type: "token", reason: "page_token_invalid" };

  // Subcode 33 — PSID not resolvable. App lacks Advanced Access for User Profile,
  // or recipient is not a tester/admin in dev mode.
  if (subcode === 33) return { type: "unreachable", reason: "psid_not_resolvable" };

  // Code 10 — application does not have permission for this action (often pages_messaging
  // not approved, or messaging outside supported use cases).
  if (code === 10) return { type: "unreachable", reason: "permission_denied" };

  // Code 200 — generic permission error.
  if (code === 200) return { type: "unreachable", reason: "permission_denied" };

  // Code 100, subcode 2018278/2018109 — recipient is unavailable / no matching user.
  if (code === 100 && (subcode === 2018278 || subcode === 2018109)) {
    return { type: "unreachable", reason: "recipient_unavailable" };
  }

  // Code 551 — user not available (blocked, deleted, etc.)
  if (code === 551) return { type: "unreachable", reason: "user_blocked_or_deleted" };

  // Code 10 / subcode 2018065 — outside 24-hour messaging window.
  if (subcode === 2018065) return { type: "unreachable", reason: "outside_messaging_window" };

  return { type: "other", reason: "unknown" };
}

/**
 * Send a message to a Messenger user.
 */
export async function sendMessage(
  psid: string,
  message: OutboundMessage,
  pageAccessToken: string
): Promise<{ messageId: string }> {
  const body = {
    recipient: { id: psid },
    message: buildMessageBody(message),
    messaging_type: "RESPONSE",
  };

  const res = await fetch(
    `${FB_BASE_URL}/me/messages?access_token=${pageAccessToken}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const raw = await res.text();
    let err: FBErrorEnvelope = {};
    try {
      err = JSON.parse(raw) as FBErrorEnvelope;
    } catch {
      // non-JSON error body
    }
    const classified = classifyFBError(err);

    if (classified.type === "token") {
      throw new FacebookTokenError(
        `Page token expired or invalid: ${err.error?.message ?? raw}`
      );
    }
    if (classified.type === "unreachable") {
      throw new FacebookUnreachableLeadError(
        classified.reason,
        err.error?.code ?? null,
        err.error?.error_subcode ?? null,
        raw
      );
    }
    throw new Error(`FB Send API error: ${raw}`);
  }

  const data = await res.json();
  return { messageId: data.message_id };
}

/**
 * Mark messages as seen / typing indicator.
 */
export async function sendSenderAction(
  psid: string,
  action: "mark_seen" | "typing_on" | "typing_off",
  pageAccessToken: string
): Promise<void> {
  await fetch(`${FB_BASE_URL}/me/messages?access_token=${pageAccessToken}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: psid },
      sender_action: action,
    }),
  });
}
