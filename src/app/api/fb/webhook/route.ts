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
import { getOrAssignCampaign } from "@/lib/ai/campaign-assignment";
import { sendMessage, sendSenderAction, FacebookUnreachableLeadError } from "@/lib/fb/send";
import { markLeadUnreachable } from "@/lib/fb/lead-reachability";
import { fetchMessengerProfile } from "@/lib/fb/profile";
import type { Database } from "@/types/database";
import { buildActionPageUrl } from "@/lib/fb/action-url";
import { getAppHost, getAppProtocol } from "@/lib/supabase/cookie-domain";

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

  // Skip echo messages (messages sent by the page itself)
  if (event.message?.is_echo) {
    return;
  }

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

  // Fetch FB profile name if we don't have one yet — uses a tiered fetcher
  // that falls back to the Conversations API when the direct User Profile
  // call returns subcode 33 ("PSID not resolvable").
  if (!lead.fb_name) {
    const profile = await fetchMessengerProfile(psid, pageToken);
    if (profile.source !== "none") {
      const updates: Record<string, string> = {};
      if (profile.name) updates.fb_name = profile.name;
      if (profile.first_name) updates.first_name = profile.first_name;
      if (profile.last_name) updates.last_name = profile.last_name;
      if (profile.profile_pic) updates.fb_profile_pic = profile.profile_pic;
      if (Object.keys(updates).length > 0) {
        await supabase.from("leads").update(updates).eq("id", lead.id);
      }
    } else {
      console.warn(
        `FB profile unavailable for psid ${psid} via any method ` +
          `(direct User Profile + Conversations API both failed)`
      );
    }
  }

  // Ensure the lead has a campaign assignment on every inbound event.
  // No-op when already assigned; otherwise routes via running experiment
  // or falls back to the tenant's primary campaign. Wrapped so a failure
  // here never aborts message storage or reply generation downstream.
  try {
    const assigned = await getOrAssignCampaign(lead.id, tenantId);
    if (!assigned) {
      console.warn(
        `[webhook] no campaign assigned for lead ${lead.id} (tenant ${tenantId})`
      );
    }
  } catch (e) {
    console.error(
      `[webhook] getOrAssignCampaign threw for lead ${lead.id}: ${
        e instanceof Error ? e.message : String(e)
      }`
    );
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

    // If the engine produced no message, log WHY before swallowing.
    // Without this it's invisible: the lead just sees the typing bubble blink
    // and never receives a reply.
    if (engineOutput.paused || !engineOutput.message) {
      const reason = engineOutput.paused
        ? "engine_paused (bot_paused_at set OR no funnels configured for campaign)"
        : "empty_llm_message (LLM/parser returned empty string)";
      console.warn(
        `No reply sent for lead ${leadId} (conversation ${conversationId}): ${reason}. ` +
          `paused=${engineOutput.paused} messageLen=${engineOutput.message?.length ?? 0} ` +
          `phase="${engineOutput.currentPhase}" confidence=${engineOutput.confidence}`
      );
      await supabase.from("lead_events").insert({
        tenant_id: tenantId,
        lead_id: leadId,
        type: "send_failed",
        payload: {
          reason: engineOutput.paused ? "engine_paused" : "empty_llm_message",
          phase: engineOutput.currentPhase,
          confidence: engineOutput.confidence,
        },
      } as Database["public"]["Tables"]["lead_events"]["Insert"]);
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
        .eq("tenant_id", tenantId)
        .maybeSingle();

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

    // Send action button if the engine selected one
    if (engineOutput.actionButton) {
      const { data: actionPage } = await supabase
        .from("action_pages")
        .select("slug, title, cta_text")
        .eq("id", engineOutput.actionButton.actionPageId)
        .eq("tenant_id", tenantId)
        .single();

      if (!actionPage) {
        console.warn(
          `Action button skipped: action_pages row missing for id=${engineOutput.actionButton.actionPageId} tenant=${tenantId}`
        );
        await supabase.from("lead_events").insert({
          tenant_id: tenantId,
          lead_id: leadId,
          type: "send_failed",
          payload: {
            reason: "action_page_missing_or_cross_tenant",
            action_page_id: engineOutput.actionButton.actionPageId,
          },
        } as Database["public"]["Tables"]["lead_events"]["Insert"]);
      }

      if (actionPage) {
        const { data: tenantData } = await supabase
          .from("tenants")
          .select("slug, fb_app_secret")
          .eq("id", tenantId)
          .maybeSingle();

        // Sign with the tenant's own FB app secret if set, else fall back to
        // the platform-wide FB_APP_SECRET. The action-page submission verifier
        // applies the same fallback so signatures stay symmetric.
        const signingSecret = tenantData?.fb_app_secret ?? process.env.FB_APP_SECRET ?? null;

        if (!signingSecret || !tenantData?.slug) {
          console.warn(
            `Action button skipped: cannot sign URL for tenant ${tenantId} ` +
              `(slug=${tenantData?.slug ?? "null"}, has_tenant_secret=${!!tenantData?.fb_app_secret}, ` +
              `has_env_secret=${!!process.env.FB_APP_SECRET}). ` +
              `Set tenants.slug, and either tenants.fb_app_secret or env FB_APP_SECRET.`
          );
          await supabase.from("lead_events").insert({
            tenant_id: tenantId,
            lead_id: leadId,
            type: "send_failed",
            payload: {
              reason: "tenant_missing_slug_or_app_secret",
              has_slug: !!tenantData?.slug,
              has_tenant_secret: !!tenantData?.fb_app_secret,
              has_env_secret: !!process.env.FB_APP_SECRET,
            },
          } as Database["public"]["Tables"]["lead_events"]["Insert"]);
        }

        if (signingSecret && tenantData?.slug) {
          const appDomain = getAppHost() ?? "whatstage.com";
          const protocol = getAppProtocol();

          const actionUrl = buildActionPageUrl({
            tenantSlug: tenantData.slug,
            actionPageSlug: actionPage.slug,
            psid,
            appSecret: signingSecret,
            appDomain,
            protocol,
          });

          // Resolve CTA: engine custom > action page default > generic fallback
          const ctaText =
            engineOutput.actionButton.ctaText ||
            actionPage.cta_text ||
            "Check this out";

          // Resolve button label: AI-generated > action page title fallback.
          // The AI label is already trimmed to Meta's 20-char limit by the
          // decision parser. The title fallback is also trimmed defensively.
          const buttonLabel =
            engineOutput.actionButton.label ?? actionPage.title.slice(0, 20);

          const btnResult = await sendMessage(
            psid,
            {
              type: "buttons",
              text: ctaText,
              buttons: [
                {
                  type: "web_url",
                  title: buttonLabel,
                  url: actionUrl,
                },
              ],
            },
            pageToken
          );

          // Store the button message
          await supabase.from("messages").insert({
            conversation_id: conversationId,
            direction: "out",
            text: ctaText,
            attachments: [{ type: "button", url: actionUrl, title: buttonLabel }],
            mid: btnResult.messageId,
          } as Database["public"]["Tables"]["messages"]["Insert"]);

          // Log the action button send event
          await supabase.from("lead_events").insert({
            tenant_id: tenantId,
            lead_id: leadId,
            type: "action_button_sent",
            payload: {
              action_page_id: engineOutput.actionButton.actionPageId,
              action_page_slug: actionPage.slug,
              message_id: btnResult.messageId,
            },
          } as Database["public"]["Tables"]["lead_events"]["Insert"]);
        }
      }
    }
  } catch (error) {
    // Always clear the typing indicator on failure, otherwise the lead
    // sees the bubble forever and assumes the bot is "thinking".
    try {
      await sendSenderAction(psid, "typing_off", pageToken);
    } catch {
      // ignore — secondary failure
    }

    if (error instanceof FacebookUnreachableLeadError) {
      console.warn(
        `Lead ${leadId} unreachable via Messenger (${error.reason}, code=${error.fbCode}/${error.fbSubcode}). ` +
          `Likely cause: FB app lacks Advanced Access for pages_messaging, recipient is not a tester, ` +
          `or the 24h messaging window has expired.`
      );
      await markLeadUnreachable(supabase, leadId, error);
      await supabase.from("lead_events").insert({
        tenant_id: tenantId,
        lead_id: leadId,
        type: "send_failed",
        payload: {
          reason: error.reason,
          fb_code: error.fbCode,
          fb_subcode: error.fbSubcode,
        },
      } as Database["public"]["Tables"]["lead_events"]["Insert"]);
      return;
    }
    const errMessage = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : undefined;
    console.error(
      `Failed to generate/send reply for lead ${leadId} (conversation ${conversationId}): ${errMessage}`,
      errStack
    );
    await supabase.from("lead_events").insert({
      tenant_id: tenantId,
      lead_id: leadId,
      type: "send_failed",
      payload: {
        reason: "engine_threw",
        error_message: errMessage,
      },
    } as Database["public"]["Tables"]["lead_events"]["Insert"]);
  }
}
