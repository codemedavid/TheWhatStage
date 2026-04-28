import { createServiceClient } from "@/lib/supabase/service";
import type { StepContext } from "@/lib/ai/step-context";
import type { ChunkResult } from "@/lib/ai/vector-search";
import { buildConstitution } from "@/lib/ai/prompt/constitution";
import { buildVoiceRules } from "@/lib/ai/prompt/voice-rules";
import {
  buildCampaignTopAnchor,
  buildCampaignClosingAnchor,
  type CampaignAnchorInput,
  type StepAnchorInput,
} from "@/lib/ai/prompt/campaign-lock";
import { buildPersonaAnchor } from "@/lib/ai/prompt/persona-anchor";
import { wrapUntrusted } from "@/lib/ai/prompt/spotlight";
import { buildOutputContract } from "@/lib/ai/prompt/output-contract";

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

interface BusinessFacts {
  description: string | null;
  differentiator: string | null;
  qualificationCriteria: string | null;
  mainAction: string | null;
}

function buildBusinessFacts(facts: BusinessFacts): string {
  const parts: string[] = [];
  if (facts.description?.trim()) parts.push(`What we sell / how it works:\n${facts.description.trim()}`);
  if (facts.differentiator?.trim()) parts.push(`What makes us different:\n${facts.differentiator.trim()}`);
  if (facts.qualificationCriteria?.trim()) parts.push(`Who is a good-fit lead (use this to shape qualification):\n${facts.qualificationCriteria.trim()}`);
  if (facts.mainAction?.trim()) parts.push(`Primary action we want leads to take: ${facts.mainAction.trim()}`);
  if (parts.length === 0) return "";
  return [
    "--- BUSINESS FACTS (your source of truth) ---",
    "These are the verified facts about this business. Quote concrete numbers and names from here verbatim. If a fact you need is not here AND not in retrieved knowledge, say you don't know and set confidence < 0.4 — never invent prices, features, timelines, or guarantees.",
    "",
    parts.join("\n\n"),
  ].join("\n");
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
  // Stop list is intentionally small — keep domain words like "ads", "running",
  // "currently", "tried", "chatbot" so a beat is only marked [DONE] when the bot
  // has actually surfaced the topic in chat history.
  const stop = new Set([
    "ask", "asks", "tell", "share", "after", "make", "attempt", "with", "from",
    "this", "that", "your", "you", "the", "and", "for", "are", "what", "when",
    "where", "why", "how", "have", "has", "did", "they", "them", "their",
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
  // Dedupe (case-insensitive) — campaign authors sometimes paste the same rule twice.
  const seen = new Set<string>();
  const deduped = rules.filter((r) => {
    const k = r.trim().toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const statuses = deduped.map((r) => ({ rule: r, status: ruleStatusFromHistory(r, botHistoryText) }));
  const nextOpenIdx = statuses.findIndex((s) => s.status === "open");
  const nextBeat = nextOpenIdx >= 0 ? statuses[nextOpenIdx].rule : null;
  const lines = [
    "--- CAMPAIGN PLAYBOOK (MANDATORY — you cannot skip this) ---",
    "This is the sequenced script for this campaign. Every beat below MUST be surfaced to the lead in chat before the funnel goal can be reached. The bot does not 'help' or 'chat' — the bot runs this playbook.",
    "",
    "Beats (in order):",
  ];
  statuses.forEach((s, i) => {
    const tag = s.status === "done" ? "[DONE]" : "[OPEN]";
    const arrow = i === nextOpenIdx ? "  ← NEXT — ASK THIS NOW" : "";
    lines.push(`${i + 1}. ${tag} ${s.rule}${arrow}`);
  });
  if (nextBeat) {
    lines.push(
      "",
      `>>> Your NEXT [OPEN] beat is: "${nextBeat}"`,
      `>>> This turn's reply MUST surface that beat as the question (rephrased naturally, in the lead's language) — UNLESS the lead's last message is a BUYING SIGNAL (price / availability / yes / "what's next"). On a buying signal, IGNORE this beat and go straight to the action button (DECISION PRECEDENCE rule 3). Generic openers like "paano kita matutulungan?", "anong gusto mo malaman?", "may tanong ka ba?" are HARD FAILURES — they replace the beat with filler.`
    );
  }
  lines.push(
    "",
    "Playbook rules:",
    "- Cover EXACTLY ONE [OPEN] beat per turn — the [NEXT] one above. Never stack two. Never invent a question that isn't on the list.",
    "- If the lead asks a direct question first: answer in ONE line, then in the SAME reply ask the [NEXT] beat. The answer + the beat together form one reply.",
    "- A reply that does not surface the [NEXT] beat (when one exists) is incomplete. Filler questions are the #1 way this bot fails.",
    "- A beat is [DONE] only when the bot has actually asked it in a previous reply. The lead volunteering related info does NOT mark it [DONE] unless they answered the exact question.",
    "- Buying signals override: if the lead asks price / availability / says yes / asks 'what's next', drop the playbook and send the action button this turn (rule 3 in DECISION PRECEDENCE).",
    "- Never announce the checklist. Never say 'next question is…'. The beats are hidden scaffolding — surface them as natural conversation."
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
    `2. ANSWER A DIRECT QUESTION — if the lead's last message is a direct question (ends in ?, or starts with: "anong", "ano", "para saan", "para sino", "sino", "saan", "kelan", "magkano", "paano", "what", "how", "who", "when", "where"), your reply MUST start with a ONE-LINE DIRECT ANSWER drawn ONLY from BUSINESS FACTS or RETRIEVED KNOWLEDGE. Never bounce a question back with another question. After the answer, you may add ONE follow-up question or surface the next playbook beat — but the answer comes FIRST.`,
    `   What "answering" means:`,
    `   - "anong meron dito? / what is this?" → state in ONE line what the business does for whom, drawing from retrieved knowledge or the campaign description. THEN ask one follow-up tied to their context.`,
    `   - "para saan yan? / for what business?" → name 1-2 specific use cases. THEN ask "ikaw, anong business mo?"`,
    `   - "magkano?" → see rule 3 below (close, do not just answer).`,
    `   FORBIDDEN deflections that count as a hard failure: "may tanong ka ba?", "ano ang gusto mong malaman?", "ano ang hanap mo?", "paano kita matutulungan?", "what would you like to know?". These are bot-tells, not answers.`,
    `3. CLOSE ON A BUYING SIGNAL — THIS RULE OVERRIDES RULE 2 AND RULE 4. If the lead asks price ("magkano", "how much", "presyo"), asks availability ("kelan", "available"), says yes ("sige", "oo", "game", "go", "interested"), or asks "what's next/anong gagawin ko" — send the action button THIS turn. You MUST: (a) state the EXACT price/answer from BUSINESS FACTS or RETRIEVED KNOWLEDGE in ONE line — quote the specific number verbatim, never vague "it depends" if a real number is in the facts; (b) add ONE anchor framed in the lead's own context (their business, their volume, their problem); (c) include action_button_id with button_confidence ≥ 0.7; (d) write a personalized cta_text in the lead's language. DO NOT ask a playbook question on a buying-signal turn. The button + cta_text IS the close.`,
    `4. ADVANCE THE PLAYBOOK — otherwise (lead made a statement, not a direct question and not a buying signal), your reply MUST surface the [NEXT] [OPEN] campaign beat as ONE question, rephrased naturally in the lead's language and tied to what they just said. This is mandatory — not optional. NEVER substitute a generic question.`,
    `5. SOFT PROBE — only if there is no [OPEN] playbook beat at all (every beat is [DONE]) AND no buying signal, ask one specific question that surfaces intent OR send the button if intent is clear.`,
    `Question-bouncing (answering a question with a question) is a hard failure mode. So is dropping a price without a button. So is replying without surfacing the [NEXT] playbook beat when one exists.`,
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

function buildVagueIntentRules(): string {
  return [
    "--- BUYING-SIGNAL TRIGGERS (mandatory action when seen) ---",
    "These force a specific action — they override your normal pacing. Detect each signal by intent in any language, not by a fixed keyword list.",
    "",
    "PRICE / COST / RATE / BUDGET QUESTION:",
    "- State the EXACT price from BUSINESS FACTS or RETRIEVED KNOWLEDGE in ONE short line. Quote the specific number — currency, amount, period.",
    "- If no price is in the facts, say so plainly and offer the button so the form collects budget — do NOT invent a number, do NOT copy any example currency from this prompt.",
    "- Add ONE anchor framed in the lead's own context (their problem, their volume, what they already pay for). Generate the anchor; never default to an example anchor copied from these instructions.",
    "- Send the action button THIS SAME turn. No follow-up question. button_confidence floor = 0.7.",
    "- Failure mode: dropping the price with a follow-up question and no button = lost sale.",
    "",
    "READY / COMMIT SIGNAL (any affirmative or 'I'm in' equivalent in any language):",
    "- The lead is committing. Send the button THIS SAME turn. CTA frames the EASE (time, simplicity), not new value.",
    "- Reply ≤ 1 short line + button. Do not re-pitch.",
    "",
    "AVAILABILITY / TIMING:",
    "- Confirm availability briefly + send the button this turn so they can lock it themselves.",
    "",
    "SELF-DESCRIBED FIT (lead names their business, role, or situation):",
    "- Acknowledge in one specific line tied to what they said, then either ask the next [OPEN] playbook beat OR send the button if a buying signal already appeared.",
    "",
    "VAGUE INTEREST ONLY ('interested', 'tell me more', 'details', or any equivalent):",
    "- Assume they mean the current offer.",
    "- Reply with a short contextual bridge that names the offer using BUSINESS FACTS.",
    "- Ask one next question (the next [OPEN] beat) or send the button if the path is clear.",
    "- Do NOT ask 'interested in what?' unless there are multiple unrelated offers and no campaign context.",
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

function formatChunkLabel(chunk: ChunkResult): string {
  const m = chunk.metadata ?? {};
  const kind = (m.chunk_kind as string) ?? "doc";
  const title = (m.doc_title as string) ?? "untitled";
  if (kind === "faq" && typeof m.qa_question === "string" && m.qa_question.trim()) {
    return `(FAQ · "${title}" → "${m.qa_question}")`;
  }
  if (kind === "row") return `(Sheet row · "${title}")`;
  return `(Doc · "${title}")`;
}

// Layer 5 — with anti-hallucination instruction and source labels
function buildRetrievedKnowledge(chunks: ChunkResult[]): string {
  const header = "--- RETRIEVED KNOWLEDGE ---";
  if (!chunks || chunks.length === 0) {
    return `${header}\nNo specific knowledge retrieved. If a fact is not present, say you don't know and set confidence < 0.4.`;
  }
  const blocks = chunks.map((chunk, i) => {
    const label = formatChunkLabel(chunk);
    return `[${i + 1}] ${label} ${chunk.content}`;
  });
  return [
    header,
    ...blocks,
    "",
    "USE THESE FACTS:",
    "- Every concrete fact in your reply (price, feature, hours, location, what-it-does, who-it's-for) MUST come from a chunk above. Quote numbers and names verbatim.",
    "- Cite the chunk index in cited_chunks (e.g. [1, 3]) for any fact you used.",
    "- A reply that states a fact NOT present in any chunk is a hard hallucination failure. If the answer is not here, say you don't know and set confidence < 0.4.",
  ].join("\n");
}

// Export for tests only
export const __test__buildRetrievedKnowledge = buildRetrievedKnowledge;

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
    "- The lead asks about price, availability, schedule, how-to-buy/book, or where to sign up (in any language).",
    "- The lead gives an affirmative or commitment to a forward-moving question (in any language).",
    "- The lead describes a need this exact button solves.",
    "- The lead has answered enough qualification questions that the action page should collect the rest.",
    "",
    "When intent is still unclear, ask the [NEXT] [OPEN] playbook beat instead. The campaign playbook, funnel pitch, and qualification questions decide the next move — never message-count timers.",
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
    "- Write the label in the SAME language and register the lead is using. Mirror them. Do NOT default to English.",
    "",
    "Forbidden words/phrases in button_label (too long or weak):",
    "  'Mag-fill out'  'Mag-paki'  'Mag-explore'  'I-discover'",
    "  'Continue'  'Submit'  'Open'  'Click here'  'Untitled'  'Learn more'",
    "  the page title verbatim, anything in ALL CAPS, '→', '!!'",
    "",
    "If your draft label exceeds 18 chars: drop adjectives, drop 'mo', drop 'ng <noun>', or pick a shorter verb. NEVER ship a label that truncates mid-word.",
    "Match the lead's language (Taglish/English/Tagalog).",
    "If you already sent a similar button earlier, pick a DIFFERENT label from the bank — never repeat your previous label's frame.",
    "",
    'REQUIRED — "cta_text" (the line that appears ABOVE the button in Messenger):',
    "When you send a button you MUST also include a personalized cta_text. This is the single most important line for click-through — do not skip it and do not fall back to a generic default.",
    "",
    "Detailed CTA rules are in OUTPUT CONTRACT. Summary: lead with the outcome, reference a specific detail from the lead's last 1-2 messages, match their language, 8-16 words, one sentence, end with a click cue chosen by you (no fixed emoji). Never invent facts (price, timeline, guarantees) that aren't in BUSINESS FACTS or RETRIEVED KNOWLEDGE."
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
    .select("persona_tone, custom_instructions, business_type, bot_goal, business_description, differentiator, qualification_criteria, main_action, name")
    .eq("id", ctx.tenantId)
    .single() as unknown as Promise<{ data: {
      persona_tone: string;
      custom_instructions: string | null;
      business_type: string;
      bot_goal: string;
      business_description: string | null;
      differentiator: string | null;
      qualification_criteria: string | null;
      main_action: string | null;
      name: string | null;
    } | null; error: unknown }>;

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
  const businessFacts: BusinessFacts = {
    description: personaResult.data?.business_description ?? null,
    differentiator: personaResult.data?.differentiator ?? null,
    qualificationCriteria: personaResult.data?.qualification_criteria ?? null,
    mainAction: personaResult.data?.main_action ?? null,
  };

  // Bot history text (joined) is used by the playbook to mark beats [DONE]
  const botHistoryText = messages
    .filter((m) => m.direction === "out")
    .map((m) => m.text ?? "")
    .join(" \n");

  const tenantCustomInstructionsLayer = customInstructions?.trim()
    ? `--- TENANT CUSTOM INSTRUCTIONS (constraints, not phrases to copy) ---\n${customInstructions.trim()}`
    : "";
  const campaignPersonalityLayer = buildCampaignPersonality(ctx.campaign);
  const tenantDefaultVoiceLayer = buildTenantDefaultVoice(personaTone, customInstructions);
  const businessFactsLayer = buildBusinessFacts(businessFacts);
  const layer2 = buildBotRules(rules);
  const campaignRulesLayer = buildCampaignPlaybook(ctx.campaign?.campaignRules, botHistoryText);
  const layer3 = buildOfferingContext(businessType, botGoal, ctx.campaign);
  const layer5 = buildVagueIntentRules();
  const layer6 = buildStepContext(ctx.step, ctx.testMode ?? false);
  const layer7 = buildConversationHistory(messages);
  const recentPhrasesLayer = buildRecentPhrases(messages);
  const layer8 = buildRetrievedKnowledge(ctx.ragChunks);
  const layer9 = buildAvailableImages(ctx.images);
  const salesBehavior = [
    "--- SALES BEHAVIOR (silent reasoning, never named or explained) ---",
    "Before each reply, ask yourself: what does this lead want, what's blocking them, what is the smallest next step.",
    "Sell the outcome, not the feature. Handle objections by reframing — never argue, never discount.",
    "Pace by lead heat: cold → warm them, warm → move them, hot → close them.",
  ].join("\n");

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

  // Build campaign anchor inputs
  const stepAnchorInput: StepAnchorInput = {
    name: ctx.step.name,
    actionButtonTitle: actionButtons[0]?.title ?? null,
  };
  const campaignAnchorInput: CampaignAnchorInput = ctx.campaign
    ? {
        name: ctx.campaign.name,
        goal: ctx.campaign.goal,
        mainGoal: ctx.campaign.mainGoal ?? null,
        description: ctx.campaign.description ?? null,
      }
    : { name: "default", goal: botGoal, mainGoal: null, description: null };

  // Wrap untrusted layers
  const wrappedKnowledge = wrapUntrusted("tenant_kb", layer8);
  const wrappedHistory = wrapUntrusted("messenger_lead", layer7);
  const wrappedLead = wrapUntrusted("form_submission", leadLayer);

  // ZONE A — IMMUTABLE TOP (cache-stable)
  const zoneA = [
    buildConstitution(),
    buildCampaignTopAnchor(campaignAnchorInput, stepAnchorInput),
    buildVoiceRules({ tenantPersona: personaTone }),
  ].join("\n\n");

  // ZONE B — SEMI-STABLE MIDDLE (per-tenant + per-campaign)
  const zoneB = [
    tenantCustomInstructionsLayer,
    businessFactsLayer,      // BUSINESS FACTS — referenced by Constitution rule 1
    campaignPersonalityLayer,
    tenantDefaultVoiceLayer,
    layer2,                  // bot rules
    campaignRulesLayer,      // playbook
    layer3,                  // offering / mission
    layer5,                  // buying signals
    layer6,                  // step context
    salesBehavior,           // 3-line replacement for buildSalesStrategy
    actionButtonsLayer,
  ].filter((s) => s.length > 0).join("\n\n");

  // ZONE C — VOLATILE BOTTOM (per-turn)
  const zoneC = [
    wrappedKnowledge,
    layer9,                  // images
    wrappedLead,
    wrappedHistory,
    recentPhrasesLayer,
    buildOutputContract(),
    buildCampaignClosingAnchor(campaignAnchorInput, stepAnchorInput),
    buildPersonaAnchor(),
  ].filter((s) => s.length > 0).join("\n\n");

  return [zoneA, zoneB, zoneC].join("\n\n");
}
