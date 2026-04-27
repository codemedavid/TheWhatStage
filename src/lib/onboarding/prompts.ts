// src/lib/onboarding/prompts.ts
import type { BusinessContext, GeneratedPhaseOutline } from "./generation-types";

const MAX_SCRAPED_CONTENT_CHARS = 3000; // leaves room in context window for business context summary

export interface PromptPair {
  systemPrompt: string;
  userMessage: string;
}

function contextSummary(ctx: BusinessContext): string {
  let summary = `Business: ${ctx.tenantName}
Type: ${ctx.businessType}
Goal: ${ctx.botGoal}
Offers: ${ctx.businessDescription}
Main action: ${ctx.mainAction}
Lead qualification criteria: ${ctx.qualificationCriteria}`;
  if (ctx.differentiator) {
    summary += `\nDifferentiator: ${ctx.differentiator}`;
  }
  return summary;
}

export function buildCampaignPrompt(ctx: BusinessContext): PromptPair {
  return {
    systemPrompt: `You are a marketing strategist designing a Messenger chatbot funnel. Return ONLY valid JSON with this exact structure:
{
  "campaign": {
    "name": "string — short campaign name",
    "description": "string — one sentence",
    "goal": "form_submit" | "appointment_booked" | "purchase" | "stage_reached",
    "follow_up_message": "string — friendly follow-up message sent if lead goes quiet"
  },
  "phases": [
    {
      "name": "string — phase name",
      "order": number,
      "max_messages": number (1-5),
      "goals": "string — what this phase accomplishes",
      "transition_hint": "string — when to move to the next phase",
      "tone": "string — conversation tone for this phase"
    }
  ]
}
Design 3-6 phases that guide leads from greeting to the main action. Map the goal to the closest enum value: form_submit (for forms), appointment_booked (for appointments/calls), purchase (for buying), stage_reached (for general qualification).`,
    userMessage: `Design a Messenger funnel for this business:\n\n${contextSummary(ctx)}`,
  };
}

export function buildPhasePromptPrompt(
  ctx: BusinessContext,
  phase: GeneratedPhaseOutline
): PromptPair {
  return {
    systemPrompt: `You are writing a short briefing for a Messenger chatbot about what it should focus on during one phase of a conversation. This briefing should:
- Be casual and direct — like briefing a closer on your sales team, not programming a robot
- Focus on the PURPOSE of this phase: what outcome are we moving the lead toward, and what's the next belief or piece of info we need from them?
- Frame it around the lead's desired result, not internal process. "Get them to see X" beats "ask about Y."
- Name the most likely friction in this phase (hesitation, confusion, objection) so the bot knows what to watch for and reframe.
- Be specific to this business — mention real things about what they sell/offer
- Stay under 100 words. Short and punchy. No fluff.
- Do NOT include scripted lines, example messages, or "You are..." roleplay instructions
- Do NOT describe tone or personality (that's handled separately)
- Do NOT list steps or bullet points of what to say

Think of it as: "Here's what you're moving them toward right now, and what's likely to get in the way." That's it.

Return ONLY the briefing text, no JSON wrapping.`,
    userMessage: `Write the phase briefing:

Phase: ${phase.name} (phase ${phase.order + 1} of the funnel)
Purpose: ${phase.goals}
Vibe: ${phase.tone}
Max messages: ${phase.max_messages}
Move on when: ${phase.transition_hint}

Business:
${contextSummary(ctx)}`,
  };
}

export function buildFaqPrompt(ctx: BusinessContext): PromptPair {
  return {
    systemPrompt: `You are a content writer creating FAQ pairs for a business chatbot's knowledge base. Return ONLY valid JSON:
{
  "faqs": [
    { "question": "string", "answer": "string" }
  ]
}
Generate 8-12 FAQ pairs that a potential customer would ask. Cover: what the business offers, pricing/costs, how to get started, process/timeline, and common objections. Answers should be 1-3 sentences, conversational, and accurate based on the business info provided.`,
    userMessage: `Create FAQ pairs for this business:\n\n${contextSummary(ctx)}`,
  };
}

export function buildGeneralArticlePrompt(ctx: BusinessContext): PromptPair {
  return {
    systemPrompt: `You are a content writer creating a knowledge base article about a business. Write a comprehensive "About" article that covers:
- What the business offers
- How the process works
- What makes them different (if mentioned)
- How to get started / take the main action

Write in third person. 300-500 words. Plain text, no markdown headers. This article will be used by a chatbot to answer customer questions.`,
    userMessage: `Write an "About" knowledge article for:\n\n${contextSummary(ctx)}`,
  };
}

export function buildUrlArticlePrompt(
  ctx: BusinessContext,
  scrapedContent: string
): PromptPair {
  const trimmed = scrapedContent.slice(0, MAX_SCRAPED_CONTENT_CHARS);
  return {
    systemPrompt: `You are a content writer creating a knowledge base article from a business website. Synthesize the website content into a structured article covering:
- Products/services with real names and details from the site
- Pricing if available
- Key features and benefits
- Process or how it works

Write in third person. 300-500 words. Plain text, no markdown headers. Use real details from the website, not generic descriptions. This article will be used by a chatbot to answer customer questions.`,
    userMessage: `Create a knowledge article for ${ctx.tenantName} using their website content:

Website content:
${trimmed}

Business context:
${contextSummary(ctx)}`,
  };
}
