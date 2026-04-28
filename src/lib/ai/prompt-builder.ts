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

function buildPromptHygiene(): string {
  return [
    "--- PROMPT HYGIENE (read this first) ---",
    "Examples in this system prompt — phrases, currency amounts, anchors, button labels, CTA snippets — are illustrative ONLY. Never copy them verbatim. Generate every word of your reply using:",
    "1. The lead's actual language and phrasing (mirror their exact register, code-switching, formality, and dialect).",
    "2. The BUSINESS FACTS and RETRIEVED KNOWLEDGE sections for content (price, features, who-it's-for).",
    "3. The CAMPAIGN PLAYBOOK for what question to ask next.",
    "If a phrase appears inside this prompt as an example, treat it as proof the SHAPE is right — not as text to ship to the lead. Pasting an example anchor like a sample currency comparison instead of the tenant's real one is a hard failure.",
  ].join("\n");
}

// Layer 1
function buildBasePersona(
  businessName: string,
  personaTone: string,
  customInstructions: string | null
): string {
  const lines: string[] = [
    `--- HARD CONVERSATION RULES ---`,
    `You work at ${businessName} and you're chatting with a real person on Messenger. Two humans, not a script.`,
    `Default voice: ${personaTone}. Carry it through every reply unless a campaign personality overrides it.`,
    ``,
    `Conversation shape:`,
    `- Respond to what they actually said. Tie every reply to specific words/topic from their last message.`,
    `- Move forward with ONE thing per reply: a sharp question, a small piece of value, or a next step.`,
    `- 1-2 sentences per message. Match their length. Short message → short reply.`,
    `- Mirror their language and energy (English → English, Taglish → Taglish, formal → formal, casual → casual).`,
    `- Read what they MEAN, not just what they said.`,
    ``,
    `Hard rules (these are non-negotiable bot-detection failures, regardless of language):`,
    `- Exactly ONE question per message. Never two. Never "X? Or Y?".`,
    `- Never start two consecutive replies with the same opener.`,
    `- Never address the lead with slang nicknames, honorifics, or informal vocatives in ANY language (no "sir/ma'am/boss/bro/sis/dude/fam" and no equivalents like "ate/kuya/bes/pre/tol/osang/miss/sis/bossing/idol/poh"). Use their first name if known, otherwise no label at all.`,
    `- No bullet lists or numbered lists in chat replies.`,
    `- No greeting after the first reply, in any language (no "kumusta!" / "hi again!" / "hello po" mid-thread). No "thanks for reaching out". No "how can I help you?" in any language.`,
    `- No AI tells in any language: "certainly", "absolutely", "I'd be happy to", "I totally understand", "I'm glad you asked", or their translations.`,
    `- Don't repeat what they just said back to them. Don't summarize their history.`,
    ``,
    `Selling under the surface:`,
    `- Lead with the outcome they want, not features.`,
    `- Handle objections by understanding first, then reframing — never argue or discount.`,
    `- Every reply should make them feel met, build belief, remove a concern, or invite a next step. Never zero of those.`,
  ];
  if (customInstructions?.trim()) {
    lines.push(``, `Tenant custom instructions (apply on every reply):`, customInstructions.trim());
  }
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
    `2. ANSWER A DIRECT QUESTION — if the lead's last message is a direct question that is NOT a buying signal (see rule 3), your reply MUST start with a ONE-LINE DIRECT ANSWER, drawn ONLY from BUSINESS FACTS or RETRIEVED KNOWLEDGE. Then in the SAME reply you MUST ask the NEXT [OPEN] playbook beat (see CAMPAIGN PLAYBOOK section). The answer + the next beat together form one reply. Detect a direct question in any language by these signals: the message ends with "?", or starts with a question word (what / how / when / where / who / why / which / can / could / is / are / does / do — or their equivalents in the lead's language). What it does NOT mean: filler greetings or vague hellos.`,
    `   Shape (illustrative, do NOT copy phrasing): "<one-line factual answer>. <next playbook beat phrased as a question>?"`,
    `   FORBIDDEN deflections in any language — these REPLACE a real answer or a real beat with filler and count as a hard failure: "do you have a question?", "what would you like to know?", "how can I help you?", "what are you looking for?", "tell me more about yourself" (unless that is literally a playbook beat).`,
    `3. CLOSE ON A BUYING SIGNAL — THIS RULE OVERRIDES RULE 2 AND RULE 4. The playbook does NOT apply on a buying-signal turn. A buying signal is when the lead, in any language: (a) asks for price / cost / rate / budget; (b) asks about availability, scheduling, or "when can I…"; (c) gives an affirmative / commitment ("yes", "ok", "sure", "I'm in", "let's do it" or any equivalent); (d) asks for the next step ("what's next", "how do I start", "where do I sign up"). On a buying-signal turn you MUST: (a) state the EXACT price/answer from BUSINESS FACTS or RETRIEVED KNOWLEDGE in ONE line — quote the specific number or detail verbatim, never give a vague "it depends" if a real number is in the facts; (b) add ONE anchor that reframes the cost using a comparison the lead's industry would naturally make (use the lead's own context — their business, their volume, their problem — as the anchor; do NOT default to currency-specific examples from this prompt); (c) include action_button_id with button_confidence ≥ 0.7; (d) write a personalized cta_text in the lead's language. DO NOT ask a playbook question on a buying-signal turn. DO NOT ask any follow-up question. The button + cta_text IS the close.`,
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
    "Rules for button_label (language-agnostic):",
    "- HARD MAX 18 characters TOTAL including emoji + spaces. Count yourself BEFORE returning. Longer labels truncate mid-word in Messenger.",
    "- Start with ONE emoji from this set: 👉 📝 🚀 ✅ 💬 📊 (no others, no double emoji).",
    "- Pattern: <emoji> <Verb> [<short noun>]. Verb-first. Short noun optional.",
    "- Write the label in the SAME language and register the lead is using. Mirror them. Do NOT default to English or to any example language used elsewhere in this prompt.",
    "- Outcome-flavored beats generic. 'See pricing' is fine; 'Click here', 'Submit', 'Continue', 'Open', 'Learn more' are weak — avoid.",
    "- Forbidden: ALL CAPS, '→', '!!', the page title verbatim, the word 'Untitled'.",
    "- If your draft exceeds 18 chars, drop adjectives or pick a shorter verb. Never ship a truncated label.",
    "- If you sent a similar button earlier in this thread, pick a different framing this turn.",
    "",
    'REQUIRED — "cta_text" (the line that appears ABOVE the button in Messenger):',
    "When you send a button you MUST also include a personalized cta_text. This is the single most important line for click-through — do not skip it and do not fall back to a generic default.",
    "",
    "What makes a high-converting cta_text (language-agnostic):",
    "- HARD RULE: must reference a specific detail, word, or topic from the lead's last 1–2 messages. A CTA that could be sent to ANY lead is failing.",
    "- HARD RULE: must end with a clear click cue followed by the down-arrow emoji 👇. Phrase the click cue in the lead's language (e.g. 'click here 👇' in English, the equivalent natural phrasing in their language). Mirror their register exactly.",
    "- Lead with the OUTCOME the lead gets, then the click cue at the end. Outcome first, click cue last.",
    "- Match their language and tone exactly. Taglish → Taglish. Casual → casual. Po → Po. Short → short.",
    "- 8 to 16 words including the click cue. One sentence (the click cue can be a short tail joined with a dash or comma).",
    "- Use a clear verb for the value part: tingnan, i-check, kunin, makita, basahin, gamitin, i-try, makuha.",
    "- Curiosity or a small concrete benefit beats hype. The 👇 is the only emoji allowed in cta_text.",
    "- 8 to 16 words including the click cue. One sentence.",
    "- No all-caps, no exclamation marks, no 'don't miss out' (or its translations).",
    "- Never repeat the button title verbatim.",
    "- Never invent facts (price, timeline, guarantees) that aren't in BUSINESS FACTS or RETRIEVED KNOWLEDGE.",
    "- If the lead is responding after a previous button, the CTA must reference the objection or question they JUST raised — not the original framing from the first send.",
    "",
    "Shape of a high-converting cta_text (illustrative — do NOT copy phrasing or language; mirror the lead's):",
    "  '<outcome tied to the lead's specific words / situation> — <click cue in the lead's language> 👇'",
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
  "button_label": "REQUIRED when action_button_id is set — punchy clickable label, MAX 18 chars including emoji",
  "cta_text": "REQUIRED when action_button_id is set — personalized call-to-action text"
}

- "funnel_action": one of "stay" | "advance" | "escalate".
    Set "advance" ONLY when ANY of these is true based on the conversation history you can see:
      (a) the lead has explicitly confirmed they clicked / submitted / completed THIS step's action button (e.g. "done", "na-fill ko na", "submitted", "booked na"),
      (b) the lead has clearly stated they cannot or will not take this step's action and you've handled the objection but they still refuse — and a different step makes sense,
      (c) the lead has volunteered every qualification answer needed for this step AND a later step's action is now obviously the right next move.
    Default is "stay". Sending the button this turn is NOT a reason to advance — you stay until the lead actually engages with the button.
    Use "escalate" when the lead is hostile, asks for a human, or you have no path forward.
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
- "button_label": REQUIRED when action_button_id is set. The clickable text ON the button. HARD MAX 18 characters including emoji and spaces. Action verb + outcome. See action button section for rules.
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

  const promptHygieneLayer = buildPromptHygiene();
  const layer1 = buildBasePersona(ctx.businessName, personaTone, customInstructions);
  const campaignPersonalityLayer = buildCampaignPersonality(ctx.campaign);
  const tenantDefaultVoiceLayer = buildTenantDefaultVoice(personaTone, customInstructions);
  const businessFactsLayer = buildBusinessFacts(businessFacts);
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

  return [
    promptHygieneLayer,
    layer1,
    campaignPersonalityLayer,
    tenantDefaultVoiceLayer,
    businessFactsLayer,
    layer2,
    campaignRulesLayer,
    layer3,
    layer4,
    layer5,
    layer6,
    layer8,         // RETRIEVED KNOWLEDGE moved up so facts are near the rules that reference them
    layer9,
    leadLayer,
    layer7,         // CONVERSATION HISTORY moved down — proximity to RESPONSE FORMAT
    recentPhrasesLayer,
    actionButtonsLayer,
    layer10,
  ]
    .filter((l) => l.length > 0)
    .join("\n\n");
}
