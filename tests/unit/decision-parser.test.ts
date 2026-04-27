import { describe, it, expect } from "vitest";
import { parseDecision } from "@/lib/ai/decision-parser";

describe("parseDecision", () => {
  it("parses valid JSON with all fields", () => {
    const raw = JSON.stringify({
      message: "Hey there! How can I help?",
      phase_action: "stay",
      confidence: 0.85,
      image_ids: ["img-1"],
    });

    const result = parseDecision(raw);

    expect(result.message).toBe("Hey there! How can I help?");
    expect(result.phaseAction).toBe("stay");
    expect(result.confidence).toBe(0.85);
    expect(result.imageIds).toEqual(["img-1"]);
  });

  it("parses advance action", () => {
    const raw = JSON.stringify({
      message: "Great, let me show you our options.",
      phase_action: "advance",
      confidence: 0.9,
      image_ids: [],
    });

    const result = parseDecision(raw);
    expect(result.phaseAction).toBe("advance");
  });

  it("prefers funnel_action over legacy phase_action", () => {
    const raw = JSON.stringify({
      message: "Great, let's move forward.",
      funnel_action: "advance",
      phase_action: "stay",
      confidence: 0.9,
      image_ids: [],
    });

    const result = parseDecision(raw);
    expect(result.phaseAction).toBe("advance");
  });

  it("parses escalate action", () => {
    const raw = JSON.stringify({
      message: "Let me get someone who can help.",
      phase_action: "escalate",
      confidence: 0.3,
      image_ids: [],
    });

    const result = parseDecision(raw);
    expect(result.phaseAction).toBe("escalate");
  });

  it("respects LLM's stay choice even when confidence is low (parser no longer auto-escalates on low confidence — friendly greetings stay engaged)", () => {
    const raw = JSON.stringify({
      message: "I think so...",
      phase_action: "stay",
      confidence: 0.2,
      image_ids: [],
    });

    const result = parseDecision(raw);
    expect(result.phaseAction).toBe("stay");
    expect(result.confidence).toBe(0.2);
  });

  it("clamps confidence above 1.0 to 1.0", () => {
    const raw = JSON.stringify({
      message: "Sure!",
      phase_action: "stay",
      confidence: 1.5,
      image_ids: [],
    });

    const result = parseDecision(raw);
    expect(result.confidence).toBe(1.0);
  });

  it("clamps negative confidence to 0.0 and respects LLM's stay choice", () => {
    const raw = JSON.stringify({
      message: "Hmm...",
      phase_action: "stay",
      confidence: -0.5,
      image_ids: [],
    });

    const result = parseDecision(raw);
    expect(result.confidence).toBe(0.0);
    expect(result.phaseAction).toBe("stay");
  });

  it("extracts JSON from markdown code fences", () => {
    const raw = '```json\n{"message":"Hi!","phase_action":"stay","confidence":0.8,"image_ids":[]}\n```';

    const result = parseDecision(raw);
    expect(result.message).toBe("Hi!");
    expect(result.phaseAction).toBe("stay");
  });

  it("extracts JSON when LLM adds preamble text", () => {
    const raw = 'Here is my response:\n{"message":"Hello!","phase_action":"stay","confidence":0.75,"image_ids":[]}';

    const result = parseDecision(raw);
    expect(result.message).toBe("Hello!");
  });

  it("falls back to defaults for missing fields", () => {
    const raw = JSON.stringify({ message: "Hi" });

    const result = parseDecision(raw);
    expect(result.message).toBe("Hi");
    expect(result.phaseAction).toBe("stay");
    expect(result.confidence).toBe(0.5);
    expect(result.imageIds).toEqual([]);
  });

  it("falls back to escalate when message is empty string", () => {
    const raw = JSON.stringify({
      message: "",
      phase_action: "stay",
      confidence: 0.8,
      image_ids: [],
    });

    const result = parseDecision(raw);
    expect(result.phaseAction).toBe("escalate");
    expect(result.message).toBe("");
  });

  it("falls back to defaults for completely invalid input", () => {
    const raw = "This is not JSON at all, just random text.";

    const result = parseDecision(raw);
    expect(result.message).toBe("");
    expect(result.phaseAction).toBe("escalate");
    expect(result.confidence).toBe(0.5);
    expect(result.imageIds).toEqual([]);
  });

  it("falls back phase_action to stay for unknown action values", () => {
    const raw = JSON.stringify({
      message: "Test",
      phase_action: "jump",
      confidence: 0.8,
      image_ids: [],
    });

    const result = parseDecision(raw);
    expect(result.phaseAction).toBe("stay");
  });

  it("filters non-string values from image_ids", () => {
    const raw = JSON.stringify({
      message: "Here you go",
      phase_action: "stay",
      confidence: 0.9,
      image_ids: ["img-1", 42, null, "img-2"],
    });

    const result = parseDecision(raw);
    expect(result.imageIds).toEqual(["img-1", "img-2"]);
  });

  it("handles NaN confidence by falling back to 0.5", () => {
    const raw = JSON.stringify({
      message: "Test",
      phase_action: "stay",
      confidence: NaN,
      image_ids: [],
    });

    const result = parseDecision(raw);
    expect(result.confidence).toBe(0.5);
  });

  it("handles null message by falling back to empty string and escalating", () => {
    const raw = JSON.stringify({
      message: null,
      phase_action: "stay",
      confidence: 0.9,
      image_ids: [],
    });

    const result = parseDecision(raw);
    expect(result.message).toBe("");
    expect(result.phaseAction).toBe("escalate");
  });

  it("handles non-object image_ids by falling back to empty array", () => {
    const raw = JSON.stringify({
      message: "Test",
      phase_action: "stay",
      confidence: 0.8,
      image_ids: "not-an-array",
    });

    const result = parseDecision(raw);
    expect(result.imageIds).toEqual([]);
  });

  it("parses action_button_id when present", () => {
    const raw = JSON.stringify({
      message: "Check this out!",
      phase_action: "stay",
      confidence: 0.9,
      image_ids: [],
      action_button_id: "ap-123",
      cta_text: "Book your free consultation!",
    });

    const result = parseDecision(raw);
    expect(result.actionButtonId).toBe("ap-123");
    expect(result.ctaText).toBe("Book your free consultation!");
  });

  it("returns null actionButtonId when not present", () => {
    const raw = JSON.stringify({
      message: "Hey there!",
      phase_action: "stay",
      confidence: 0.85,
      image_ids: [],
    });

    const result = parseDecision(raw);
    expect(result.actionButtonId).toBeNull();
    expect(result.ctaText).toBeNull();
  });

  it("returns null actionButtonId when value is not a string", () => {
    const raw = JSON.stringify({
      message: "Hey",
      phase_action: "stay",
      confidence: 0.8,
      image_ids: [],
      action_button_id: 42,
    });

    const result = parseDecision(raw);
    expect(result.actionButtonId).toBeNull();
  });

  it("returns null ctaText when action_button_id is absent even if cta_text is present", () => {
    const raw = JSON.stringify({
      message: "Hey",
      phase_action: "stay",
      confidence: 0.8,
      image_ids: [],
      cta_text: "Click me!",
    });

    const result = parseDecision(raw);
    expect(result.actionButtonId).toBeNull();
    expect(result.ctaText).toBeNull();
  });
});
