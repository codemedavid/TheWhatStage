import type { ActionPageType, BotGoal, BotTone, BusinessType } from "./types";

// ---------------------------------------------------------------------------
// Tone defaults by industry
// ---------------------------------------------------------------------------

const TONE_BY_INDUSTRY: Record<BusinessType, BotTone> = {
  ecommerce: "friendly",
  real_estate: "professional",
  digital_product: "casual",
  services: "professional",
};

export function getDefaultBotTone(industry: BusinessType): BotTone {
  return TONE_BY_INDUSTRY[industry];
}

// ---------------------------------------------------------------------------
// Bot rules by industry + goal
// ---------------------------------------------------------------------------

const RULES: Record<BusinessType, Record<BotGoal, string[]>> = {
  ecommerce: {
    qualify_leads: [
      "Ask what products or categories the customer is interested in",
      "Collect email address early in the conversation",
      "Ask about their budget range",
      "Tag leads based on product interest",
    ],
    sell: [
      "Recommend products based on what the customer describes",
      "Always share product links when mentioning items",
      "Mention current promotions when relevant",
      "Offer to help with sizing or product questions",
    ],
    understand_intent: [
      "Ask open-ended questions to understand what the customer needs",
      "Categorize intent as browsing, comparing, or ready to buy",
      "Suggest relevant product categories based on responses",
      "Never push a sale before understanding the need",
    ],
    collect_lead_info: [
      "Ask for name and email address",
      "Ask about preferred product categories",
      "Collect shipping location for availability info",
      "Offer a discount code in exchange for sign-up",
    ],
  },
  real_estate: {
    qualify_leads: [
      "Ask if they are looking to buy or sell",
      "Ask for their budget range",
      "Collect preferred location or area",
      "Ask about their timeline for moving",
    ],
    sell: [
      "Highlight key property features and pricing",
      "Share listing links with photos",
      "Offer to schedule a property viewing",
      "Follow up on viewed properties within 24 hours",
    ],
    understand_intent: [
      "Ask whether they are a buyer, seller, or investor",
      "Understand their property type preference",
      "Ask about must-have features vs nice-to-haves",
      "Never discuss specific pricing without agent approval",
    ],
    collect_lead_info: [
      "Ask for name, email, and phone number",
      "Collect preferred property type and area",
      "Ask about financing status (pre-approved, cash, etc.)",
      "Offer to send curated listings via email",
    ],
  },
  digital_product: {
    qualify_leads: [
      "Ask what problem they are trying to solve",
      "Determine their experience level (beginner, intermediate, advanced)",
      "Ask about their budget for learning or tools",
      "Tag leads by topic interest",
    ],
    sell: [
      "Share product benefits, not just features",
      "Include testimonials or social proof when available",
      "Offer a free sample or preview when relevant",
      "Create urgency with limited-time offers",
    ],
    understand_intent: [
      "Ask what outcome they hope to achieve",
      "Determine if they have tried similar products before",
      "Understand their preferred format (video, text, interactive)",
      "Match intent to the most relevant product",
    ],
    collect_lead_info: [
      "Ask for name and email address",
      "Ask what topics they are most interested in",
      "Offer a free resource in exchange for sign-up",
      "Collect preferred content format",
    ],
  },
  services: {
    qualify_leads: [
      "Ask about the specific service they need",
      "Determine project scope and budget",
      "Ask about their timeline and urgency",
      "Collect business size or team information",
    ],
    sell: [
      "Highlight relevant case studies and results",
      "Offer a free consultation or discovery call",
      "Share pricing packages clearly",
      "Follow up with a proposal after initial interest",
    ],
    understand_intent: [
      "Ask what challenge they are currently facing",
      "Understand what they have tried before",
      "Determine decision-making authority",
      "Never make promises without understanding scope",
    ],
    collect_lead_info: [
      "Ask for name, email, and company name",
      "Collect project description or brief",
      "Ask about budget and timeline",
      "Offer to schedule a consultation call",
    ],
  },
};

export function getDefaultBotRules(
  industry: BusinessType,
  goal: BotGoal
): string[] {
  return RULES[industry]?.[goal] ?? [];
}

// ---------------------------------------------------------------------------
// Action page defaults by industry
// ---------------------------------------------------------------------------

const ACTIONS_BY_INDUSTRY: Record<BusinessType, ActionPageType[]> = {
  ecommerce: ["form", "sales", "product_catalog"],
  real_estate: ["form", "calendar"],
  digital_product: ["form", "sales"],
  services: ["form", "calendar"],
};

export function getDefaultActionTypes(
  industry: BusinessType
): ActionPageType[] {
  return ACTIONS_BY_INDUSTRY[industry];
}

// ---------------------------------------------------------------------------
// Goal subtitles adapted by industry
// ---------------------------------------------------------------------------

const GOAL_SUBTITLES: Record<
  BusinessType,
  Record<BotGoal, string>
> = {
  ecommerce: {
    qualify_leads: "Ask questions to match shoppers with the right products",
    sell: "Guide customers from browsing to checkout",
    understand_intent: "Figure out what each shopper is looking for",
    collect_lead_info: "Gather contact details for marketing and follow-up",
  },
  real_estate: {
    qualify_leads: "Ask questions to match buyers with properties",
    sell: "Guide leads from inquiry to property viewing",
    understand_intent: "Understand whether they are buying, selling, or investing",
    collect_lead_info: "Gather contact details and property preferences",
  },
  digital_product: {
    qualify_leads: "Ask questions to match users with the right product",
    sell: "Guide users from interest to purchase",
    understand_intent: "Figure out what outcome each user wants",
    collect_lead_info: "Gather contact details and topic interests",
  },
  services: {
    qualify_leads: "Ask questions to scope the project and budget",
    sell: "Guide prospects from inquiry to booking",
    understand_intent: "Understand the challenge they need help with",
    collect_lead_info: "Gather contact details and project requirements",
  },
};

export function getGoalSubtitle(
  industry: BusinessType,
  goal: BotGoal
): string {
  return GOAL_SUBTITLES[industry]?.[goal] ?? "";
}

// ---------------------------------------------------------------------------
// Default funnel config (greeting bot flow)
// ---------------------------------------------------------------------------

export function getDefaultFunnelConfig(
  industry: BusinessType,
  goal: BotGoal
): Record<string, unknown> {
  const greetings: Record<BusinessType, string> = {
    ecommerce: "Hey there! Welcome to our store. What are you looking for today?",
    real_estate: "Hi! Thanks for reaching out. Are you looking to buy, sell, or rent?",
    digital_product: "Hey! Glad you're here. What would you like to learn about?",
    services: "Hi there! Thanks for getting in touch. How can we help you today?",
  };

  const followUps: Record<BotGoal, string> = {
    qualify_leads: "Great! Let me ask a few quick questions to help you better.",
    sell: "Awesome! Let me show you what we've got.",
    understand_intent: "Got it! Tell me more about what you're looking for.",
    collect_lead_info: "Perfect! Could I get a few details so we can follow up?",
  };

  return {
    greeting: greetings[industry],
    followUp: followUps[goal],
    industry,
    goal,
  };
}
