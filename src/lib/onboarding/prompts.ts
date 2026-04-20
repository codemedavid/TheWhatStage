// src/lib/onboarding/prompts.ts
import type { BusinessContext, GeneratedPhaseOutline } from "./generation-types";

interface PromptPair {
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
    systemPrompt: `You are writing the system_prompt for a single phase of a Messenger chatbot funnel. The system_prompt tells the AI chatbot how to behave during this phase. It should:
- Describe the bot's personality and tone for this phase
- List what information to gather or actions to take
- Include the lead qualification criteria so the bot knows what to ask
- Explain when to transition to the next phase
- Be written as direct instructions to the bot (e.g., "You are..." / "Your goal is...")
- Be 200-500 words

Return ONLY the system_prompt text, no JSON wrapping.`,
    userMessage: `Write the system_prompt for this phase:

Phase: ${phase.name} (phase ${phase.order + 1})
Goals: ${phase.goals}
Tone: ${phase.tone}
Max messages: ${phase.max_messages}
Transition: ${phase.transition_hint}

Business context:
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
  const trimmed = scrapedContent.slice(0, 3000);
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
