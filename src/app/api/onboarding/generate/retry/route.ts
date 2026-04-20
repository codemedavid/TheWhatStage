// src/app/api/onboarding/generate/retry/route.ts
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { persistResults } from "@/lib/onboarding/persist";
import { runGenerationPipeline } from "@/lib/onboarding/generator";
import type { Json } from "@/types/database";
import type { SSEMessage, PreviewData, GenerationInput, GenerationResults, Checkpoint } from "@/lib/onboarding/generation-types";

const retrySchema = z.object({
  generationId: z.string().uuid(),
});

export async function POST(req: Request) {
  // 1. Authenticate
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return new Response("Unauthorized", { status: 401 });

  // 2. Validate
  const body = await req.json();
  const parsed = retrySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 });

  // 3. Atomic status transition: only succeeds if status is currently 'failed'
  const service = createServiceClient();
  const { data: updated, error: transitionErr } = await service
    .from("onboarding_generations")
    .update({ status: "running", error: null, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.generationId)
    .eq("user_id", user.id)
    .eq("status", "failed")
    .select("*");

  if (transitionErr || !updated || updated.length === 0) {
    return Response.json({ error: "Generation not found or not in failed state" }, { status: 409 });
  }
  const gen = updated[0];

  // 5. SSE stream — resume from checkpoint
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(msg: SSEMessage) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`));
      }

      try {
        const genInput = gen.input as unknown as GenerationInput;
        const resumeFrom = gen.checkpoint
          ? { checkpoint: gen.checkpoint as Checkpoint, results: gen.results as unknown as GenerationResults }
          : null;

        const results = await runGenerationPipeline(
          genInput,
          resumeFrom,
          (step, currentResults) => {
            void service
              .from("onboarding_generations")
              .update({ checkpoint: step, results: currentResults as unknown as Json, updated_at: new Date().toISOString() })
              .eq("id", gen.id);
            send({ step, status: "done" });
          }
        );

        // Persist — only if tenant hasn't been created yet
        // Re-fetch to get latest tenant_id (guards against double-persist on concurrent retries)
        const { data: freshGen } = await service
          .from("onboarding_generations")
          .select("tenant_id")
          .eq("id", parsed.data.generationId)
          .single();

        if (!freshGen?.tenant_id) {
          await persistResults(user.id, genInput, results, gen.id, service);
        }
        send({ step: "persisted", status: "done" });

        // Mark complete
        await service
          .from("onboarding_generations")
          .update({
            status: "completed",
            checkpoint: "persisted",
            results: results as unknown as Json,
            updated_at: new Date().toISOString(),
          })
          .eq("id", gen.id);

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
