// src/app/api/onboarding/generate/route.ts
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { runGenerationPipeline } from "@/lib/onboarding/generator";
import { isReservedSlug } from "@/lib/utils/slug";
import { persistResults } from "@/lib/onboarding/persist";
import type { Json } from "@/types/database";
import type { GenerationInput, SSEMessage, PreviewData } from "@/lib/onboarding/generation-types";

const inputSchema = z.object({
  businessType: z.enum(["ecommerce", "real_estate", "digital_product", "services"]),
  botGoal: z.enum(["qualify_leads", "sell", "understand_intent", "collect_lead_info"]),
  businessDescription: z.string().min(10).max(2000),
  mainAction: z.enum(["form", "appointment", "purchase", "sales_page", "call"]),
  differentiator: z.string().max(1000).optional().default(""),
  qualificationCriteria: z.string().min(5).max(2000),
  websiteUrl: z.string().url().optional().or(z.literal("")),
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).optional().default(""),
  tenantName: z.string().min(1).max(100),
  tenantSlug: z.string().regex(/^[a-z0-9][a-z0-9\-]{1,61}[a-z0-9]$/),
});

export async function POST(req: Request) {
  // 1. Authenticate
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // 2. Validate input
  const body = await req.json();
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input: GenerationInput = {
    ...parsed.data,
    differentiator: parsed.data.differentiator,
    websiteUrl: parsed.data.websiteUrl || undefined,
  };

  // 3. Check reserved slug
  if (isReservedSlug(input.tenantSlug)) {
    return Response.json({ error: "Slug is reserved" }, { status: 409 });
  }

  const service = createServiceClient();

  // Check slug uniqueness
  const { count } = await service
    .from("tenants")
    .select("id", { count: "exact", head: true })
    .eq("slug", input.tenantSlug);
  if (count && count > 0) {
    return Response.json({ error: "Slug is already taken" }, { status: 409 });
  }

  // 4. Create generation record
  const { data: gen, error: genErr } = await service
    .from("onboarding_generations")
    .insert({ user_id: user.id, input: input as unknown as Json, status: "running", results: {} as Json })
    .select("id")
    .single();

  if (genErr) {
    return Response.json({ error: "Failed to start generation" }, { status: 500 });
  }

  // 5. SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(msg: SSEMessage) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`));
      }

      try {
        const results = await runGenerationPipeline(input, null, (step, currentResults) => {
          // Best-effort checkpoint update in DB (not awaited — generator is synchronous callback)
          void service
            .from("onboarding_generations")
            .update({ checkpoint: step, results: currentResults as unknown as Json, updated_at: new Date().toISOString() })
            .eq("id", gen.id);
          send({ step, status: "done" });
        });

        // Persist to database
        await persistResults(user.id, input, results, gen.id, service);
        send({ step: "persisted", status: "done" });

        // Mark generation complete
        await service
          .from("onboarding_generations")
          .update({
            status: "completed",
            checkpoint: "persisted",
            results: results as unknown as Json,
            updated_at: new Date().toISOString(),
          })
          .eq("id", gen.id);

        // Build preview and send complete
        const preview: PreviewData = {
          campaignName: results.campaign!.name,
          campaignGoal: results.campaign!.goal,
          phaseNames: results.phases!.map((p) => p.name),
          faqCount: results.faqs?.length ?? 0,
          articleCount: (results.generalArticle ? 1 : 0) + (results.urlArticle ? 1 : 0),
          sampleGreeting: results.phases![0]?.system_prompt.slice(0, 200) ?? "",
        };
        send({ step: "complete", status: "done", data: { preview }, generationId: gen.id });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        await service
          .from("onboarding_generations")
          .update({ status: "failed", error: message, updated_at: new Date().toISOString() })
          .eq("id", gen.id);
        send({ step: "error", status: "failed", error: message, generationId: gen.id });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
