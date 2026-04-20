import { createServiceClient } from "@/lib/supabase/service";
import type { CurrentPhase } from "@/lib/ai/phase-machine";
import type { ChunkResult } from "@/lib/ai/vector-search";

const MAX_HISTORY_CHARS = 8000;
const MAX_HISTORY_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 2000;
const SECTION_HEADER_RE = /^---\s+[A-Z][A-Z\s]+---/gm;

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
  testMode?: boolean;
  historyOverride?: { role: "user" | "bot"; text: string }[];
}

interface BotRule {
  rule_text: string;
  category: string;
}

interface MessageRow {
  direction: string;
  text: string | null;
}

// Layer 1
function buildBasePersona(
  businessName: string,
  personaTone: string,
  customInstructions: string | null
): string {
  const lines = [
    `You are a helpful assistant for ${businessName}.`,
    `Tone: ${personaTone}. Sound like a real human. Keep messages short and conversational. Never use bullet lists or corporate speak.`,
    `CRITICAL CONVERSATION RULES:`,
    `- NEVER greet or say hi again after the first message. Read the conversation history — if you already greeted, jump straight into the conversation naturally.`,
    `- Use "..." for natural pauses mid-thought, like a real person texting (e.g. "that's interesting... so you're looking for")`,
    `- Break your message into 2-3 natural lines when it makes sense, like how people actually text — but don't over-separate every sentence into its own line.`,
    `- Match the lead's energy and language style. If they're casual, be casual back.`,
    `- Never repeat yourself. If you already asked a question, don't ask it again.`,
    `- Sound like you're actually paying attention to what they said. Reference their words.`,
  ];
  if (customInstructions?.trim()) {
    lines.push(customInstructions.trim());
  }
  return lines.join("\n");
}

// Layer 2
function buildBotRules(rules: BotRule[]): string {
  if (!rules || rules.length === 0) return "";
  const grouped: Record<string, string[]> = {};
  for (const rule of rules) {
    const cat = (rule.category ?? "general").toUpperCase();
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(rule.rule_text);
  }
  const lines: string[] = ["--- BOT RULES ---"];
  for (const [category, texts] of Object.entries(grouped)) {
    lines.push(`${category}:`);
    for (const text of texts) lines.push(`- ${text}`);
  }
  return lines.join("\n");
}

// Layer 3
function buildPhaseContext(phase: CurrentPhase, testMode: boolean): string {
  if (testMode) {
    return "--- CURRENT PHASE ---\nTEST MODE — no active phase. Respond based on retrieved knowledge and rules only.";
  }
  return [
    `--- CURRENT PHASE: ${phase.name} ---`,
    `Instructions: ${phase.systemPrompt}`,
    `Tone: ${phase.tone}`,
    `Goals: ${phase.goals ?? "None"}`,
    `Transition hint: ${phase.transitionHint ?? "None"}`,
    `Messages in this phase: ${phase.messageCount} / ${phase.maxMessages} (soft limit)`,
  ].join("\n");
}

// Layer 4 — with injection mitigation
function sanitizeMessageText(text: string): string {
  return text
    .replace(SECTION_HEADER_RE, "[REDACTED]")
    .slice(0, MAX_MESSAGE_CHARS);
}

function buildConversationHistory(messages: MessageRow[]): string {
  const header = "--- CONVERSATION HISTORY ---";
  if (!messages || messages.length === 0) {
    return `${header}\nNo previous messages.`;
  }
  const chronological = [...messages].reverse();
  const formatted: string[] = [];
  let totalChars = 0;
  for (const msg of chronological) {
    const role = msg.direction === "in" ? "Lead" : "Bot";
    const safeText = sanitizeMessageText(msg.text ?? "(no text)");
    const line = `${role}: ${safeText}`;
    if (totalChars + line.length > MAX_HISTORY_CHARS) break;
    formatted.push(line);
    totalChars += line.length + 1;
  }
  if (formatted.length === 0) return `${header}\nNo previous messages.`;
  return `${header}\n${formatted.join("\n")}`;
}

// Layer 5 — with anti-hallucination instruction and source labels
function buildRetrievedKnowledge(chunks: ChunkResult[]): string {
  const header = "--- RETRIEVED KNOWLEDGE ---";
  if (!chunks || chunks.length === 0) {
    return `${header}\nNo specific knowledge retrieved. Answer based on the conversation and your instructions.`;
  }
  const blocks = chunks.map((chunk, i) => {
    const source = (chunk.metadata?.kb_type as string) ?? "general";
    return `[${i + 1}] ${chunk.content} (source: ${source})`;
  });
  return [
    header,
    ...blocks,
    "",
    "IMPORTANT: Answer ONLY using information from the retrieved knowledge above. If the answer is not present in the knowledge base, honestly say you don't know and set confidence below 0.4. Do not invent facts.",
  ].join("\n");
}

// Layer 6
function buildAvailableImages(images?: KnowledgeImage[]): string {
  const header = "--- AVAILABLE IMAGES ---";
  if (!images || images.length === 0) return `${header}\nNo images available.`;
  const lines = [header, "You may include relevant images in your response:"];
  for (const img of images) {
    lines.push(`- [${img.id}] ${img.description} — ${img.context_hint ?? ""}`);
  }
  lines.push("", 'If an image is relevant, include its ID in the "image_ids" array in your response.');
  return lines.join("\n");
}

// Layer 7 — with cited_chunks
function buildDecisionInstructions(): string {
  return `--- RESPONSE FORMAT ---
You MUST respond with a JSON object and nothing else. No text before or after the JSON.

{
  "message": "Your response to the lead (plain text, conversational)",
  "phase_action": "stay or advance or escalate",
  "confidence": 0.0 to 1.0,
  "image_ids": [],
  "cited_chunks": [1, 2]
}

- "phase_action": "stay" to remain, "advance" if lead is ready, "escalate" if you cannot help.
- "confidence": 1.0 = very confident, 0.0 = not confident. Set below 0.4 if unsure.
- "image_ids": Image IDs to send. Empty array if none.
- "cited_chunks": Indices of the knowledge chunks you used (e.g. [1, 2]).`;
}

export async function buildSystemPrompt(ctx: PromptContext): Promise<string> {
  const supabase = createServiceClient();

  const rulesPromise = supabase
    .from("bot_rules")
    .select("rule_text, category")
    .eq("tenant_id", ctx.tenantId)
    .eq("enabled", true);

  const messagesPromise = ctx.historyOverride
    ? Promise.resolve({
        data: [...ctx.historyOverride].reverse().map((m) => ({
          direction: m.role === "user" ? "in" : "out",
          text: m.text,
        })) as MessageRow[],
        error: null,
      })
    : ctx.testMode
      ? Promise.resolve({ data: [] as MessageRow[], error: null })
      : supabase
          .from("messages")
          .select("direction, text")
          .eq("conversation_id", ctx.conversationId)
          .order("created_at", { ascending: false })
          .limit(MAX_HISTORY_MESSAGES);

  const personaPromise = supabase
    .from("tenants")
    .select("persona_tone, custom_instructions")
    .eq("id", ctx.tenantId)
    .single() as unknown as Promise<{ data: { persona_tone: string; custom_instructions: string | null } | null; error: unknown }>;

  const [rulesResult, messagesResult, personaResult] = await Promise.all([
    rulesPromise,
    messagesPromise,
    personaPromise,
  ]);

  const rules: BotRule[] = rulesResult.data ?? [];
  const messages: MessageRow[] = messagesResult.data ?? [];
  const personaTone: string = personaResult.data?.persona_tone ?? "friendly";
  const customInstructions: string | null = personaResult.data?.custom_instructions ?? null;

  const layer1 = buildBasePersona(ctx.businessName, personaTone, customInstructions);
  const layer2 = buildBotRules(rules);
  const layer3 = buildPhaseContext(ctx.currentPhase, ctx.testMode ?? false);
  const layer4 = buildConversationHistory(messages);
  const layer5 = buildRetrievedKnowledge(ctx.ragChunks);
  const layer6 = buildAvailableImages(ctx.images);
  const layer7 = buildDecisionInstructions();

  return [layer1, layer2, layer3, layer4, layer5, layer6, layer7]
    .filter((l) => l.length > 0)
    .join("\n\n");
}
