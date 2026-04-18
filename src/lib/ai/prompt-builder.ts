import { createServiceClient } from "@/lib/supabase/service";
import type { CurrentPhase } from "@/lib/ai/phase-machine";
import type { ChunkResult } from "@/lib/ai/vector-search";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_HISTORY_CHARS = 8000;
const MAX_HISTORY_MESSAGES = 20;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface KnowledgeImage {
  id: string;
  url: string;
  description: string;
  context_hint: string | null;
}

export interface PromptContext {
  tenantId: string;
  businessName: string;
  currentPhase: CurrentPhase;
  conversationId: string;
  ragChunks: ChunkResult[];
  images?: KnowledgeImage[];
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface BotRule {
  rule_text: string;
  category: string;
}

interface MessageRow {
  direction: string;
  text: string | null;
}

// ---------------------------------------------------------------------------
// Layer builders
// ---------------------------------------------------------------------------

/** Layer 1: Base persona */
function buildBasePersona(businessName: string): string {
  return `You are a helpful assistant for ${businessName}. Sound like a real human. Keep messages short and conversational. Never use bullet lists or corporate speak.`;
}

/** Layer 2: Bot rules grouped by category */
function buildBotRules(rules: BotRule[]): string {
  if (!rules || rules.length === 0) return "";

  // Group by category
  const grouped: Record<string, string[]> = {};
  for (const rule of rules) {
    const cat = (rule.category ?? "general").toUpperCase();
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(rule.rule_text);
  }

  const lines: string[] = ["--- BOT RULES ---"];
  for (const [category, texts] of Object.entries(grouped)) {
    lines.push(`${category}:`);
    for (const text of texts) {
      lines.push(`- ${text}`);
    }
  }

  return lines.join("\n");
}

/** Layer 3: Current phase context */
function buildPhaseContext(phase: CurrentPhase): string {
  const lines = [
    `--- CURRENT PHASE: ${phase.name} ---`,
    `Instructions: ${phase.systemPrompt}`,
    `Tone: ${phase.tone}`,
    `Goals: ${phase.goals ?? "None"}`,
    `Transition hint: ${phase.transitionHint ?? "None"}`,
    `Messages in this phase: ${phase.messageCount} / ${phase.maxMessages} (soft limit)`,
  ];
  return lines.join("\n");
}

/** Layer 4: Conversation history */
function buildConversationHistory(messages: MessageRow[]): string {
  const header = "--- CONVERSATION HISTORY ---";

  if (!messages || messages.length === 0) {
    return `${header}\nNo previous messages.`;
  }

  // Messages come from DB in DESC order — reverse to chronological
  const chronological = [...messages].reverse();

  const formatted: string[] = [];
  let totalChars = 0;

  for (const msg of chronological) {
    const role = msg.direction === "in" ? "Lead" : "Bot";
    const line = `${role}: ${msg.text ?? "(no text)"}`;

    if (totalChars + line.length > MAX_HISTORY_CHARS) break;

    formatted.push(line);
    totalChars += line.length + 1; // +1 for newline
  }

  if (formatted.length === 0) {
    return `${header}\nNo previous messages.`;
  }

  return `${header}\n${formatted.join("\n")}`;
}

/** Layer 5: Retrieved knowledge (RAG chunks) */
function buildRetrievedKnowledge(chunks: ChunkResult[]): string {
  const header = "--- RETRIEVED KNOWLEDGE ---";

  if (!chunks || chunks.length === 0) {
    return `${header}\nNo specific knowledge retrieved. Answer based on the conversation and your instructions.`;
  }

  const blocks = chunks.map((chunk, i) => `[${i + 1}] ${chunk.content}`);
  return `${header}\n${blocks.join("\n")}`;
}

/** Layer 6: Available images */
function buildAvailableImages(images?: KnowledgeImage[]): string {
  const header = "--- AVAILABLE IMAGES ---";

  if (!images || images.length === 0) {
    return `${header}\nNo images available.`;
  }

  const lines = [
    header,
    "You may include relevant images in your response:",
  ];

  for (const img of images) {
    lines.push(`- [${img.id}] ${img.description} — ${img.context_hint ?? ""}`);
  }

  lines.push(
    "",
    'If an image is relevant, include its ID in the "image_ids" array in your response.'
  );

  return lines.join("\n");
}

/** Layer 7: Decision / response format instructions */
function buildDecisionInstructions(): string {
  return `--- RESPONSE FORMAT ---
You MUST respond with a JSON object and nothing else. No text before or after the JSON.

{
  "message": "Your response to the lead (plain text, conversational)",
  "phase_action": "stay or advance or escalate",
  "confidence": 0.0 to 1.0,
  "image_ids": []
}

- "phase_action": Use "stay" to remain in the current phase. Use "advance" if the lead is ready for the next step. Use "escalate" if you cannot help and a human should take over.
- "confidence": How confident you are in your response. 1.0 = very confident, 0.0 = not confident at all.
- "image_ids": Array of image IDs to send after your message. Empty array if no images.`;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function buildSystemPrompt(ctx: PromptContext): Promise<string> {
  const supabase = createServiceClient();

  // Fetch bot rules and conversation history in parallel
  const [rulesResult, messagesResult] = await Promise.all([
    supabase
      .from("bot_rules")
      .select("rule_text, category")
      .eq("tenant_id", ctx.tenantId)
      .eq("enabled", true),
    supabase
      .from("messages")
      .select("direction, text")
      .eq("conversation_id", ctx.conversationId)
      .order("created_at", { ascending: false })
      .limit(MAX_HISTORY_MESSAGES),
  ]);

  const rules: BotRule[] = rulesResult.data ?? [];
  const messages: MessageRow[] = messagesResult.data ?? [];

  // Build each layer
  const layer1 = buildBasePersona(ctx.businessName);
  const layer2 = buildBotRules(rules);
  const layer3 = buildPhaseContext(ctx.currentPhase);
  const layer4 = buildConversationHistory(messages);
  const layer5 = buildRetrievedKnowledge(ctx.ragChunks);
  const layer6 = buildAvailableImages(ctx.images);
  const layer7 = buildDecisionInstructions();

  // Concatenate layers, omitting empty sections (layer 2 can be empty)
  const layers = [layer1, layer2, layer3, layer4, layer5, layer6, layer7]
    .filter((l) => l.length > 0)
    .join("\n\n");

  return layers;
}
