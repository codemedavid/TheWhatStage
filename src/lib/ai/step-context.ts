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
  actionButtonIds: string[];
}

const TRANSITION_HINTS: Record<ActionPageType, string> = {
  sales: "Send the sales page button as soon as buying interest shows. Advance once they've engaged with it.",
  form: "Send the form button as soon as they're open to sharing info. Advance once they've engaged with it.",
  qualification: "Send the qualification button as soon as they're willing to answer. Advance once they've engaged with it.",
  calendar: "Send the booking button as soon as they're open to a call. Advance once they've engaged with it.",
  product_catalog: "Send the catalog button as soon as they hint at a category or browsing intent. Advance once they've engaged with it.",
  checkout: "Send the checkout button as soon as they're ready to buy. Advance once they've engaged with it.",
};

const GOAL_DIRECTIONS: Record<string, string> = {
  // campaigns.goal enum (current)
  qualify_leads: "Qualify the lead — surface fit, intent, and budget — then move them to the next step.",
  sell: "Move the lead toward purchase. Surface intent, handle objections, and get them onto the action page.",
  understand_intent: "Surface what the lead actually wants and why now. Use that to pick the next step.",
  collect_lead_info: "Collect the lead's contact info and qualifying details by getting them onto the form.",
  book_appointment: "Get the lead to book an appointment via the calendar action.",
  // legacy keys kept for back-compat with older campaigns
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
}

export function funnelToStep(input: FunnelToStepInput): StepContext {
  const { funnel, allFunnels, campaign, page, tone } = input;
  const position = allFunnels.findIndex((f) => f.id === funnel.id);
  const total = allFunnels.length;

  const rulesBlock =
    funnel.chatRules.length > 0
      ? `\n\nChat rules for this step:\n${funnel.chatRules.map((r) => `- ${r}`).join("\n")}`
      : "";
  const pitchBlock = funnel.pitch?.trim()
    ? `\n\nPitch for this step:\n${funnel.pitch.trim()}`
    : "";
  const qualificationBlock =
    funnel.qualificationQuestions.length > 0
      ? `\n\nFirst qualification questions:\n${funnel.qualificationQuestions
          .map((q, i) => `${i + 1}. ${q}`)
          .join("\n")}\nAsk these naturally, at most one per reply. If the lead already answered one, move to the next open question or the action button.`
      : "";
  const descBlock = funnel.pageDescription
    ? `\n\nPage context: ${funnel.pageDescription}`
    : "";
  const objective = [
    `Your one job in this step: get the lead to click the "${page.title}" button.`,
    `Path to that click: (1) work through the campaign playbook beats one-per-turn, (2) on a buying signal, drop the playbook and send the button immediately. Every reply moves the lead one step closer to that click — no filler turns.`,
  ].join(" ");
  const instructions = `${objective}${pitchBlock}${qualificationBlock}${rulesBlock}${descBlock}`;

  return {
    name: `Step ${position + 1} of ${total} — ${page.title}`,
    position,
    total,
    instructions,
    tone,
    goal: GOAL_DIRECTIONS[campaign.goal] ?? null,
    transitionHint: TRANSITION_HINTS[page.type] ?? null,
    actionButtonIds: [funnel.actionPageId],
  };
}
