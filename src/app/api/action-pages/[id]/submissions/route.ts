import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyActionPageSignature } from "@/lib/fb/signature";
import { sendMessage } from "@/lib/fb/send";
import { normalizeKey } from "@/lib/leads/key-normalizer";
import { listFunnelsForCampaign } from "@/lib/db/campaign-funnels";
import { markFunnelCompletedByActionPage } from "@/lib/ai/funnel-runtime";
import type { Json } from "@/types/database";

type LeadMapping =
  | { target: "lead_contact"; type: "email" | "phone" }
  | { target: "lead_knowledge"; key: string };

type RouteContext = { params: Promise<{ id: string }> };

const submissionSchema = z.object({
  psid: z.string().min(1),
  sig: z.string().min(1),
  data: z.record(z.unknown()),
});

export async function POST(request: Request, context: RouteContext) {
  const { id: actionPageId } = await context.params;
  const body = await request.json();
  const parsed = submissionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Missing psid, sig, or data" }, { status: 400 });
  }

  const { psid, sig, data } = parsed.data;
  const supabase = createServiceClient();

  // Fetch action page
  const { data: page, error: pageError } = await supabase
    .from("action_pages")
    .select("id, tenant_id, title, config, published")
    .eq("id", actionPageId)
    .eq("published", true)
    .single();

  if (pageError || !page) {
    return NextResponse.json({ error: "Action page not found" }, { status: 404 });
  }

  const tenantId = page.tenant_id;

  // Fetch tenant for FB credentials
  const { data: tenant } = await supabase
    .from("tenants")
    .select("fb_app_secret, fb_page_token")
    .eq("id", tenantId)
    .single();

  // Verify PSID signature. Tenant secret takes precedence; falls back to the
  // platform-wide FB_APP_SECRET (mirrors the webhook signer so URLs minted
  // under the platform secret still verify).
  const verifySecret = tenant?.fb_app_secret ?? process.env.FB_APP_SECRET ?? null;
  if (!verifySecret || !verifyActionPageSignature(psid, sig, verifySecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  // Fetch field definitions for validation + lead mapping
  const { data: fields } = await supabase
    .from("action_page_fields")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("action_page_id", actionPageId)
    .order("order_index", { ascending: true });

  const fieldList = (fields ?? []) as Array<{
    field_key: string;
    field_type: string;
    required: boolean;
    lead_mapping: unknown;
  }>;

  // Validate required fields
  const missingFields = fieldList
    .filter((f) => f.required && (!data[f.field_key] || String(data[f.field_key]).trim() === ""))
    .map((f) => f.field_key);

  if (missingFields.length > 0) {
    return NextResponse.json(
      { error: `Missing required fields: ${missingFields.join(", ")}` },
      { status: 400 }
    );
  }

  // Resolve lead by PSID
  const { data: lead } = await supabase
    .from("leads")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("psid", psid)
    .single();

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // Insert submission
  const { data: submission, error: subError } = await supabase
    .from("action_submissions")
    .insert({
      tenant_id: tenantId,
      action_page_id: actionPageId,
      lead_id: lead.id,
      psid,
      data: data as Json,
    })
    .select("id")
    .single();

  if (subError) {
    return NextResponse.json({ error: subError.message }, { status: 500 });
  }

  // Process lead mappings
  for (const field of fieldList) {
    const value = data[field.field_key];
    if (!value || !field.lead_mapping) continue;

    const mapping = field.lead_mapping as LeadMapping;
    if (!mapping) continue;

    if (mapping.target === "lead_contact") {
      await supabase.from("lead_contacts").upsert(
        {
          tenant_id: tenantId,
          lead_id: lead.id,
          type: mapping.type,
          value: String(value),
          source: "form_submit" as const,
          is_primary: false,
        },
        { onConflict: "tenant_id,lead_id,type,value" }
      );
    } else if (mapping.target === "lead_knowledge") {
      const normalizedKey = normalizeKey(mapping.key);
      await supabase.from("lead_knowledge").upsert(
        {
          tenant_id: tenantId,
          lead_id: lead.id,
          key: normalizedKey,
          value: String(value),
          source: "form_submit" as const,
        },
        { onConflict: "tenant_id,lead_id,key" }
      );
    }
  }

  // Insert form_submit event
  await supabase.from("lead_events").insert({
    tenant_id: tenantId,
    lead_id: lead.id,
    type: "form_submit",
    payload: {
      submission_id: submission.id,
      form_title: page.title,
      action_page_id: actionPageId,
    },
  });

  // If this action page is the active destination for the lead's current
  // campaign funnel, completing the page advances the conversation to the next
  // funnel step. Best-effort: submissions should still succeed if state is stale.
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, current_campaign_id")
    .eq("tenant_id", tenantId)
    .eq("lead_id", lead.id)
    .maybeSingle();

  if (conversation?.id && conversation.current_campaign_id) {
    try {
      const funnels = await listFunnelsForCampaign(supabase, conversation.current_campaign_id);
      await markFunnelCompletedByActionPage(
        supabase,
        conversation.id,
        actionPageId,
        funnels
      );
    } catch (err) {
      console.warn(
        `Failed to advance funnel for action page submission ${submission.id}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  // Send Messenger confirmation (best-effort, don't fail the submission)
  const config = page.config as Record<string, unknown> | null;
  const thankYouMessage = (config?.thank_you_message as string) || "Thanks for submitting!";

  if (tenant?.fb_page_token) {
    try {
      await sendMessage(psid, { type: "text", text: thankYouMessage }, tenant.fb_page_token);
    } catch {
      console.error("Failed to send Messenger confirmation");
    }
  }

  return NextResponse.json({ success: true, submission_id: submission.id });
}
