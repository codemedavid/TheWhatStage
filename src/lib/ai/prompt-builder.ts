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
  mainGoal?: string | null;
  campaignPersonality?: string | null;
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
  _personaTone: string,
  _customInstructions: string | null
): string {
  const lines: string[] = [
    `--- HARD CONVERSATION RULES ---`,
    `You work at ${businessName} and you're chatting with a real person on Messenger. Two humans, not a script.`,
    ``,
    `Conversation shape:`,
    `- Respond to what they actually said. Tie every reply to specific words/topic from their last message.`,
    `- Move forward with ONE thing per reply: a sharp question, a small piece of value, or a next step.`,
    `- 1-2 sentences per message. Match their length. Short message → short reply.`,
    `- Mirror their language and energy (English → English, Taglish → Taglish, formal → formal, casual → casual).`,
    `- Read what they MEAN, not just what they said.`,
    ``,
    `Hard rules (these are non-negotiable bot-detection failures):`,
    `- Exactly ONE question per message. Never two. Never "X? Or Y?".`,
    `- Never start two consecutive replies with the same opener.`,
    `- Never address the lead with slang nicknames or labels: "osang", "ate", "kuya", "tol", "bes", "pre", "miss", "sir", "ma'am", "boss", "fam", "bro", "sis", "dude". Use their first name sparingly if known, otherwise no label.`,
    `- No bullet lists or numbered lists in chat replies.`,
    `- No greeting after the first reply. No "thanks for reaching out". No "how can I help you?".`,
    `- No AI tells: "certainly", "absolutely", "I'd be happy to", "I totally understand".`,
    `- Don't repeat what they just said back to them. Don't summarize their history.`,
    ``,
    `Selling under the surface:`,
    `- Lead with the outcome they want, not features.`,
    `- Handle objections by understanding first, then reframing — never argue or discount.`,
    `- Every reply should make them feel met, build belief, remove a concern, or invite a next step. Never zero of those.`,
  ];
  return lines.join("\n");
}

function buildTenantDefaultVoice(
  personaTone: string,
  customInstructions: string | null
): string {
  const lines = [
    `--- TENANT DEFAULT VOICE (fallback only) ---`,
    `Use this as the default voice when the active campaign does not specify a stronger personality. Do not let this override campaign personality, campaign rules, funnel pitch, qualification questions, or action-button instructions.`,
    `Default tone: ${personaTone}`,
  ];
  if (customInstructions?.trim()) {
    lines.push(``, `Default custom instructions:`, customInstructions.trim());
  }
  return lines.join("\n");
}

function buildCampaignPersonality(campaign?: CampaignContext): string {
  const personality = campaign?.campaignPersonality?.trim();
  if (!personality) return "";
  return [
    "--- CAMPAIGN PERSONALITY OVERRIDE ---",
    "For this campaign, this is the active personality. It overrides the tenant default voice unless it conflicts with hard conversation rules, factual accuracy, campaign rules, or funnel instructions.",
    personality,
  ].join("\n");
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
// Cheap keyword extractor: pull out the meaningful words (nouns/verbs > 3 chars,
// minus common stop tokens) from a rule sentence so we can scan bot history
// for evidence the rule has been executed.
function extractRuleKeywords(rule: string): string[] {
  const stop = new Set([
    "ask", "tell", "share", "after", "answers", "answer", "make", "attempt",
    "with", "from", "this", "that", "your", "you", "the", "and", "for",
    "are", "what", "when", "where", "why", "how", "have", "has", "did",
    "currently", "running", "interested", "tried", "using", "past", "happened",
    "pitch", "close", "lead", "leads",
  ]);
  return Array.from(
    new Set(
      rule
        .toLowerCase()
        .replace(/[^a-z0-9\s/]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !stop.has(w))
    )
  );
}

function ruleStatusFromHistory(rule: string, botHistory: string): "done" | "open" {
  const keywords = extractRuleKeywords(rule);
  if (keywords.length === 0) return "open";
  const hist = botHistory.toLowerCase();
  // A beat is [done] when the bot has previously surfaced 1+ meaningful keywords
  // from the rule. Heuristic, not perfect — but good enough to keep the LLM
  // from re-asking the same question while letting it move on.
  return keywords.some((k) => hist.includes(k)) ? "done" : "open";
}

function buildCampaignPlaybook(
  rules: string[] | undefined,
  botHistoryText: string
): string {
  if (!rules || rules.length === 0) return "";
  const statuses = rules.map((r) => ({ rule: r, status: ruleStatusFromHistory(r, botHistoryText) }));
  const nextOpenIdx = statuses.findIndex((s) => s.status === "open");
  const lines = [
    "--- CAMPAIGN PLAYBOOK (your hidden checklist) ---",
    "This is your sequenced script for this campaign. The numbered beats below are what you must hit before considering the campaign successful.",
    "",
    "Beats:",
  ];
  statuses.forEach((s, i) => {
    const tag = s.status === "done" ? "[DONE]" : "[OPEN]";
    const arrow = i === nextOpenIdx ? "  ← NEXT" : "";
    lines.push(`${i + 1}. ${tag} ${s.rule}${arrow}`);
  });
  lines.push(
    "",
    "Playbook rules:",
    "- Cover at most ONE [OPEN] beat per turn. One question. Never stack two beats in one reply.",
    "- If the lead asks a direct question, ANSWER FIRST in one line, then in the same reply weave in the NEXT beat (or send the button if the question is a buying signal).",
    "- Skip beats only when the lead has already volunteered the answer in conversation history.",
    "- The final pitch/close beat MUST fire the moment a price/availability/buying question appears — even if earlier beats are still [OPEN]. The form/button collects the rest.",
    "- Never announce the checklist. Never say 'next question is...'. The beats are hidden scaffolding, not script lines."
  );
  return lines.join("\n");
}

function buildStepContext(step: StepContext, testMode: boolean): string {
  if (testMode) {
    return "--- CURRENT STEP ---\nTEST MODE — no active step. Respond based on retrieved knowledge and rules only.";
  }
  const lines = [
    `--- DECISION PRECEDENCE (apply top-down each turn) ---`,
    `1. HARD HANDOFF — if the lead is hostile, asks for a human, or asks to stop, escalate. Nothing else applies.`,
    `2. ANSWER A DIRECT QUESTION — if the lead's last message is a direct question (ends in ?, or starts with: "anong", "ano", "para saan", "para sino", "sino", "saan", "kelan", "magkano", "paano", "what", "how", "who", "when", "where"), your reply MUST start with a ONE-LINE DIRECT ANSWER. Never bounce a question back with another question. After the answer, you may add ONE follow-up question or surface the next playbook beat — but the answer comes FIRST.`,
    `   What "answering" means:`,
    `   - "anong meron dito? / what is this?" → state in ONE line what the business does for whom, drawing from retrieved knowledge or the campaign description. THEN ask one follow-up tied to their context.`,
    `   - "para saan yan? / for what business?" → name 1-2 specific use cases. THEN ask "ikaw, anong business mo?"`,
    `   - "magkano?" → see rule 3 below (close, do not just answer).`,
    `   FORBIDDEN deflections that count as a hard failure: "may tanong ka ba?", "ano ang gusto mong malaman?", "ano ang hanap mo?", "paano kita matutulungan?", "what would you like to know?". These are bot-tells, not answers.`,
    `3. CLOSE ON A BUYING SIGNAL — if the lead asks price ("magkano", "how much", "presyo"), asks availability ("kelan", "available"), says yes ("sige", "oo", "game", "go", "interested"), or asks "what's next/anong gagawin ko" — send the action button THIS turn (with anchor + price + click cue). Skip remaining playbook beats; the form collects the rest.`,
    `4. ADVANCE THE PLAYBOOK — otherwise, surface the NEXT [OPEN] campaign beat as one short question tied to what the lead just said.`,
    `5. SOFT PROBE — if no playbook beat applies, ask one specific question that surfaces intent.`,
    `Question-bouncing (answering a question with a question) is a hard failure mode. So is dropping a price without a button.`,
    ``,
    `--- WHERE YOU ARE IN THE FUNNEL ---`,
    `${step.name}`,
    ``,
    step.instructions,
    `Vibe: ${step.tone}`,
  ];
  if (step.goal) lines.push(`Campaign goal: ${step.goal}`);
  if (step.transitionHint) lines.push(`When to move on: ${step.transitionHint}`);
  if (step.position === 0) {
    lines.push(`\nEARLY CONVERSATION — keep replies to 1-2 short lines. You're just getting to know them.`);
  }
  lines.push(
    "",
    `THE FUNNEL IS THE PLAN, the playbook is HOW you work it. Within the precedence ladder above, every reply moves the lead toward this step's button. Don't introduce topics from a later step on your own. If the lead drags you off-topic, handle their moment in one line, then steer back.`
  );
  return lines.join("\n");
}

function buildSalesStrategy(): string {
  return [
    "--- SALES CONVERSATION STRATEGY ---",
    "Use this as hidden reasoning, not as a script. Never name it, explain it, or let it sound like a process. The lead should feel a real conversation, not a funnel.",
    "Clarify: understand why they reached out and what outcome they want.",
    "Sell outcome: connect the offer to the result they care about, not just features.",
    "",
    "Before every reply, silently ask yourself: what does this person actually want, what's stopping them, and what's the smallest next step that moves them closer?",
    "",
    "Move through these gears as the conversation earns it — never on a fixed order:",
    "- Surface the real reason they reached out. Get past the surface ask to the outcome they actually want.",
    "- Reflect their situation back in one short line that proves you got it. One line, their words, no drama.",
    "- Find out what they've already tried, what they're comparing against, or what's making this urgent now.",
    "- Sell the outcome, never the features. Tie what we offer to the specific result they care about.",
    "- When friction shows up (price, trust, timing, fit, or someone else's approval), name it gently and reframe — don't argue, don't discount, don't flinch.",
    "- Once they lean in, lock the next step. Make it feel obvious, easy, and already happening.",
    "",
    "Rules of the game:",
    "- Every message must do real work: qualify, build belief, remove a concern, or ask for the next move. No filler turns.",
    "- If they're cold, warm them. If they're warm, move them. If they're hot, close them. Never miss the moment.",
    "- Read tone shifts. Hesitation is data — it tells you which concern to surface next.",
    "- Don't pitch until you understand the gap between where they are and where they want to be. Then the pitch writes itself.",
    "- Do not force every step. Pick the single next useful move for this exact message.",
  ].join("\n");
}

function buildVagueIntentRules(): string {
  return [
    "--- BUYING-SIGNAL TRIGGERS (mandatory action when seen) ---",
    'These force a specific action — they override your normal pacing.',
    "",
    'PRICE QUESTION ("magkano", "how much", "price", "presyo", "rate", "cost", "bayad", "kano"):',
    "- State the price from retrieved knowledge in ONE short line.",
    '- Anchor it (e.g. "mas mura pa sa isang boosted post" / "less than ₱20/day").',
    "- Send the action button THIS SAME turn. No follow-up question. No deflection. button_confidence floor = 0.7 — do NOT withhold.",
    "- Failure mode: dropping the price with a follow-up question and no button = lost sale.",
    "",
    'READY/COMMIT SIGNAL ("sige", "oo", "game", "go", "yes", "sure", "interested ako", "ok ano gagawin ko", "paano next"):',
    "- The lead is committing. Send the button THIS SAME turn. CTA frames the EASE (time, simplicity), not new value.",
    "- Reply ≤ 1 short line + button. Do not re-pitch.",
    "",
    'AVAILABILITY ("available", "kelan", "when", "pwede ba"):',
    "- Confirm availability briefly + send the button this turn so they can lock the slot themselves.",
    "",
    'SELF-DESCRIBED FIT ("may shop ako sa shopee", "service ko ay", "I run a salon"):',
    "- Acknowledge in one specific line tied to their business, then either ask the next [OPEN] playbook beat OR send the button if a buying signal already appeared.",
    "",
    'VAGUE INTEREST ONLY ("interested", "details", "pa info", "hm"):',
    "- Assume they mean the current offer.",
    "- Reply with a short contextual bridge that names the offer.",
    "- Ask one next question or send the button if the path is clear.",
    '- Do NOT ask "interested in what?" unless there are multiple unrelated offers and no campaign context.',
  ].join("\n");
}

// Layer 4 — with injection mitigation
function sanitizeMessageText(text: string): string {
  return text
    .replace(SECTION_HEADER_RE, "[REDACTED]")
    .slice(0, MAX_MESSAGE_CHARS);
}

// Surface recycled boilerplate from the bot's last 3 replies so the LLM is
// forced to vary phrasing. Cheap n-gram + emoji extractor — no NLP needed.
function buildRecentPhrases(messages: MessageRow[]): string {
  const botLast3 = messages
    .filter((m) => m.direction === "out")
    .slice(0, 3)
    .map((m) => (m.text ?? "").toLowerCase())
    .filter((t) => t.length > 0);
  if (botLast3.length === 0) return "";

  // Track 3-grams that appear more than once across the last 3 replies
  const counts: Record<string, number> = {};
  for (const text of botLast3) {
    const tokens = text.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
    for (let i = 0; i + 2 < tokens.length; i++) {
      const gram = `${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`;
      if (gram.length < 8) continue;
      counts[gram] = (counts[gram] ?? 0) + 1;
    }
  }
  const recycled = Object.entries(counts)
    .filter(([, n]) => n >= 2)
    .map(([g]) => g)
    .slice(0, 6);

  // Dominant emoji = same emoji used in 2+ of the last 3 replies
  const emojiRe = /\p{Extended_Pictographic}/gu;
  const emojiCounts: Record<string, number> = {};
  for (const text of botLast3) {
    const seen = new Set(text.match(emojiRe) ?? []);
    for (const e of seen) emojiCounts[e] = (emojiCounts[e] ?? 0) + 1;
  }
  const recycledEmoji = Object.entries(emojiCounts)
    .filter(([, n]) => n >= 2)
    .map(([e]) => e);

  if (recycled.length === 0 && recycledEmoji.length === 0) return "";

  const lines = ["--- DO NOT REUSE THESE PHRASES ---", "You said these in your recent replies — pick fresh framings this turn:"];
  for (const g of recycled) lines.push(`- "${g}"`);
  if (recycledEmoji.length > 0) {
    lines.push(`Recycled emoji (pick a different one this turn): ${recycledEmoji.join(" ")}`);
  }
  return lines.join("\n");
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
    "USE THESE FACTS:",
    "- If a chunk above contains a fact that answers the lead's last message (price, feature, what-it-does, who-it's-for, hours, location), you MUST surface that fact in this reply, paraphrased in the lead's language. Do not bury it for later.",
    "- Quote concrete facts (numbers, names, specifics) — don't paraphrase them into vague feature soup like 'mas magandang customer experience'.",
    "- Cite the chunk index in cited_chunks (e.g. [1, 3]) for any fact you use.",
    "- If the answer is not present in the knowledge base, say you don't know and set confidence below 0.4. Do not invent facts.",
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
  const header = "--- THE BUTTON FOR THIS STEP (your primary objective) ---";
  if (buttons.length === 0) return "";

  const lines = [
    header,
    "ACTION BUTTONS AVAILABLE",
    "This is THE button for this funnel step. The success of this step = the lead clicks it.",
    "Every message you send should be moving them toward clicking this button. It is not optional decoration — it is the goal.",
    "",
    "Available button(s):",
  ];
  for (const btn of buttons) {
    const cta = btn.cta_text ?? "Check this out";
    lines.push(`- id: "${btn.id}" | title: "${btn.title}" | type: ${btn.type} | default_cta: "${cta}"`);
  }

  lines.push(
    "",
    "WHEN TO SEND IT — send when the conversation makes the button the useful next step:",
    "- The lead asks about price, availability, schedule, how-to-buy, how-to-book, or where to sign up.",
    "- The lead says yes/sige/game/oo/sure to a forward-moving question.",
    "- The lead describes a need this exact button solves.",
    "- The lead has answered enough qualification questions that the action page should collect the rest.",
    "",
    "When intent is still unclear, ask the next campaign/funnel question instead of using a message-count timer. The campaign rules, funnel pitch, and qualification questions decide the next move.",
    "A short acknowledgment + the button is the ideal shape once the next step is clear."
  );

  lines.push(
    "",
    "HOW TO SEND IT (when state allows):",
    'Include "action_button_id" in your JSON with the EXACT id string above (copy it verbatim — UUIDs must match).',
    'Include "button_confidence" as a number 0.0-1.0 representing your confidence that NOW is the right moment to send this button to THIS lead. The engine will drop the button if button_confidence < 0.65.',
    "",
    'REQUIRED — "button_label" (the clickable text ON the button itself):',
    "When you send a button you MUST also include a button_label. The default page title (e.g. 'Untitled form') is terrible for CTR — generate a fresh label every turn.",
    "",
    "Rules for button_label:",
    "- HARD MAX 18 characters TOTAL including emoji + spaces. Anything longer gets truncated mid-word by Messenger and looks broken. Count yourself BEFORE returning.",
    "- Verb-first, outcome-flavored. Optional single emoji chosen for the lead's register — never a fixed set.",
    "",
    "Forbidden words/phrases in button_label (too long or weak):",
    "  'Mag-fill out'  'Mag-paki'  'Mag-explore'  'I-discover'",
    "  'Continue'  'Submit'  'Open'  'Click here'  'Untitled'",
    "  the page title verbatim, anything in ALL CAPS, '→', '!!'",
    "",
    "If your draft label exceeds 18 chars: drop adjectives, drop 'mo', drop 'ng <noun>', or pick a shorter verb. NEVER ship a label that truncates mid-word.",
    "Match the lead's language (Taglish/English/Tagalog).",
    "If you already sent a similar button earlier, pick a DIFFERENT label from the bank — never repeat your previous label's frame.",
    "",
    'REQUIRED — "cta_text" (the line that appears ABOVE the button in Messenger):',
    "When you send a button you MUST also include a personalized cta_text. This is the single most important line for click-through — do not skip it and do not fall back to a generic default.",
    "",
    "Detailed CTA rules are in OUTPUT CONTRACT. Summary: lead with the outcome, reference a specific detail from the lead's last 1-2 messages, match their language, 8-16 words, one sentence, end with a click cue chosen by you (no fixed emoji)."
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
    if (campaign.mainGoal?.trim()) {
      lines.push(`Campaign main goal: ${campaign.mainGoal.trim()}`);
    }
    if (campaign.description) {
      lines.push(`What we're offering: ${campaign.description}`);
    }
    lines.push(`Campaign goal: ${campaign.goal}`);
    lines.push(`Always keep this offering in mind. You know what we sell — weave it into conversation naturally when relevant.`);
  }

  lines.push(`\nSTRATEGY: Be aware of what you're selling at all times. Don't wait for them to ask — find natural moments to bring it up. But don't force it. Follow the campaign and funnel instructions.`);

  return lines.join("\n");
}

// Layer 8 — with cited_chunks
function buildDecisionInstructions(): string {
  return `--- RESPONSE FORMAT ---
You MUST respond with a JSON object and nothing else. No text before or after the JSON.

{
  "message": "Your response to the lead (plain text, conversational)",
  "funnel_action": "stay or advance or escalate",
  "confidence": 0.0 to 1.0,
  "image_ids": [],
  "cited_chunks": [1, 2],
  "action_button_id": "optional — id of the action button to send, or omit",
  "button_confidence": 0.0 to 1.0,
  "button_label": "REQUIRED when action_button_id is set — punchy clickable label, MAX 20 chars",
  "cta_text": "REQUIRED when action_button_id is set — personalized call-to-action text"
}

- "funnel_action": "stay" to remain in the current funnel step, "advance" only when the current action is completed or clearly no longer needed, "escalate" if you cannot help.
- "confidence" anchor table — pick the band that matches your evidence:
    0.2-0.3 = guessing, no grounding from history or knowledge.
    0.5    = grounded in history but not in retrieved knowledge.
    0.7    = grounded in retrieved knowledge AND addresses the lead's specific words.
    0.9    = lead asked a direct buying question (price/availability/yes) and you are sending the button this turn with a fact-based anchor.
  ENFORCEMENT: confidence >= 0.7 with funnel_action="stay" AND no action_button_id on a buying-signal turn = a hard failure mode. The engine logs it.
- "image_ids": Image IDs to send. Empty array if none.
- "cited_chunks": Indices of the knowledge chunks you used (e.g. [1, 2]).
- "action_button_id": Include ONLY when you want to send an action button. Omit otherwise.
- "button_confidence": REQUIRED when action_button_id is set. Your confidence that NOW is the right moment to send the button. Engine drops the button if < 0.65.
- "button_label": REQUIRED when action_button_id is set. The clickable text ON the button. MAX 20 characters. Action verb + outcome. See action button section for rules.
- "cta_text": REQUIRED when action_button_id is set. The line ABOVE the button. Personalized to THIS lead's situation, in their language and tone. See the action button section above for the rules — do NOT skip this and do NOT use a generic default.`;
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

  // Bot history text (joined) is used by the playbook to mark beats [DONE]
  const botHistoryText = messages
    .filter((m) => m.direction === "out")
    .map((m) => m.text ?? "")
    .join(" \n");

  const layer1 = buildBasePersona(ctx.businessName, personaTone, customInstructions);
  const campaignPersonalityLayer = buildCampaignPersonality(ctx.campaign);
  const tenantDefaultVoiceLayer = buildTenantDefaultVoice(personaTone, customInstructions);
  const layer2 = buildBotRules(rules);
  const campaignRulesLayer = buildCampaignPlaybook(ctx.campaign?.campaignRules, botHistoryText);
  const layer3 = buildOfferingContext(businessType, botGoal, ctx.campaign);
  const layer4 = buildSalesStrategy();
  const layer5 = buildVagueIntentRules();
  const layer6 = buildStepContext(ctx.step, ctx.testMode ?? false);
  const layer7 = buildConversationHistory(messages);
  const recentPhrasesLayer = buildRecentPhrases(messages);
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

  // Fetch action button info if the funnel step has an action button
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

  return [layer1, campaignPersonalityLayer, tenantDefaultVoiceLayer, layer2, campaignRulesLayer, layer3, layer4, layer5, layer6, layer7, recentPhrasesLayer, layer8, leadLayer, layer9, actionButtonsLayer, layer10]
    .filter((l) => l.length > 0)
    .join("\n\n");
}
