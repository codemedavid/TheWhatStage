import { getCurrentPhase, advancePhase, incrementMessageCount } from "@/lib/ai/phase-machine";
import { retrieveKnowledge } from "@/lib/ai/retriever";
import { buildSystemPrompt } from "@/lib/ai/prompt-builder";
import type { KnowledgeImage } from "@/lib/ai/prompt-builder";
import { generateResponse } from "@/lib/ai/llm-client";
import { parseDecision } from "@/lib/ai/decision-parser";
import { selectImages } from "@/lib/ai/image-selector";
import { parseResponse } from "@/lib/ai/response-parser";
import { createServiceClient } from "@/lib/supabase/service";

export interface EngineInput {
  tenantId: string;
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
}

const HEDGING_PHRASES = [
  "I believe",
  "If I'm not mistaken,",
  "From what I understand,",
  "I think",
  "As far as I know,",
];

function applyHedging(message: string, confidence: number): string {
  if (confidence >= 0.7 || confidence < 0.4) return message;
  const phrase = HEDGING_PHRASES[Math.floor(Math.random() * HEDGING_PHRASES.length)];
  const lowerFirst = message.charAt(0).toLowerCase() + message.slice(1);
  return `${phrase} ${lowerFirst}`;
}

export async function handleMessage(input: EngineInput): Promise<EngineOutput> {
  const { tenantId, businessName, conversationId, leadMessage, leadMessageId } = input;
  const supabase = createServiceClient();

  // Gate check: if bot is paused for human handoff, return early or auto-resume
  const { data: conversation } = await supabase
    .from("conversations")
    .select("bot_paused_at")
    .eq("id", conversationId)
    .single();

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

  // Step 1: Get/initialize current phase
  const currentPhase = await getCurrentPhase(conversationId, tenantId);

  // Step 2: Retrieve relevant knowledge
  const retrieval = await retrieveKnowledge({ query: leadMessage, tenantId });

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
    currentPhaseName: currentPhase.name,
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
    currentPhase,
    conversationId,
    ragChunks: retrieval.chunks,
    images: promptImages.length > 0 ? promptImages : undefined,
  });

  // Step 6: Call LLM
  const llmResponse = await generateResponse(systemPrompt, leadMessage);

  // Step 7: Parse decision
  const decision = parseDecision(llmResponse.content);

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

  if (decision.phaseAction === "advance") {
    await advancePhase(conversationId, tenantId);
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

  // Step 12: Increment message count
  await incrementMessageCount(currentPhase.conversationPhaseId);

  // Step 13: Apply confidence hedging to cleaned message
  const finalMessage = applyHedging(parsed.cleanMessage, decision.confidence);

  // Step 14: Return EngineOutput
  return {
    message: finalMessage,
    phaseAction: decision.phaseAction,
    confidence: decision.confidence,
    imageIds: validatedImageIds,
    currentPhase: currentPhase.name,
    escalated,
    paused: false,
  };
}
