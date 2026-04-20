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

  // 3. Load generation record (use service client)
  const service = createServiceClient();
  const { data: gen, error: genErr } = await service
    .from("onboarding_generations")
    .select("*")
    .eq("id", parsed.data.generationId)
    .eq("user_id", user.id)
    .single();

  if (genErr || !gen) return Response.json({ error: "Generation not found" }, { status: 404 });
  if (gen.status !== "failed") return Response.json({ error: "Can only retry failed generations" }, { status: 400 });

  // 4. Mark as running again
  await service
    .from("onboarding_generations")
    .update({ status: "running", error: null, updated_at: new Date().toISOString() })
    .eq("id", gen.id);

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
        // Check if tenant_id is already set (from a previous partial run)
        if (!gen.tenant_id) {
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
        send({ step: "complete", status: "done", data: { preview } });
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
