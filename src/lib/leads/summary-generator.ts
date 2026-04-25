import { generateResponse } from "@/lib/ai/llm-client";
import { createServiceClient } from "@/lib/supabase/service";

export interface GenerateSummaryParams {
  tenantId: string;
  leadId: string;
  conversationId: string;
}

const SUMMARY_PROMPT = `You are a CRM assistant. Summarize the following conversation between a business chatbot and a lead.

Include:
- Key topics discussed
- Actions taken (buttons clicked, forms submitted, pages visited)
- Lead sentiment and intent signals
- Any commitments made (e.g., "will check back Thursday")
- Outcome: converted, still interested, dropped off, or needs follow-up

Be concise — 2-4 sentences max. Write in third person ("The lead...").`;

export async function generateLeadSummary(params: GenerateSummaryParams): Promise<void> {
  const { tenantId, leadId, conversationId } = params;

  try {
    const supabase = createServiceClient();

    const { data: messages, error } = await supabase
      .from("messages")
      .select("direction, text, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(50);

    if (error || !messages || messages.length === 0) return;

    const transcript = messages
      .map((m) => {
        const role = m.direction === "in" ? "Lead" : "Bot";
        return `${role}: ${m.text ?? "[attachment]"}`;
      })
      .join("\n");

    const response = await generateResponse(SUMMARY_PROMPT, transcript, {
      temperature: 0.3,
      maxTokens: 256,
      responseFormat: "text",
    });

    await supabase.from("lead_notes").insert({
      tenant_id: tenantId,
      lead_id: leadId,
      conversation_id: conversationId,
      type: "ai_summary",
      content: response.content,
    });
  } catch (err) {
    console.warn("[summary-generator] Summary generation failed (non-blocking):", err);
  }
}
