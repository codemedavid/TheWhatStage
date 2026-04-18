import { getCurrentPhase, advancePhase, incrementMessageCount } from "@/lib/ai/phase-machine";
import { retrieveKnowledge } from "@/lib/ai/retriever";
import { buildSystemPrompt } from "@/lib/ai/prompt-builder";
import { generateResponse } from "@/lib/ai/llm-client";
import { parseDecision } from "@/lib/ai/decision-parser";
import { createServiceClient } from "@/lib/supabase/service";

export interface EngineInput {
  tenantId: string;
  businessName: string;
  conversationId: string;
  leadMessage: string;
}

export interface EngineOutput {
  message: string;
  phaseAction: "stay" | "advance" | "escalate";
  confidence: number;
  imageIds: string[];
  currentPhase: string;
  escalated: boolean;
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
  const { tenantId, businessName, conversationId, leadMessage } = input;

  // Step 1: Get/initialize current phase
  const currentPhase = await getCurrentPhase(conversationId, tenantId);

  // Step 2: Retrieve relevant knowledge
  const retrieval = await retrieveKnowledge({ query: leadMessage, tenantId });

  // Step 3: Build system prompt
  const systemPrompt = await buildSystemPrompt({
    tenantId,
    businessName,
    currentPhase,
    conversationId,
    ragChunks: retrieval.chunks,
  });

  // Step 4: Call LLM
  const llmResponse = await generateResponse(systemPrompt, leadMessage);

  // Step 5: Parse decision
  const decision = parseDecision(llmResponse.content);

  // Step 6: Apply side effects
  let escalated = false;

  if (decision.phaseAction === "advance") {
    await advancePhase(conversationId, tenantId);
  } else if (decision.phaseAction === "escalate") {
    escalated = true;
    const supabase = createServiceClient();
    await supabase
      .from("conversations")
      .update({ needs_human: true })
      .eq("id", conversationId);
  }
  // "stay" is a no-op

  // Step 7: Increment message count
  await incrementMessageCount(currentPhase.conversationPhaseId);

  // Step 8: Apply confidence hedging
  const finalMessage = applyHedging(decision.message, decision.confidence);

  // Step 9: Return EngineOutput
  return {
    message: finalMessage,
    phaseAction: decision.phaseAction,
    confidence: decision.confidence,
    imageIds: decision.imageIds,
    currentPhase: currentPhase.name,
    escalated,
  };
}
