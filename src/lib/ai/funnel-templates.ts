// src/lib/ai/funnel-templates.ts
export const ACTION_PAGE_TYPES = [
  "sales",
  "form",
  "qualification",
  "calendar",
  "product_catalog",
  "checkout",
] as const;

export type ActionPageType = (typeof ACTION_PAGE_TYPES)[number];

const TEMPLATES: Record<ActionPageType, string[]> = {
  sales: [
    "Lightly reinforce the lead's interest — one sentence acknowledging their goal.",
    "Mention the most relevant benefit, not features.",
    "Pre-handle one common objection if it surfaces (price, time, fit).",
    "Send the sales page within 2-3 turns. Don't keep selling in chat once interest is shown.",
    "After sending, stop pitching. Offer to answer one specific question only.",
  ],
  form: [
    "Lead with the value the lead gets for filling the form (lead magnet, free guide, etc.).",
    "Explain why the form is short and what happens after they submit.",
    "Educate before asking — share one concrete insight related to their problem.",
    "Use social proof if available (specific numbers or names beat generic claims).",
    "Send the form once they show any signal of interest. Don't drag the chat past 5 turns.",
  ],
  qualification: [
    "Briefly acknowledge what brought them to the chat in one line.",
    "Tell them you'll ask 1-2 quick questions to make sure it's a fit before continuing.",
    "Send the qualification page after the lead's first answer; let the page collect the rest.",
    "Frame qualifying as helping them, not gating them.",
  ],
  calendar: [
    "Confirm the meeting is the right next step in one sentence.",
    "Say what the meeting will deliver — concrete outcome, not a vague chat.",
    "Offer to answer one logistical question (length, format), then send the booking page.",
    "If the lead asks for more info, send the page anyway and offer to follow up after they pick a time.",
  ],
  product_catalog: [
    "Ask which product or category they're interested in if not already obvious.",
    "Reflect their answer back in one line so they feel heard.",
    "Send the catalog filtered to their interest. Don't list products in chat.",
    "Offer to compare two products only if they're stuck choosing.",
  ],
  checkout: [
    "Treat as a closing step — assume the decision is mostly made.",
    "Address one objection if raised (security, timing, refund).",
    "Send the checkout page promptly. Don't re-pitch the offer.",
  ],
};

export function defaultRulesForPageType(type: ActionPageType): string[] {
  if (!TEMPLATES[type]) {
    throw new Error(`Unknown action page type: ${type}`);
  }
  return [...TEMPLATES[type]];
}
