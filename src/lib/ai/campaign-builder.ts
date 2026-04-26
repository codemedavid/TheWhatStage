import { z } from "zod";
import { generateResponse } from "@/lib/ai/llm-client";

// --- Shared schemas ---

const campaignGoalSchema = z.enum([
  "form_submit",
  "appointment_booked",
  "purchase",
  "stage_reached",
]);

const phaseOutlineSchema = z.object({
  name: z.string().min(1).max(100),
  purpose: z.string().min(1).max(300),
});

const campaignPlanSchema = z.object({
  goal_summary: z.string().min(1).max(500),
  selling_approach: z.string().min(1).max(500),
  buyer_context: z.string().min(1).max(500),
  key_behaviors: z.array(z.string().min(1).max(300)).min(1).max(8),
  phase_outline: z.array(phaseOutlineSchema).min(2).max(6),
});

const generatedPhaseSchema = z.object({
  name: z.string().min(1).max(100),
  order_index: z.number().int().min(0).max(7),
  max_messages: z.number().int().min(1).max(10),
  system_prompt: z.string().min(1).max(5000),
  tone: z.string().min(1).max(200),
  goals: z.string().min(1).max(2000),
  transition_hint: z.string().min(1).max(1000),
});

// --- Plan prompt schemas ---

const planResponseSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("question"),
    question: z.string().min(1).max(1000),
  }),
  z.object({
    action: z.literal("plan"),
    campaign_name: z.string().min(1).max(200),
    campaign_description: z.string().min(1).max(1000),
    campaign_goal: campaignGoalSchema,
    plan: campaignPlanSchema,
    campaign_rules: z.array(z.string().min(1).max(300)).max(10).default([]),
  }),
]);

// --- Phase edit schemas ---

const phaseEditResponseSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update"),
    phases: z.array(generatedPhaseSchema).min(3).max(8),
    updatedIndices: z.array(z.number().int().min(0)).min(1),
    rulesUpdate: z.array(z.string().min(1).max(300)).optional(),
  }),
  z.object({
    action: z.literal("add"),
    phases: z.array(generatedPhaseSchema).min(3).max(8),
    addedIndex: z.number().int().min(0),
    rulesUpdate: z.array(z.string().min(1).max(300)).optional(),
  }),
  z.object({
    action: z.literal("regenerate"),
    phases: z.array(generatedPhaseSchema).min(3).max(8),
    rulesUpdate: z.array(z.string().min(1).max(300)).optional(),
  }),
]);

// --- Exported types ---

export type CampaignGoal = z.infer<typeof campaignGoalSchema>;
export type CampaignPlan = z.infer<typeof campaignPlanSchema>;
export type GeneratedCampaignPhase = z.infer<typeof generatedPhaseSchema>;
export type PlanResponse = z.infer<typeof planResponseSchema>;
export type PhaseEditResponse = z.infer<typeof phaseEditResponseSchema>;

export interface CampaignBuilderTenantContext {
  tenantName: string;
  businessType: string;
  botGoal: string;
  businessDescription: string | null;
  mainAction: string | null;
  differentiator: string | null;
  qualificationCriteria: string | null;
  primaryCampaign?: {
    id: string;
    name: string;
    description: string | null;
    goal: string;
  } | null;
}

export interface BuilderChatMessage {
  role: "user" | "assistant";
  text: string;
}

// --- Config ---

const MODEL_CONFIG = {
  responseFormat: "json_object" as const,
  temperature: 0.45,
  maxTokens: 2200,
};

// --- Tenant context block (shared) ---

function tenantBlock(context: CampaignBuilderTenantContext): string {
  const primary = context.primaryCampaign
    ? `${context.primaryCampaign.name}: ${context.primaryCampaign.description ?? "No description"}`
    : "No primary campaign found.";

  return [
    "Tenant context:",
    `Business: ${context.tenantName}`,
    `Business type: ${context.businessType}`,
    `Bot goal: ${context.botGoal}`,
    `Business description: ${context.businessDescription ?? "Not provided"}`,
    `Main action: ${context.mainAction ?? "Not provided"}`,
    `Differentiator: ${context.differentiator ?? "Not provided"}`,
    `Qualification criteria: ${context.qualificationCriteria ?? "Not provided"}`,
    `Current primary campaign: ${primary}`,
  ].join("\n");
}

function formatHistory(history?: BuilderChatMessage[]): string {
  if (!history?.length) return "No previous builder chat.";
  return history
    .slice(-8)
    .map((m) => `${m.role === "user" ? "Tenant" : "Builder"}: ${m.text}`)
    .join("\n");
}

// --- Plan prompt ---

export function buildPlanSystemPrompt(
  context: CampaignBuilderTenantContext
): string {
  return [
    "You are a sales system architect for Messenger bots.",
    "Your job is to understand what the tenant wants to achieve and design a campaign plan — not phases yet, just the strategic blueprint.",
    "",
    "If the tenant gives detailed direction, produce the plan immediately.",
    "If vague, ask 1-2 focused questions before producing the plan.",
    "Never ask more than 2 questions in a row — if you already have enough context, produce the plan.",
    "",
    "Return ONLY valid JSON with one of these shapes:",
    "",
    'Question: { "action": "question", "question": "string" }',
    "",
    "Plan:",
    '{',
    '  "action": "plan",',
    '  "campaign_name": "string",',
    '  "campaign_description": "string",',
    '  "campaign_goal": "form_submit | appointment_booked | purchase | stage_reached",',
    '  "plan": {',
    '    "goal_summary": "string",',
    '    "selling_approach": "string",',
    '    "buyer_context": "string",',
    '    "key_behaviors": ["string"],',
    '    "phase_outline": [{ "name": "string", "purpose": "string" }]',
    '  },',
    '  "campaign_rules": ["string"]',
    '}',
    "",
    tenantBlock(context),
  ].join("\n");
}

export async function generatePlan(input: {
  context: CampaignBuilderTenantContext;
  message: string;
  history?: BuilderChatMessage[];
  existingPlan?: CampaignPlan | null;
  existingRules?: string[];
}): Promise<PlanResponse> {
  const systemPrompt = buildPlanSystemPrompt(input.context);
  const parts = [
    input.existingPlan
      ? `Current campaign plan:\n${JSON.stringify(input.existingPlan, null, 2)}\n\nCurrent campaign rules:\n${(input.existingRules ?? []).map((rule) => `- ${rule}`).join("\n") || "No campaign rules yet."}\n\nRevise the plan using the tenant's latest direction.`
      : "Create a new campaign plan from this tenant direction.",
    "",
    `Tenant direction: ${input.message}`,
    "",
    "Builder chat history:",
    formatHistory(input.history),
  ];
  const userMessage = parts.join("\n");

  const response = await generateResponse(systemPrompt, userMessage, MODEL_CONFIG);
  return parseOrRepair(response.content, systemPrompt, userMessage, planResponseSchema) as Promise<PlanResponse>;
}

// --- Phase generation prompt ---

export function buildPhaseGenSystemPrompt(
  context: CampaignBuilderTenantContext,
  plan: CampaignPlan,
  rules: string[]
): string {
  return [
    "You are generating conversation phases from an approved campaign plan.",
    "Each phase is a behavioral briefing for a Messenger sales bot, not a canned script.",
    "",
    "Use CLOSER as hidden reasoning only:",
    "- Clarify why the lead is there.",
    "- Label the real problem/desire.",
    "- Overview relevant context.",
    "- Sell the outcome, not mechanics.",
    "- Explain concerns directly.",
    "- Reinforce the next decision.",
    "",
    "Do not turn CLOSER into literal phase names or mention any framework.",
    "Generate 3-6 phases based on the phase outline in the plan.",
    "Use concise, human Messenger behavior.",
    "",
    'Return ONLY valid JSON: { "phases": [{ "name", "order_index", "max_messages", "system_prompt", "tone", "goals", "transition_hint" }] }',
    "",
    "Approved campaign plan:",
    `Goal: ${plan.goal_summary}`,
    `Approach: ${plan.selling_approach}`,
    `Buyer context: ${plan.buyer_context}`,
    `Key behaviors: ${plan.key_behaviors.join("; ")}`,
    `Phase outline: ${plan.phase_outline.map((p, i) => `${i + 1}. ${p.name} — ${p.purpose}`).join("; ")}`,
    "",
    rules.length > 0 ? `Campaign rules:\n${rules.map((r) => `- ${r}`).join("\n")}` : "",
    "",
    tenantBlock(context),
  ].join("\n");
}

const phaseGenResponseSchema = z.object({
  phases: z.array(generatedPhaseSchema).min(3).max(8),
});

export async function generatePhasesFromPlan(input: {
  context: CampaignBuilderTenantContext;
  plan: CampaignPlan;
  rules: string[];
}): Promise<GeneratedCampaignPhase[]> {
  const systemPrompt = buildPhaseGenSystemPrompt(input.context, input.plan, input.rules);
  const userMessage = "Generate the full conversation phases from the approved campaign plan.";

  const response = await generateResponse(systemPrompt, userMessage, MODEL_CONFIG);
  const parsed = await parseOrRepair(response.content, systemPrompt, userMessage, phaseGenResponseSchema);
  return normalizePhases(parsed.phases);
}

// --- Phase edit prompt ---

export function buildPhaseEditSystemPrompt(
  context: CampaignBuilderTenantContext,
  plan: CampaignPlan,
  rules: string[],
  currentPhases: GeneratedCampaignPhase[],
  focusedPhaseIndex?: number
): string {
  const phaseSummary = currentPhases
    .map((p) => `  [${p.order_index}] ${p.name}: ${p.goals} (tone: ${p.tone})`)
    .join("\n");

  const focusLine =
    focusedPhaseIndex !== undefined
      ? `\nFOCUSED PHASE: index ${focusedPhaseIndex} — "${currentPhases[focusedPhaseIndex]?.name}". The tenant is talking about this phase unless they say otherwise.`
      : "";

  return [
    "You are refining phases of an existing campaign. Decide the minimal scope of change needed.",
    "",
    "If the change only affects one phase, return action=update with only that phase changed.",
    "If it affects the flow (adding/removing/reordering), return action=add or action=regenerate.",
    "If it fundamentally changes the approach, return action=regenerate.",
    "If the change also affects campaign rules, include rulesUpdate.",
    "",
    "Return ONLY valid JSON with one of these shapes:",
    '{ "action": "update", "phases": [...all phases...], "updatedIndices": [1], "rulesUpdate?": ["string"] }',
    '{ "action": "add", "phases": [...all phases with new one inserted...], "addedIndex": 2, "rulesUpdate?": ["string"] }',
    '{ "action": "regenerate", "phases": [...all new phases...], "rulesUpdate?": ["string"] }',
    "",
    "Campaign plan:",
    JSON.stringify(plan, null, 2),
    "",
    rules.length > 0 ? `Campaign rules:\n${rules.map((r) => `- ${r}`).join("\n")}` : "",
    "",
    "Current phases:",
    phaseSummary,
    focusLine,
    "",
    tenantBlock(context),
  ].join("\n");
}

export async function editPhases(input: {
  context: CampaignBuilderTenantContext;
  plan: CampaignPlan;
  rules: string[];
  currentPhases: GeneratedCampaignPhase[];
  message: string;
  focusedPhaseIndex?: number;
  history?: BuilderChatMessage[];
}): Promise<PhaseEditResponse> {
  const systemPrompt = buildPhaseEditSystemPrompt(
    input.context,
    input.plan,
    input.rules,
    input.currentPhases,
    input.focusedPhaseIndex
  );
  const userMessage = [
    `Tenant direction: ${input.message}`,
    "",
    "Builder chat history:",
    formatHistory(input.history),
  ].join("\n");

  const response = await generateResponse(systemPrompt, userMessage, MODEL_CONFIG);
  const result = await parseOrRepair(response.content, systemPrompt, userMessage, phaseEditResponseSchema);
  return { ...result, phases: normalizePhases(result.phases) };
}

// --- Shared helpers ---

function normalizePhases(phases: GeneratedCampaignPhase[]): GeneratedCampaignPhase[] {
  return [...phases]
    .sort((a, b) => a.order_index - b.order_index)
    .map((phase, index) => ({ ...phase, order_index: index }));
}

async function parseOrRepair<T>(
  raw: string,
  systemPrompt: string,
  userMessage: string,
  schema: z.ZodType<T>
): Promise<T> {
  try {
    return schema.parse(JSON.parse(raw));
  } catch (firstError) {
    const repairSystemPrompt = [
      "Repair the JSON so it matches the required schema.",
      "Return ONLY valid JSON. Do not add explanations.",
      "",
      "Original system prompt:",
      systemPrompt,
    ].join("\n");
    const repairUserMessage = [
      "Original user message:",
      userMessage,
      "",
      "Invalid output:",
      raw,
      "",
      "Validation error:",
      firstError instanceof Error ? firstError.message : String(firstError),
    ].join("\n");

    const repaired = await generateResponse(repairSystemPrompt, repairUserMessage, MODEL_CONFIG);
    try {
      return schema.parse(JSON.parse(repaired.content));
    } catch (secondError) {
      const message = secondError instanceof Error ? secondError.message : String(secondError);
      throw new Error(`Invalid campaign builder output: ${message}`);
    }
  }
}
