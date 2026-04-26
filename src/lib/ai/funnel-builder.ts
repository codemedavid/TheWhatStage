// src/lib/ai/funnel-builder.ts
import { z } from "zod";
import { generateResponse } from "@/lib/ai/llm-client";
import type { ActionPageType } from "@/lib/ai/funnel-templates";

export interface AvailablePage {
  id: string;
  type: ActionPageType;
  title: string;
}

export type FunnelProposal =
  | { action: "question"; question: string }
  | {
      action: "propose";
      funnels: Array<{ actionPageId: string }>;
      topLevelRules: string[];
    };

const responseSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("question"), question: z.string().min(1).max(500) }),
  z.object({
    action: z.literal("propose"),
    // Loosened max here — manual check below gives the clear "at most 3" error message
    funnels: z
      .array(z.object({ action_page_id: z.string().uuid().or(z.string().min(1)) }))
      .min(1),
    top_level_rules: z.array(z.string().min(1).max(300)).max(8).default([]),
  }),
]);

function systemPrompt(pages: AvailablePage[]): string {
  const pageList = pages
    .map((p) => `- ${p.id} :: type=${p.type} :: title="${p.title}"`)
    .join("\n");
  return [
    "You design 1-3 step DM funnels for a Messenger sales bot.",
    "Given a tenant's intent and a list of their existing action pages, propose an ordered funnel of 1-3 pages (the LAST funnel is the conversion step).",
    "If the intent is too vague, ask ONE clarifying question first. Never ask more than one before proposing.",
    "Use ONLY action_page_ids that appear in the list below. Do not invent IDs.",
    "",
    "Available action pages:",
    pageList,
    "",
    "Respond with strict JSON. One of:",
    '{ "action": "question", "question": "..." }',
    '{ "action": "propose", "funnels": [{"action_page_id":"..."}, ...], "top_level_rules": ["..."] }',
  ].join("\n");
}

export async function proposeFunnelStructure(input: {
  kickoff: string;
  availablePages: AvailablePage[];
}): Promise<FunnelProposal> {
  if (input.availablePages.length === 0) {
    throw new Error("No action pages available. Build one first.");
  }

  const response = await generateResponse(systemPrompt(input.availablePages), input.kickoff, {
    responseFormat: "json_object",
    temperature: 0.4,
    maxTokens: 800,
  });

  const parsed = responseSchema.parse(JSON.parse(response.content));

  if (parsed.action === "question") {
    return { action: "question", question: parsed.question };
  }

  if (parsed.funnels.length > 3) {
    throw new Error("Proposal contains at most 3 funnels");
  }

  const knownIds = new Set(input.availablePages.map((p) => p.id));
  for (const f of parsed.funnels) {
    if (!knownIds.has(f.action_page_id)) {
      throw new Error(`Unknown action page id: ${f.action_page_id}`);
    }
  }

  return {
    action: "propose",
    funnels: parsed.funnels.map((f) => ({ actionPageId: f.action_page_id })),
    topLevelRules: parsed.top_level_rules,
  };
}
