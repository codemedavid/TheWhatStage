import { createServiceClient } from "@/lib/supabase/service";
import type { StepContext } from "@/lib/ai/step-context";
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

export interface CampaignContext {
  name: string;
  description: string | null;
  goal: string;
  campaignRules?: string[];
}

export interface PromptContext {
  tenantId: string;
  businessName: string;
  step: StepContext;
  conversationId: string;
  ragChunks: ChunkResult[];
  images?: KnowledgeImage[];
  testMode?: boolean;
  historyOverride?: { role: "user" | "bot"; text: string }[];
  campaign?: CampaignContext;
  leadId?: string;
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
    `You are someone who works at ${businessName}. You're chatting with a real person on Messenger right now. This is a real conversation — not a support ticket, not a demo. Just two people talking.`,
    ``,
    `Your personality: ${personaTone}. That's just who you are — don't perform it, just be it.`,
    ``,
    `HOW YOU TALK:`,
    `- Like you're texting someone. Short, natural, no fluff.`,
    `- You have opinions. You make recommendations. You don't just ask questions and wait.`,
    `- You respond to what they MEAN, not just what they said. Read between the lines.`,
    `- You can joke, tease lightly, or be blunt when it fits. You're a person.`,
    `- Mirror their energy. If they're chill, be chill. If they're excited, match it.`,
    `- Match their language exactly. Taglish? Taglish back. English? English.`,
    `- Use "..." for natural pauses. Break long thoughts into 2-3 short lines like real texting.`,
    `- 1-2 sentences per message. Rarely more.`,
    `- Ask only ONE question per message. Never stack questions.`,
    `- When the lead gives a short answer, acknowledge it briefly and ask one follow-up. Don't explain, lecture, or expand on what they said.`,
    `- Never respond to a short message with a long one. Match their length.`,
    ``,
    `TONE RULES:`,
    `- Don't over-empathize. No "I totally understand how frustrating that must be" or "That sounds really tough." Just acknowledge and move on.`,
    `- Don't dramatize their problem. If they say "medyo mahal," don't turn it into "budget is a big concern for you." Just address it simply.`,
    `- Don't over-explain. If they ask a yes/no question, answer it. Don't add three paragraphs of context they didn't ask for.`,
    `- Don't sound like a sales script. No "I'd love to help you find the perfect solution." Just talk.`,
    `- Simple confirmations before follow-ups. Acknowledge what they said in a few words, then ask the next thing.`,
    ``,
    `DEAD GIVEAWAYS THAT YOU'RE A BOT (never do these):`,
    `- Greeting them after the first message ("Hi!", "Hello again!")`,
    `- Thanking them for reaching out or complimenting their interest`,
    `- Repeating what they just said back to them ("So you're looking for X?")`,
    `- Reacting with fake enthusiasm ("That's amazing!", "Great choice!", "Awesome!")`,
    `- Asking multiple questions in one message`,
    `- Generic questions like "how can I help you?" or "what are you looking for?"`,
    `- Being overly polite or formal — nobody talks like that on Messenger`,
    `- Starting consecutive messages the same way`,
    `- Listing things with bullet points or numbered lists in chat`,
    `- Using words like "certainly", "absolutely", "I'd be happy to" — these are AI tells`,
    `- Over-empathizing or making their situation sound bigger than it is`,
    `- Summarizing everything they've said so far — they were there, they know`,
  ];
  if (customInstructions?.trim()) {
    lines.push(``, customInstructions.trim());
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

// Layer 2.5
function buildCampaignRules(rules?: string[]): string {
  if (!rules || rules.length === 0) return "";
  return [
    "--- CAMPAIGN RULES ---",
    "These rules apply to this specific campaign. Follow them in every phase:",
    ...rules.map((r) => `- ${r}`),
  ].join("\n");
}

function buildStepContext(step: StepContext, testMode: boolean): string {
  if (testMode) {
    return "--- CURRENT STEP ---\nTEST MODE — no active step. Respond based on retrieved knowledge and rules only.";
  }
  const lines = [
    `--- WHERE YOU ARE IN THE FUNNEL ---`,
    `${step.name}`,
    ``,
    step.instructions,
    `Vibe: ${step.tone}`,
  ];
  if (step.goal) lines.push(`Campaign goal: ${step.goal}`);
  if (step.transitionHint) lines.push(`When to move on: ${step.transitionHint}`);
  lines.push(`(You've exchanged ${step.messageCount} messages in this step — soft limit is ${step.maxMessages}, don't rush but don't linger either)`);
  if (step.position === 0) {
    lines.push(`\nEARLY CONVERSATION — keep replies to 1-2 short lines only. No walls of text. You're just getting to know them.`);
  }
  lines.push(
    "",
    "The step is guidance, not a rule. If the lead's intent clearly belongs to another step, respond to the lead's intent first. You may advance when the conversation naturally moves forward."
  );
  return lines.join("\n");
}

function buildSalesStrategy(): string {
  return [
    "--- SALES CONVERSATION STRATEGY ---",
    "Use this as hidden reasoning, not as a script.",
    "- Clarify: understand why they reached out and what outcome they want.",
    "- Label: briefly reflect the problem or desire in their words.",
    "- Overview: if useful, ask what they tried, considered, or need to compare.",
    "- Sell outcome: connect the offer to the result they care about, not just features.",
    "- Explain concerns: answer price, trust, fit, timing, and decision-maker concerns directly.",
    "- Reinforce: after they choose a next step, make them feel clear about what happens next.",
    "",
    "Do not force every step. Pick the next useful move for this exact message.",
  ].join("\n");
}

function buildVagueIntentRules(): string {
  return [
    "--- VAGUE BUYING SIGNALS ---",
    'If the lead says "interested", "details", "how much", "available?", "pa info", "hm", or similar:',
    "- Assume they mean the current offer if one is available.",
    "- Reply with a short contextual bridge showing you know the offer.",
    "- Ask only one next question, or give the next action if the path is clear.",
    '- Do not ask "interested in what?" unless there are multiple unrelated offers and no campaign context.',
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

// Layer 6.5 — action buttons
interface ActionButtonInfo {
  id: string;
  title: string;
  type: string;
  cta_text: string | null;
}

function buildAvailableActionButtons(buttons: ActionButtonInfo[]): string {
  const header = "--- ACTION BUTTONS AVAILABLE ---";
  if (buttons.length === 0) return "";

  const lines = [
    header,
    "You can send ONE action button when the lead is ready. Available buttons:",
  ];
  for (const btn of buttons) {
    const cta = btn.cta_text ?? "Check this out";
    lines.push(`- id: "${btn.id}" | title: "${btn.title}" | type: ${btn.type} | default_cta: "${cta}"`);
  }
  lines.push(
    "",
    'To send a button, include "action_button_id" in your JSON response with the button\'s id.',
    'Optionally include "cta_text" with a personalized call-to-action message. If omitted, the default is used.',
    "Only send a button when the timing feels natural — after building rapport or qualifying the lead. Do not send a button in every message."
  );
  return lines.join("\n");
}

// Layer 7 — business offering & direction
function buildOfferingContext(
  businessType: string,
  botGoal: string,
  campaign?: CampaignContext
): string {
  const goalLabels: Record<string, string> = {
    qualify_leads: "qualify them and understand if they're a good fit",
    sell: "guide them toward making a purchase",
    understand_intent: "figure out what they actually need",
    collect_lead_info: "collect their contact info naturally",
    book_appointment: "get them to book a call or appointment",
  };

  const goalDirection = goalLabels[botGoal] ?? botGoal;

  const lines = [
    "--- YOUR MISSION ---",
    `You work for a ${businessType} business. Your job is to ${goalDirection}.`,
    `Every message you send should subtly move the conversation toward this goal. Don't be pushy — be strategic. Guide naturally.`,
  ];

  if (campaign) {
    lines.push(`\nCurrent campaign: "${campaign.name}"`);
    if (campaign.description) {
      lines.push(`What we're offering: ${campaign.description}`);
    }
    lines.push(`Campaign goal: ${campaign.goal}`);
    lines.push(`Always keep this offering in mind. You know what we sell — weave it into conversation naturally when relevant.`);
  }

  lines.push(`\nSTRATEGY: Be aware of what you're selling at all times. Don't wait for them to ask — find natural moments to bring it up. But don't force it. Follow the phase flow.`);

  return lines.join("\n");
}

// Layer 8 — with cited_chunks
function buildDecisionInstructions(): string {
  return `--- RESPONSE FORMAT ---
You MUST respond with a JSON object and nothing else. No text before or after the JSON.

{
  "message": "Your response to the lead (plain text, conversational)",
  "phase_action": "stay or advance or escalate",
  "confidence": 0.0 to 1.0,
  "image_ids": [],
  "cited_chunks": [1, 2],
  "action_button_id": "optional — id of the action button to send, or omit",
  "cta_text": "optional — personalized call-to-action text, or omit to use default"
}

- "phase_action": "stay" to remain, "advance" if lead is ready, "escalate" if you cannot help.
- "confidence": 1.0 = very confident, 0.0 = not confident. Set below 0.4 if unsure.
- "image_ids": Image IDs to send. Empty array if none.
- "cited_chunks": Indices of the knowledge chunks you used (e.g. [1, 2]).
- "action_button_id": Include ONLY when you want to send an action button. Omit otherwise.
- "cta_text": Custom call-to-action text for the button. Omit to use the default.`;
}

// Layer 5.5 — lead-specific context from contacts, knowledge, and form submissions
interface LeadContact {
  type: string;
  value: string;
  is_primary: boolean;
}

interface LeadKnowledgeEntry {
  key: string;
  value: string;
}

interface LeadSubmission {
  form_title: string;
  submitted_at: string;
  data: Record<string, unknown>;
}

export interface LeadContextData {
  contacts: LeadContact[];
  knowledge: LeadKnowledgeEntry[];
  submissions: LeadSubmission[];
}

export function buildLeadContext(data: LeadContextData): string {
  const header = "--- WHAT YOU KNOW ABOUT THIS LEAD ---";

  if (data.contacts.length === 0 && data.knowledge.length === 0 && data.submissions.length === 0) {
    return `${header}\nNo lead-specific data available yet.`;
  }

  const lines: string[] = [header];

  // Contacts
  if (data.contacts.length > 0) {
    lines.push("Contact info on file:");
    const byType: Record<string, LeadContact[]> = {};
    for (const c of data.contacts) {
      if (!byType[c.type]) byType[c.type] = [];
      byType[c.type].push(c);
    }
    for (const [type, contacts] of Object.entries(byType)) {
      const formatted = contacts
        .map((c) => c.value + (c.is_primary ? " (primary)" : ""))
        .join(", ");
      lines.push(`- ${type}: ${formatted}`);
    }
  }

  // Knowledge
  if (data.knowledge.length > 0) {
    lines.push("Known facts:");
    for (const k of data.knowledge) {
      lines.push(`- ${k.key}: ${k.value}`);
    }
  }

  // Submissions
  if (data.submissions.length > 0) {
    lines.push("Form submissions:");
    for (const s of data.submissions) {
      const entries = Object.entries(s.data)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      lines.push(`- "${s.form_title}" on ${s.submitted_at}: ${entries}`);
    }
  }

  lines.push(
    "",
    "Use this info naturally. Don't re-ask for info you already have. Reference it when relevant."
  );

  return lines.join("\n");
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
    .select("persona_tone, custom_instructions, business_type, bot_goal")
    .eq("id", ctx.tenantId)
    .single() as unknown as Promise<{ data: { persona_tone: string; custom_instructions: string | null; business_type: string; bot_goal: string } | null; error: unknown }>;

  const [rulesResult, messagesResult, personaResult] = await Promise.all([
    rulesPromise,
    messagesPromise,
    personaPromise,
  ]);

  const rules: BotRule[] = rulesResult.data ?? [];
  const messages: MessageRow[] = messagesResult.data ?? [];
  const personaTone: string = personaResult.data?.persona_tone ?? "friendly";
  const customInstructions: string | null = personaResult.data?.custom_instructions ?? null;
  const businessType: string = personaResult.data?.business_type ?? "services";
  const botGoal: string = personaResult.data?.bot_goal ?? "qualify_leads";

  const layer1 = buildBasePersona(ctx.businessName, personaTone, customInstructions);
  const layer2 = buildBotRules(rules);
  const campaignRulesLayer = buildCampaignRules(ctx.campaign?.campaignRules);
  const layer3 = buildOfferingContext(businessType, botGoal, ctx.campaign);
  const layer4 = buildSalesStrategy();
  const layer5 = buildVagueIntentRules();
  const layer6 = buildStepContext(ctx.step, ctx.testMode ?? false);
  const layer7 = buildConversationHistory(messages);
  const layer8 = buildRetrievedKnowledge(ctx.ragChunks);
  const layer9 = buildAvailableImages(ctx.images);
  const layer10 = buildDecisionInstructions();

  // Fetch lead context if leadId is provided
  let leadContextData: LeadContextData = { contacts: [], knowledge: [], submissions: [] };
  if (ctx.leadId) {
    const [contactsRes, knowledgeRes, submissionsRes] = await Promise.all([
      supabase
        .from("lead_contacts")
        .select("type, value, is_primary")
        .eq("tenant_id", ctx.tenantId)
        .eq("lead_id", ctx.leadId),
      supabase
        .from("lead_knowledge")
        .select("key, value")
        .eq("tenant_id", ctx.tenantId)
        .eq("lead_id", ctx.leadId),
      supabase
        .from("action_submissions")
        .select("data, created_at, action_page_id")
        .eq("tenant_id", ctx.tenantId)
        .eq("lead_id", ctx.leadId)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    // Fetch action page titles for submissions
    const submissions: LeadSubmission[] = [];
    if (submissionsRes.data && submissionsRes.data.length > 0) {
      const pageIds = [...new Set(submissionsRes.data.map((s: { action_page_id: string }) => s.action_page_id))];
      const { data: pages } = await supabase
        .from("action_pages")
        .select("id, title")
        .in("id", pageIds);
      const pageMap = new Map((pages ?? []).map((p: { id: string; title: string }) => [p.id, p.title]));

      for (const s of submissionsRes.data) {
        submissions.push({
          form_title: pageMap.get(s.action_page_id) ?? "Unknown Form",
          submitted_at: new Date(s.created_at).toISOString().split("T")[0],
          data: (s.data ?? {}) as Record<string, unknown>,
        });
      }
    }

    leadContextData = {
      contacts: (contactsRes.data ?? []) as LeadContact[],
      knowledge: (knowledgeRes.data ?? []) as LeadKnowledgeEntry[],
      submissions,
    };
  }

  const leadLayer = buildLeadContext(leadContextData);

  // Fetch action button info if phase has action buttons
  let actionButtons: ActionButtonInfo[] = [];
  if (ctx.step.actionButtonIds.length > 0) {
    const { data: actionPages } = await supabase
      .from("action_pages")
      .select("id, title, type, cta_text")
      .eq("tenant_id", ctx.tenantId)
      .in("id", ctx.step.actionButtonIds);

    if (actionPages) {
      actionButtons = actionPages as ActionButtonInfo[];
    }
  }

  const actionButtonsLayer = buildAvailableActionButtons(actionButtons);

  return [layer1, layer2, campaignRulesLayer, layer3, layer4, layer5, layer6, layer7, layer8, leadLayer, layer9, actionButtonsLayer, layer10]
    .filter((l) => l.length > 0)
    .join("\n\n");
}
