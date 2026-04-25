export interface FbMessagingEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid: string;
    text?: string;
    is_echo?: boolean;
    attachments?: Array<{ type: string; payload: Record<string, unknown> }>;
  };
  postback?: {
    title: string;
    payload: string;
    mid?: string;
  };
}

export interface FbWebhookEntry {
  id: string;  // page ID
  time: number;
  messaging: FbMessagingEvent[];
}

export interface FbWebhookBody {
  object: string;
  entry: FbWebhookEntry[];
}

export function parseFbWebhook(body: unknown): FbWebhookBody | null {
  if (
    typeof body !== "object" ||
    body === null ||
    (body as FbWebhookBody).object !== "page"
  ) {
    return null;
  }
  return body as FbWebhookBody;
}
