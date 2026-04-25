import { generateResponse } from "@/lib/ai/llm-client";
import { createServiceClient } from "@/lib/supabase/service";
import { normalizeKey } from "@/lib/leads/key-normalizer";

export interface ExtractKnowledgeParams {
  tenantId: string;
  leadId: string;
  messageText: string;
  messageId: string | null;
}

interface ExtractionResult {
  knowledge: { key: string; value: string }[];
  contacts: { type: "phone" | "email"; value: string }[];
  first_name: string | null;
  last_name: string | null;
}

const EXTRACTION_PROMPT = `You are a data extraction assistant. Analyze the user's message and extract any key facts about them.

Return a JSON object with this exact structure:
{
  "knowledge": [{"key": "category", "value": "extracted fact"}],
  "contacts": [{"type": "phone"|"email", "value": "the number or address"}],
  "first_name": "their first name or null",
  "last_name": "their last name or null"
}

Categories for knowledge: business, budget, location, intent, preference, timeline, pain_point, or any other relevant category.

Only extract facts explicitly stated in the message. Do not infer or guess.
If nothing is extractable, return empty arrays and null names.`;

export async function extractKnowledge(params: ExtractKnowledgeParams): Promise<void> {
  const { tenantId, leadId, messageText, messageId } = params;

  try {
    const response = await generateResponse(EXTRACTION_PROMPT, messageText, {
      temperature: 0.1,
      maxTokens: 256,
      responseFormat: "json_object",
    });

    let parsed: ExtractionResult;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      console.warn("[knowledge-extractor] Failed to parse LLM response as JSON");
      return;
    }

    const supabase = createServiceClient();

    // Upsert knowledge entries
    if (parsed.knowledge?.length > 0) {
      const rows = parsed.knowledge.map((k) => ({
        tenant_id: tenantId,
        lead_id: leadId,
        key: normalizeKey(k.key),
        value: k.value,
        source: "ai_extracted" as const,
        extracted_from: messageId,
        updated_at: new Date().toISOString(),
      }));

      await supabase.from("lead_knowledge").upsert(rows, {
        onConflict: "tenant_id,lead_id,key",
      });
    }

    // Upsert contacts
    if (parsed.contacts?.length > 0) {
      const contactRows = parsed.contacts.map((c) => ({
        tenant_id: tenantId,
        lead_id: leadId,
        type: c.type,
        value: c.value,
        source: "ai_extracted" as const,
        is_primary: false,
      }));

      await supabase.from("lead_contacts").upsert(contactRows, {
        onConflict: "tenant_id,lead_id,type,value",
      });
    }

    // Update first_name / last_name on leads table
    if (parsed.first_name || parsed.last_name) {
      const updates: Record<string, string> = {};
      if (parsed.first_name) updates.first_name = parsed.first_name;
      if (parsed.last_name) updates.last_name = parsed.last_name;

      await supabase
        .from("leads")
        .update(updates)
        .eq("id", leadId)
        .eq("tenant_id", tenantId);
    }
  } catch (err) {
    console.warn("[knowledge-extractor] Extraction failed (non-blocking):", err);
  }
}
