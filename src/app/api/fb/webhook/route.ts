import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyFacebookSignature } from "@/lib/fb/signature";
import { parseFbWebhook, type FbMessagingEvent } from "@/lib/fb/webhook";
import type { Database } from "@/types/database";

type Supabase = ReturnType<typeof createServiceClient>;
type Tenant = Database["public"]["Tables"]["tenants"]["Row"];

/**
 * GET /api/fb/webhook — Facebook webhook verification
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("tenants")
    .select("id")
    .eq("fb_verify_token", token)
    .single();
  const tenant = data as Pick<Tenant, "id"> | null;

  if (!tenant) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  return new NextResponse(challenge, { status: 200 });
}

/**
 * POST /api/fb/webhook — Facebook webhook events
 */
export async function POST(request: Request) {
  const rawBody = await request.arrayBuffer();
  const bodyBuffer = Buffer.from(rawBody);
  const signature = request.headers.get("x-hub-signature-256");

  let body: unknown;
  try {
    body = JSON.parse(bodyBuffer.toString());
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  const webhookBody = parseFbWebhook(body);
  if (!webhookBody) {
    return new NextResponse("Not a page webhook", { status: 400 });
  }

  const supabase = createServiceClient();

  for (const entry of webhookBody.entry) {
    const pageId = entry.id;

    const { data } = await supabase
      .from("tenants")
      .select("id, fb_page_token, fb_app_secret, fb_verify_token")
      .eq("fb_page_id", pageId)
      .single();
    const tenant = data as Pick<Tenant, "id" | "fb_page_token" | "fb_app_secret" | "fb_verify_token"> | null;

    if (!tenant) continue;

    if (tenant.fb_app_secret) {
      const valid = verifyFacebookSignature(bodyBuffer, signature, tenant.fb_app_secret);
      if (!valid) {
        console.warn(`Invalid signature for tenant ${tenant.id}`);
        continue;
      }
    }

    for (const event of entry.messaging) {
      await processMessagingEvent(tenant.id, event, supabase);
    }
  }

  return NextResponse.json({ status: "ok" });
}

async function processMessagingEvent(
  tenantId: string,
  event: FbMessagingEvent,
  supabase: Supabase
) {
  const psid = event.sender.id;

  const { data: leadData } = await supabase
    .from("leads")
    .upsert(
      {
        tenant_id: tenantId,
        psid,
        last_active_at: new Date(event.timestamp).toISOString(),
      } as Database["public"]["Tables"]["leads"]["Insert"],
      { onConflict: "tenant_id,psid" }
    )
    .select("id")
    .single();

  if (!leadData) {
    console.error("Failed to upsert lead for psid:", psid);
    return;
  }
  const lead = leadData as { id: string };

  const { data: convData } = await supabase
    .from("conversations")
    .upsert(
      {
        tenant_id: tenantId,
        lead_id: lead.id,
        last_message_at: new Date(event.timestamp).toISOString(),
      } as Database["public"]["Tables"]["conversations"]["Insert"],
      { onConflict: "tenant_id,lead_id" }
    )
    .select("id")
    .single();

  if (!convData) return;
  const conversation = convData as { id: string };

  if (event.message) {
    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      direction: "in",
      text: event.message.text ?? null,
      attachments: event.message.attachments
        ? (event.message.attachments as unknown as Database["public"]["Tables"]["messages"]["Row"]["attachments"])
        : null,
      mid: event.message.mid,
    } as Database["public"]["Tables"]["messages"]["Insert"]);

    await supabase.from("lead_events").insert({
      tenant_id: tenantId,
      lead_id: lead.id,
      type: "message_in",
      payload: { mid: event.message.mid, text: event.message.text },
    } as Database["public"]["Tables"]["lead_events"]["Insert"]);
  }

  if (event.postback) {
    await supabase.from("lead_events").insert({
      tenant_id: tenantId,
      lead_id: lead.id,
      type: "action_click",
      payload: { payload: event.postback.payload, title: event.postback.title },
    } as Database["public"]["Tables"]["lead_events"]["Insert"]);
  }
}
