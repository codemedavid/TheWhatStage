// src/lib/onboarding/persist.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GenerationInput, GenerationResults } from "./generation-types";

// Note: This persist sequence is not wrapped in a DB transaction (Supabase JS client
// does not support client-side transactions). If a step fails mid-sequence, partial
// data may exist (tenant created but no campaign, etc.). The checkpoint retry mechanism
// in onboarding_generations handles recovery at the pipeline level, not here.
export async function persistResults(
  userId: string,
  input: GenerationInput,
  results: GenerationResults,
  generationId: string,
  service: SupabaseClient
): Promise<string> {
  // 1. Create tenant
  const { data: rows, error: tenantErr } = await service.rpc("create_tenant_with_owner", {
    p_name: input.tenantName,
    p_slug: input.tenantSlug,
    p_business_type: input.businessType,
    p_bot_goal: input.botGoal,
    p_user_id: userId,
  });
  if (tenantErr) throw new Error(`Tenant creation failed: ${tenantErr.message}`);

  const tenant = Array.isArray(rows) ? rows[0] : rows;
  const tenantId: string = tenant.id;

  // 2. Update tenant with business context
  const { error: tenantUpdateErr } = await service
    .from("tenants")
    .update({
      business_description: input.businessDescription,
      main_action: input.mainAction,
      differentiator: input.differentiator || null,
      qualification_criteria: input.qualificationCriteria,
      website_url: input.websiteUrl || null,
    })
    .eq("id", tenantId);
  if (tenantUpdateErr) throw new Error(`Tenant update failed: ${tenantUpdateErr.message}`);

  // 3. Update user metadata
  await service.auth.admin.updateUserById(userId, {
    user_metadata: { first_name: input.firstName, last_name: input.lastName, tenant_id: tenantId },
  });

  // 4. Link generation record to tenant
  await service
    .from("onboarding_generations")
    .update({ tenant_id: tenantId })
    .eq("id", generationId);

  // 5. Insert campaign
  const { data: campaign, error: campErr } = await service
    .from("campaigns")
    .insert({
      tenant_id: tenantId,
      name: results.campaign!.name,
      description: results.campaign!.description,
      goal: results.campaign!.goal,
      follow_up_message: results.campaign!.follow_up_message,
      is_primary: true,
      status: "active",
    })
    .select("id")
    .single();
  if (campErr) throw new Error(`Campaign creation failed: ${campErr.message}`);

  // 6. Insert campaign phases
  const phaseRows = results.phases!.map((p) => ({
    campaign_id: campaign.id,
    tenant_id: tenantId,
    name: p.name,
    order_index: p.order,
    max_messages: p.max_messages,
    system_prompt: p.system_prompt,
    tone: p.tone,
    goals: p.goals,
    transition_hint: p.transition_hint,
  }));
  const { error: phaseErr } = await service.from("campaign_phases").insert(phaseRows);
  if (phaseErr) throw new Error(`Phase creation failed: ${phaseErr.message}`);

  // 7. Insert knowledge — FAQs
  for (let i = 0; i < (results.faqs?.length ?? 0); i++) {
    const faq = results.faqs![i];
    const { data: doc } = await service
      .from("knowledge_docs")
      .insert({
        tenant_id: tenantId,
        title: faq.question,
        type: "faq",
        status: "ready",
      })
      .select("id")
      .single();

    if (doc) {
      const chunkContent = `Q: ${faq.question}\nA: ${faq.answer}`;
      await service.from("knowledge_chunks").insert({
        doc_id: doc.id,
        tenant_id: tenantId,
        content: chunkContent,
        kb_type: "general",
        embedding: results.embeddings!.faqEmbeddings[i],
      });
    }
  }

  // 8. Insert knowledge — general article
  if (results.generalArticle) {
    const { data: doc } = await service
      .from("knowledge_docs")
      .insert({
        tenant_id: tenantId,
        title: `About ${input.tenantName}`,
        type: "richtext",
        status: "ready",
      })
      .select("id")
      .single();

    if (doc) {
      await service.from("knowledge_chunks").insert({
        doc_id: doc.id,
        tenant_id: tenantId,
        content: results.generalArticle,
        kb_type: "general",
        embedding: results.embeddings!.generalArticleEmbedding,
      });
    }
  }

  // 9. Insert knowledge — URL article
  if (results.urlArticle && results.embeddings?.urlArticleEmbedding) {
    const { data: doc } = await service
      .from("knowledge_docs")
      .insert({
        tenant_id: tenantId,
        title: `${input.tenantName} Website Content`,
        type: "richtext",
        status: "ready",
      })
      .select("id")
      .single();

    if (doc) {
      await service.from("knowledge_chunks").insert({
        doc_id: doc.id,
        tenant_id: tenantId,
        content: results.urlArticle,
        kb_type: "general",
        embedding: results.embeddings.urlArticleEmbedding,
      });
    }
  }

  return tenantId;
}
