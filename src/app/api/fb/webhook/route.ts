import { NextResponse, after } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyFacebookSignature } from "@/lib/fb/signature";
import { parseFbWebhook, type FbMessagingEvent } from "@/lib/fb/webhook";
import {
  getCachedPage,
  setCachedPage,
  type CachedPage,
} from "@/lib/fb/page-cache";
import { handleMessage } from "@/lib/ai/conversation-engine";
import { sendMessage, sendSenderAction } from "@/lib/fb/send";
import type { Database } from "@/types/database";

type Supabase = ReturnType<typeof createServiceClient>;

async function resolvePageContext(
  fbPageId: string,
  supabase: Supabase
): Promise<CachedPage | null> {
  const cached = getCachedPage(fbPageId);
  if (cached) return cached;

  const { data } = await supabase
    .from("tenant_pages")
    .select("id, tenant_id, fb_page_token, fb_page_name")
    .eq("fb_page_id", fbPageId)
    .eq("status", "active")
    .single();

  if (!data) return null;

  const page: CachedPage = {
    tenantId: data.tenant_id,
    pageToken: data.fb_page_token,
    pageName: data.fb_page_name ?? "",
    pageId: data.id,
  };
  setCachedPage(fbPageId, page);
  return page;
}

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

  if (!data) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  return new NextResponse(challenge, { status: 200 });
}

export async function POST(request: Request) {
  const rawBody = await request.arrayBuffer();
  const bodyBuffer = Buffer.from(rawBody);
  const signature = request.headers.get("x-hub-signature-256");

  const appSecret = process.env.FB_APP_SECRET;
  if (appSecret && signature) {
    const valid = verifyFacebookSignature(bodyBuffer, signature, appSecret);
    if (!valid) {
      console.warn("Invalid webhook signature");
      return new NextResponse("Invalid signature", { status: 403 });
    }
  }

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

  // Return 200 immediately so Facebook doesn't retry the webhook.
  // Process events asynchronously via after().
  after(async () => {
    const supabase = createServiceClient();

    for (const entry of webhookBody.entry) {
      const fbPageId = entry.id;

      const pageCtx = await resolvePageContext(fbPageId, supabase);
      if (!pageCtx) {
        console.warn(`No active tenant_page found for fb_page_id: ${fbPageId}`);
        continue;
      }

      for (const event of entry.messaging) {
        await processMessagingEvent(pageCtx, event, supabase);
      }
    }
  });

  return NextResponse.json({ status: "ok" });
}

async function processMessagingEvent(
  pageCtx: CachedPage,
  event: FbMessagingEvent,
  supabase: Supabase
) {
  const { tenantId, pageId, pageToken } = pageCtx;
  const psid = event.sender.id;

  // 1. Upsert lead (assign default stage on first creation)
  // Find the first stage for this tenant if we need to assign one
  const { data: defaultStage } = await supabase
    .from("stages")
    .select("id")
    .eq("tenant_id", tenantId)
    .order("order_index", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: leadData } = await supabase
    .from("leads")
    .upsert(
      {
        tenant_id: tenantId,
        psid,
        page_id: pageId,
        last_active_at: new Date(event.timestamp).toISOString(),
      } as Database["public"]["Tables"]["leads"]["Insert"],
      { onConflict: "tenant_id,psid" }
    )
    .select("id, stage_id, fb_name")
    .single();

  if (!leadData) {
    console.error("Failed to upsert lead for psid:", psid);
    return;
  }
  const lead = leadData as { id: string; stage_id: string | null; fb_name: string | null };

  // Assign default stage if lead has none
  if (!lead.stage_id && defaultStage) {
    await supabase
      .from("leads")
      .update({ stage_id: defaultStage.id })
      .eq("id", lead.id);
  }

  // Fetch FB profile name if we don't have one yet
  if (!lead.fb_name) {
    try {
      const profileRes = await fetch(
        `https://graph.facebook.com/${psid}?fields=first_name,last_name,name,profile_pic&access_token=${pageToken}`
      );
      if (profileRes.ok) {
        const profile = await profileRes.json();
        const updates: Record<string, string> = {};
        if (profile.name) updates.fb_name = profile.name;
        if (profile.first_name) updates.first_name = profile.first_name;
        if (profile.last_name) updates.last_name = profile.last_name;
        if (profile.profile_pic) updates.fb_profile_pic = profile.profile_pic;
        if (Object.keys(updates).length > 0) {
          await supabase.from("leads").update(updates).eq("id", lead.id);
        }
      }
    } catch {
      // Non-blocking — profile fetch is best-effort
    }
  }

  // 2. Upsert conversation
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

  // 3. Handle incoming text message
  if (event.message) {
    // Deduplication: skip if this mid was already processed
    const { data: existing } = await supabase
      .from("messages")
      .select("id")
      .eq("mid", event.message.mid)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return;
    }

    // Store the incoming message
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

    // Generate and send AI reply (only for text messages)
    if (event.message.text) {
      await generateAndSendReply({
        tenantId,
        leadId: lead.id,
        conversationId: conversation.id,
        psid,
        pageToken,
        leadMessage: event.message.text,
        leadMessageId: event.message.mid,
        supabase,
      });
    }
  }

  // 4. Handle postback (button click)
  if (event.postback) {
    await supabase.from("lead_events").insert({
      tenant_id: tenantId,
      lead_id: lead.id,
      type: "action_click",
      payload: {
        payload: event.postback.payload,
        title: event.postback.title,
      },
    } as Database["public"]["Tables"]["lead_events"]["Insert"]);

    // Treat postback title as a message to generate a reply
    if (event.postback.title) {
      await generateAndSendReply({
        tenantId,
        leadId: lead.id,
        conversationId: conversation.id,
        psid,
        pageToken,
        leadMessage: event.postback.title,
        supabase,
      });
    }
  }
}

async function generateAndSendReply(params: {
  tenantId: string;
  leadId: string;
  conversationId: string;
  psid: string;
  pageToken: string;
  leadMessage: string;
  leadMessageId?: string;
  supabase: Supabase;
}) {
  const { tenantId, leadId, conversationId, psid, pageToken, leadMessage, leadMessageId, supabase } = params;

  try {
    // Show typing indicator
    await sendSenderAction(psid, "typing_on", pageToken);

    // Get business name for the conversation engine
    const { data: tenant } = await supabase
      .from("tenants")
      .select("name")
      .eq("id", tenantId)
      .single();

    const businessName = tenant?.name ?? "Our Business";

    // Generate AI response
    const engineOutput = await handleMessage({
      tenantId,
      leadId,
      businessName,
      conversationId,
      leadMessage,
      leadMessageId,
    });

    // If bot is paused (human handoff), don't send anything
    if (engineOutput.paused || !engineOutput.message) {
      await sendSenderAction(psid, "typing_off", pageToken);
      return;
    }

    // Send the text reply
    const result = await sendMessage(psid, { type: "text", text: engineOutput.message }, pageToken);

    // Store outgoing message
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      direction: "out",
      text: engineOutput.message,
      mid: result.messageId,
    } as Database["public"]["Tables"]["messages"]["Insert"]);

    await supabase.from("lead_events").insert({
      tenant_id: tenantId,
      lead_id: leadId,
      type: "message_out",
      payload: {
        message_id: result.messageId,
        sent_by: "bot",
        phase: engineOutput.currentPhase,
        confidence: engineOutput.confidence,
      },
    } as Database["public"]["Tables"]["lead_events"]["Insert"]);

    // Send any images the engine selected
    for (const imageId of engineOutput.imageIds) {
      const { data: image } = await supabase
        .from("knowledge_images")
        .select("url")
        .eq("id", imageId)
        .single();

      if (image?.url) {
        const imgResult = await sendMessage(psid, { type: "image", url: image.url }, pageToken);

        await supabase.from("messages").insert({
          conversation_id: conversationId,
          direction: "out",
          text: null,
          attachments: [{ type: "image", url: image.url }],
          mid: imgResult.messageId,
        } as Database["public"]["Tables"]["messages"]["Insert"]);
      }
    }
  } catch (error) {
    console.error("Failed to generate/send reply:", error);
  }
}
