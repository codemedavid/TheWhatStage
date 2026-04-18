const FB_API_VERSION = "v19.0";
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

export type OutboundMessage = TextMessage | ButtonMessage | QuickRepliesMessage;

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
  }
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

  const res = await fetch(`${FB_BASE_URL}/me/messages?access_token=${pageAccessToken}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`FB Send API error: ${JSON.stringify(err)}`);
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
