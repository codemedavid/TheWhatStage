import { jsonrepair } from "jsonrepair";

export interface LLMDecision {
  message: string;
  phaseAction: "stay" | "advance" | "escalate";
  confidence: number;
  imageIds: string[];
  actionButtonId: string | null;
  ctaText: string | null;
  buttonConfidence: number | null;
  buttonLabel: string | null;
  citedChunks?: number[];
}

// Meta's hard limit on button title length. Anything longer is rejected by
// the Send API. We trim defensively before returning.
const MAX_BUTTON_LABEL_LEN = 20;

const VALID_ACTIONS = new Set(["stay", "advance", "escalate"]);

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return JSON.parse(jsonrepair(raw));
  }
}

function extractJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    // Continue to fence match
  }

  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    try {
      return safeParse(fenceMatch[1].trim());
    } catch {
      // Continue
    }
  }

  const braceMatch = raw.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      return safeParse(braceMatch[0]);
    } catch {
      // Continue to final safeParse fallback
    }
  }

  // Last resort: try to repair the raw input directly
  // (e.g., unclosed brackets without fence/brace structure)
  try {
    return safeParse(raw);
  } catch {
    // Give up
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
      buttonConfidence: null,
      buttonLabel: null,
      citedChunks: undefined,
    };
  }

  const obj = parsed as Record<string, unknown>;

  const message = typeof obj.message === "string" ? obj.message : "";
  const confidence = clampConfidence(obj.confidence);

  const rawAction = typeof obj.funnel_action === "string" ? obj.funnel_action : obj.phase_action;
  let phaseAction: "stay" | "advance" | "escalate" =
    typeof rawAction === "string" && VALID_ACTIONS.has(rawAction)
      ? (rawAction as "stay" | "advance" | "escalate")
      : "stay";

  if (message === "") {
    phaseAction = "escalate";
  }
  // Note: previously low confidence (< 0.4) auto-escalated. Removed: the LLM
  // marks low confidence honestly on vague greetings ("uy") and the right
  // move there is to ship the reply and stay engaged, not to hand off to a
  // human. Trust the LLM's own funnel_action; empty-message escalation above
  // still catches genuine "stuck" cases.

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

  const buttonConfidence =
    actionButtonId !== null && typeof obj.button_confidence === "number" && !Number.isNaN(obj.button_confidence)
      ? Math.max(0.0, Math.min(1.0, obj.button_confidence))
      : null;

  const buttonLabel =
    actionButtonId !== null && typeof obj.button_label === "string" && obj.button_label.trim().length > 0
      ? obj.button_label.trim().slice(0, MAX_BUTTON_LABEL_LEN)
      : null;

  const citedChunks = Array.isArray(obj.cited_chunks)
    ? obj.cited_chunks.filter((idx): idx is number => typeof idx === "number")
    : undefined;

  return { message, phaseAction, confidence, imageIds, actionButtonId, ctaText, buttonConfidence, buttonLabel, citedChunks };
}
