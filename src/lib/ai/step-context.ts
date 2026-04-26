import type { CampaignFunnel } from "@/types/campaign-funnel";
import type { ActionPageType } from "@/lib/ai/funnel-templates";

export interface StepContext {
  name: string;
  position: number;
  total: number;
  instructions: string;
  tone: string;
  goal: string | null;
  transitionHint: string | null;
  messageCount: number;
  maxMessages: number;
  actionButtonIds: string[];
}

const DEFAULT_MAX_MESSAGES = 8;

const TRANSITION_HINTS: Record<ActionPageType, string> = {
  sales: "Advance once the lead has shown buying interest and you've sent the sales page.",
  form: "Advance once the lead is willing to fill the form and you've sent the page.",
  qualification: "Advance once the lead has answered the first qualifying question.",
  calendar: "Advance once the lead has agreed to book a call and you've sent the booking page.",
  product_catalog: "Advance once the lead has indicated a category and you've sent the catalog.",
  checkout: "Advance once the lead is ready to buy and you've sent the checkout page.",
};

const GOAL_DIRECTIONS: Record<string, string> = {
  purchase: "Get the lead to buy.",
  form_submit: "Get the lead to submit the form.",
  appointment_booked: "Get the lead to book an appointment.",
  stage_reached: "Move the lead to the next stage.",
};

export interface FunnelToStepInput {
  funnel: CampaignFunnel;
  allFunnels: CampaignFunnel[];
  campaign: { goal: string };
  page: { title: string; type: ActionPageType };
  tone: string;
  messageCount: number;
}

export function funnelToStep(input: FunnelToStepInput): StepContext {
  const { funnel, allFunnels, campaign, page, tone, messageCount } = input;
  const position = allFunnels.findIndex((f) => f.id === funnel.id);
  const total = allFunnels.length;

  const ruleLines = funnel.chatRules.map((r) => `- ${r}`).join("\n");
  const descBlock = funnel.pageDescription
    ? `\n\nPage context: ${funnel.pageDescription}`
    : "";
  const instructions = `Chat rules for this step:\n${ruleLines}${descBlock}`;

  return {
    name: `Step ${position + 1} of ${total} — ${page.title}`,
    position,
    total,
    instructions,
    tone,
    goal: GOAL_DIRECTIONS[campaign.goal] ?? null,
    transitionHint: TRANSITION_HINTS[page.type] ?? null,
    messageCount,
    maxMessages: DEFAULT_MAX_MESSAGES,
    actionButtonIds: [funnel.actionPageId],
  };
}
