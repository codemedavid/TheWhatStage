export interface LLMDecision {
  message: string;
  phaseAction: "stay" | "advance" | "escalate";
  confidence: number;
  imageIds: string[];
  actionButtonId: string | null;
  ctaText: string | null;
}

const VALID_ACTIONS = new Set(["stay", "advance", "escalate"]);

function extractJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    // Continue
  }

  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // Continue
    }
  }

  const braceMatch = raw.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0]);
    } catch {
      // Give up
    }
  }

  return null;
}

function clampConfidence(value: unknown): number {
  const num = typeof value === "number" && !Number.isNaN(value) ? value : 0.5;
  return Math.max(0.0, Math.min(1.0, num));
}

export function parseDecision(raw: string): LLMDecision {
  const parsed = extractJson(raw);

  if (!parsed || typeof parsed !== "object") {
    return {
      message: "",
      phaseAction: "escalate",
      confidence: 0.5,
      imageIds: [],
      actionButtonId: null,
      ctaText: null,
    };
  }

  const obj = parsed as Record<string, unknown>;

  const message = typeof obj.message === "string" ? obj.message : "";
  const confidence = clampConfidence(obj.confidence);

  let phaseAction: "stay" | "advance" | "escalate" =
    typeof obj.phase_action === "string" && VALID_ACTIONS.has(obj.phase_action)
      ? (obj.phase_action as "stay" | "advance" | "escalate")
      : "stay";

  if (message === "") {
    phaseAction = "escalate";
  }

  if (confidence < 0.4) {
    phaseAction = "escalate";
  }

  const imageIds = Array.isArray(obj.image_ids)
    ? obj.image_ids.filter((id): id is string => typeof id === "string")
    : [];

  const actionButtonId =
    typeof obj.action_button_id === "string" && obj.action_button_id.length > 0
      ? obj.action_button_id
      : null;

  const ctaText =
    actionButtonId !== null && typeof obj.cta_text === "string" && obj.cta_text.length > 0
      ? obj.cta_text
      : null;

  return { message, phaseAction, confidence, imageIds, actionButtonId, ctaText };
}
