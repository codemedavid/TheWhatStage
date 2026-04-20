import type { GenerationInput, BusinessContext } from "./generation-types";

export function buildContext(input: GenerationInput): BusinessContext {
  return {
    businessType: input.businessType,
    botGoal: input.botGoal,
    businessDescription: input.businessDescription,
    mainAction: input.mainAction,
    differentiator: input.differentiator,
    qualificationCriteria: input.qualificationCriteria,
    tenantName: input.tenantName,
    ...(input.websiteUrl ? { websiteUrl: input.websiteUrl } : {}),
  };
}
