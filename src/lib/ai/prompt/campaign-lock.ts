export interface CampaignAnchorInput {
  name: string;
  goal: string;
  mainGoal?: string | null;
  description?: string | null;
}

export interface StepAnchorInput {
  name: string;
  actionButtonTitle: string | null;
}

export function buildCampaignTopAnchor(
  campaign: CampaignAnchorInput,
  step: StepAnchorInput,
): string {
  const lines = [
    "--- MISSION (active campaign + step) ---",
    `Active campaign: ${campaign.name}.`,
    campaign.mainGoal ? `Campaign goal: ${campaign.mainGoal}.` : `Campaign goal: ${campaign.goal}.`,
  ];
  if (campaign.description) lines.push(`What we are offering: ${campaign.description}.`);
  lines.push(`Current step: ${step.name}.`);
  if (step.actionButtonTitle) {
    lines.push(`Step success metric: lead clicks the "${step.actionButtonTitle}" button.`);
  }
  lines.push(
    "Every reply must move toward this metric. A reply that does not is a failed turn — even if it sounds friendly.",
  );
  return lines.join("\n");
}

export function buildCampaignClosingAnchor(
  campaign: CampaignAnchorInput,
  step: StepAnchorInput,
): string {
  const goal = campaign.mainGoal ?? campaign.goal;
  return [
    "--- CLOSING ANCHOR (read this last before you reply) ---",
    `Campaign goal: ${goal}.`,
    step.actionButtonTitle
      ? `This turn must move the lead toward the "${step.actionButtonTitle}" button.`
      : `This turn must move the lead toward the campaign goal.`,
    "If your draft reply does not visibly do that, rewrite it before sending.",
  ].join("\n");
}
