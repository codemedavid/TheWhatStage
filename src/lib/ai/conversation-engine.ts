import { getOrAssignCampaign } from "@/lib/ai/campaign-assignment";
import { retrieveKnowledge } from "@/lib/ai/retriever";
import { buildSystemPrompt } from "@/lib/ai/prompt-builder";
import type { CampaignContext, KnowledgeImage } from "@/lib/ai/prompt-builder";
import { generateResponse } from "@/lib/ai/llm-client";
import { parseDecision } from "@/lib/ai/decision-parser";
import { selectImages } from "@/lib/ai/image-selector";
import { parseResponse } from "@/lib/ai/response-parser";
import { createServiceClient } from "@/lib/supabase/service";
import { extractKnowledge } from "@/lib/leads/knowledge-extractor";
import { generateLeadSummary } from "@/lib/leads/summary-generator";
import { listFunnelsForCampaign } from "@/lib/db/campaign-funnels";
import {
  getOrInitFunnelState,
  advanceFunnel,
} from "@/lib/ai/funnel-runtime";
import { funnelToStep } from "@/lib/ai/step-context";
import { ACTION_PAGE_TYPES, type ActionPageType } from "@/lib/ai/funnel-templates";
import type { Database } from "@/types/database";

export interface EngineInput {
  tenantId: string;
  leadId: string;
  businessName: string;
  conversationId: string;
  leadMessage: string;
  leadMessageId?: string;
}

export interface EngineOutput {
  message: string;
  phaseAction: "stay" | "advance" | "escalate";
  confidence: number;
  imageIds: string[];
  currentPhase: string;
  escalated: boolean;
  paused: boolean;
  completedFunnel?: boolean;
  actionButton?: {
    actionPageId: string;
    ctaText: string;
    label: string | null;
  };
}

// Minimum LLM-self-rated button-send confidence required to actually send the
// button. Below this we drop it: a hedged button kills CTR.
const BUTTON_CONFIDENCE_THRESHOLD = 0.65;

export async function handleMessage(input: EngineInput): Promise<EngineOutput> {
  const { tenantId, leadId, businessName, conversationId, leadMessage, leadMessageId } = input;
  const supabase = createServiceClient();

  // Gate check: if bot is paused for human handoff, return early or auto-resume
  const { data: conversation } = await supabase
    .from("conversations")
    .select("bot_paused_at")
    .eq("id", conversationId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (conversation?.bot_paused_at) {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("handoff_timeout_hours")
      .eq("id", tenantId)
      .single();

    const timeoutHours = tenant?.handoff_timeout_hours ?? null;

    if (timeoutHours === null) {
      // Never auto-resume
      return {
        message: "",
        phaseAction: "stay",
        confidence: 0,
        imageIds: [],
        currentPhase: "",
        escalated: false,
        paused: true,
        completedFunnel: false,
      };
    }

    const pausedAt = new Date(conversation.bot_paused_at).getTime();
    const elapsed = Date.now() - pausedAt;
    const timeoutMs = timeoutHours * 60 * 60 * 1000;

    if (elapsed <= timeoutMs) {
      // Still within timeout
      return {
        message: "",
        phaseAction: "stay",
        confidence: 0,
        imageIds: [],
        currentPhase: "",
        escalated: false,
        paused: true,
        completedFunnel: false,
      };
    }

    // Auto-resume: timeout expired
    await supabase
      .from("conversations")
      .update({
        bot_paused_at: null,
        needs_human: false,
        escalation_reason: null,
        escalation_message_id: null,
      })
      .eq("id", conversationId);

    await supabase.from("escalation_events").insert({
      conversation_id: conversationId,
      tenant_id: tenantId,
      type: "bot_resumed",
      reason: "timeout",
    });
  }

  // Step 0: Get or assign campaign
  const campaignId = await getOrAssignCampaign(leadId, tenantId);
  if (!campaignId) {
    return {
      message: "",
      phaseAction: "stay",
      confidence: 0,
      imageIds: [],
      currentPhase: "",
      escalated: false,
      paused: true,
      completedFunnel: false,
    };
  }

  // Step 1: Load funnels for the campaign
  const funnels = await listFunnelsForCampaign(supabase, campaignId);
  if (funnels.length === 0) {
    return {
      message: "",
      phaseAction: "stay",
      confidence: 0,
      imageIds: [],
      currentPhase: "",
      escalated: false,
      paused: true,
      completedFunnel: false,
    };
  }

  const { data: campaignData } = await supabase
    .from("campaigns")
    .select("name, description, goal, main_goal, campaign_personality, campaign_rules")
    .eq("id", campaignId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const campaignContext: CampaignContext | undefined = campaignData
    ? {
        name: campaignData.name,
        description: campaignData.description,
        goal: campaignData.goal,
        mainGoal: (campaignData as { main_goal?: string | null }).main_goal ?? null,
        campaignPersonality: (campaignData as { campaign_personality?: string | null }).campaign_personality ?? null,
        campaignRules: (campaignData.campaign_rules as string[] | null) ?? [],
      }
    : undefined;

  // Step 1b: Funnel state
  const funnelState = await getOrInitFunnelState(supabase, conversationId, campaignId, funnels);

  // Step 1c: Action page metadata for the current funnel.
  // tenant_id filter prevents cross-tenant page reads AND surfaces the
  // "funnel points at a page from another tenant" data-drift case as a
  // graceful pause instead of an uncaught throw.
  const { data: pageRow } = await supabase
    .from("action_pages")
    .select("title, type")
    .eq("id", funnelState.funnel.actionPageId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!pageRow) {
    console.warn(
      `Funnel ${funnelState.funnel.id} (campaign ${campaignId}, tenant ${tenantId}) ` +
        `references missing or cross-tenant action_page ${funnelState.funnel.actionPageId}. ` +
        `Pausing reply for this conversation.`
    );
    await supabase.from("lead_events").insert({
      tenant_id: tenantId,
      lead_id: leadId,
      type: "send_failed",
      payload: {
        reason: "funnel_action_page_missing",
        funnel_id: funnelState.funnel.id,
        action_page_id: funnelState.funnel.actionPageId,
      },
    } as Database["public"]["Tables"]["lead_events"]["Insert"]);
    return {
      message: "",
      phaseAction: "stay",
      confidence: 0,
      imageIds: [],
      currentPhase: "",
      escalated: false,
      paused: true,
      completedFunnel: false,
    };
  }
  const pageType = pageRow.type as string;
  if (!ACTION_PAGE_TYPES.includes(pageType as ActionPageType)) {
    throw new Error(`Unsupported page type: ${pageType}`);
  }

  // Step 1d: Tenant tone
  const { data: toneRow } = await supabase
    .from("tenants")
    .select("persona_tone")
    .eq("id", tenantId)
    .single();
  const tone = (toneRow?.persona_tone as string | undefined) ?? "friendly";

  const step = funnelToStep({
    funnel: funnelState.funnel,
    allFunnels: funnels,
    campaign: { goal: campaignData?.goal ?? "stage_reached" },
    page: { title: pageRow.title as string, type: pageType as ActionPageType },
    tone,
  });

  // Step 2: Retrieve relevant knowledge
  const retrieval = await retrieveKnowledge({
    query: leadMessage,
    tenantId,
    context: {
      businessName,
      currentPhaseName: step.name,
      campaign: campaignContext,
    },
  });

  // Step 3: Fetch tenant image config
  const { data: tenantConfig } = await supabase
    .from("tenants")
    .select("max_images_per_response")
    .eq("id", tenantId)
    .single();

  const maxImages = tenantConfig?.max_images_per_response ?? 2;

  // Step 4: Select relevant images
  const selectedImages = await selectImages({
    tenantId,
    leadMessage,
    currentPhaseName: step.name,
    retrievedChunks: retrieval.chunks,
    maxImages,
  });

  // Convert to prompt builder format
  const promptImages: KnowledgeImage[] = selectedImages.map((img) => ({
    id: img.id,
    url: img.url,
    description: img.description,
    context_hint: img.contextHint,
  }));

  // Step 5: Build system prompt (with images in Layer 6)
  const systemPrompt = await buildSystemPrompt({
    tenantId,
    businessName,
    step,
    conversationId,
    ragChunks: retrieval.chunks,
    images: promptImages.length > 0 ? promptImages : undefined,
    campaign: campaignContext,
    leadId,
  });

  // Step 6: Call LLM
  const llmResponse = await generateResponse(systemPrompt, leadMessage);

  // Step 7: Parse decision
  const decision = parseDecision(llmResponse.content);

  // Step 7b: Validate action button selection
  // Each funnel step has exactly one allowed button. LLMs frequently hallucinate
  // a friendly name (e.g. "sign_up") instead of copying the UUID verbatim, so
  // when intent to send a button is clear we substitute the single allowed ID.
  let actionButton: { actionPageId: string; ctaText: string; label: string | null } | undefined;
  if (decision.actionButtonId) {
    const isValid = step.actionButtonIds.includes(decision.actionButtonId);
    // Drop a button the LLM wasn't confident about — a low-confidence button
    // send hurts CTR more than no button at all. The prompt tells the LLM
    // about this threshold so it self-gates.
    const buttonConfidenceOk =
      decision.buttonConfidence === null ||
      decision.buttonConfidence === undefined ||
      decision.buttonConfidence >= BUTTON_CONFIDENCE_THRESHOLD;

    if (!buttonConfidenceOk) {
      console.warn(
        `Dropping action button for conversation ${conversationId}: ` +
          `button_confidence=${decision.buttonConfidence} below threshold ${BUTTON_CONFIDENCE_THRESHOLD}.`
      );
    } else if (isValid) {
      if (!decision.ctaText) {
        console.warn(
          `LLM sent action_button_id without cta_text for conversation ${conversationId}. ` +
            `Falling back to action_pages.cta_text or generic — CTR will suffer.`
        );
      }
      actionButton = {
        actionPageId: decision.actionButtonId,
        ctaText: decision.ctaText ?? "",
        label: decision.buttonLabel,
      };
    } else if (step.actionButtonIds.length === 1) {
      console.warn(
        `LLM emitted non-UUID action_button_id="${decision.actionButtonId}" for conversation ${conversationId}. ` +
          `Substituting the single allowed button id=${step.actionButtonIds[0]}.`
      );
      if (!decision.ctaText) {
        console.warn(
          `LLM also omitted cta_text — using default. CTR will suffer.`
        );
      }
      actionButton = {
        actionPageId: step.actionButtonIds[0],
        ctaText: decision.ctaText ?? "",
        label: decision.buttonLabel,
      };
    } else {
      console.warn(
        `LLM emitted invalid action_button_id="${decision.actionButtonId}" for conversation ${conversationId}. ` +
          `Allowed=[${step.actionButtonIds.join(", ")}]. Button dropped.`
      );
    }
  }

  // Step 8: Strip leaked SEND_IMAGE tokens from message
  const parsed = parseResponse(decision.message);

  // Step 9: Merge and deduplicate image IDs from decision + response parser
  const mergedImageIds = [...new Set([...decision.imageIds, ...parsed.extractedImageIds])];

  // Step 10: Validate image IDs against tenant's actual images
  let validatedImageIds: string[] = [];
  if (mergedImageIds.length > 0) {
    const { data: validImages } = await supabase
      .from("knowledge_images")
      .select("id, url")
      .eq("tenant_id", tenantId)
      .in("id", mergedImageIds);

    if (validImages) {
      const validIdSet = new Set(validImages.map((img) => img.id));
      validatedImageIds = mergedImageIds.filter((id) => validIdSet.has(id));
    }
  }

  // Step 11: Apply side effects
  let escalated = false;
  let completedFunnel = false;

  if (decision.phaseAction === "advance") {
    const r = await advanceFunnel(supabase, conversationId, funnels);
    completedFunnel = r.completed && !r.advanced;
  } else if (decision.phaseAction === "escalate") {
    escalated = true;

    // Determine escalation reason
    const escalationReason =
      parsed.cleanMessage.trim() === ""
        ? "empty_response"
        : decision.confidence < 0.4
          ? "low_confidence"
          : "llm_decision";

    await supabase
      .from("conversations")
      .update({
        needs_human: true,
        escalation_reason: escalationReason,
        escalation_message_id: leadMessageId ?? null,
      })
      .eq("id", conversationId);

    await supabase.from("escalation_events").insert({
      conversation_id: conversationId,
      tenant_id: tenantId,
      type: "escalated",
      reason: escalationReason,
    });
  }
  // "stay" is a no-op

  // Step 12b: Extract knowledge from lead message (non-blocking)
  extractKnowledge({
    tenantId,
    leadId,
    messageText: leadMessage,
    messageId: leadMessageId ?? null,
  }).catch((err) => {
    console.warn(
      `extractKnowledge failed for lead ${leadId} (tenant ${tenantId}): ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  });

  // Step 12c: Check for conversation idle gap and trigger summary
  const { data: lastMsg } = await supabase
    .from("messages")
    .select("created_at")
    .eq("conversation_id", conversationId)
    .neq("id", leadMessageId ?? "")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastMsg?.created_at) {
    const gap = Date.now() - new Date(lastMsg.created_at).getTime();
    const TEN_MINUTES_MS = 10 * 60 * 1000;
    if (gap >= TEN_MINUTES_MS) {
      generateLeadSummary({ tenantId, leadId, conversationId }).catch((err) => {
        console.warn(
          `generateLeadSummary failed for lead ${leadId} (tenant ${tenantId}): ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      });
    }
  }

  // Step 13: Use the cleaned LLM message verbatim. Confidence is used for
  // routing (escalate, drop button) — not for rewriting the bot's voice.
  const finalMessage = parsed.cleanMessage;

  // Step 14: Return EngineOutput
  return {
    message: finalMessage,
    phaseAction: decision.phaseAction,
    confidence: decision.confidence,
    imageIds: validatedImageIds,
    currentPhase: step.name,
    escalated,
    paused: false,
    completedFunnel,
    actionButton,
  };
}
