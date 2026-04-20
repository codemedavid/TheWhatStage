// src/lib/onboarding/generator.ts
import { z } from "zod";
import { generateResponse } from "@/lib/ai/llm-client";
import { embedText, embedBatch } from "@/lib/ai/embedding";
import { buildContext } from "./build-context";
import {
  buildCampaignPrompt,
  buildPhasePromptPrompt,
  buildFaqPrompt,
  buildGeneralArticlePrompt,
  buildUrlArticlePrompt,
} from "./prompts";
import { scrapeUrl } from "./scraper";
import type {
  GenerationInput,
  GenerationResults,
  GeneratedCampaign,
  GeneratedPhaseOutline,
  GeneratedPhase,
  GeneratedFaq,
  Checkpoint,
  BusinessContext,
} from "./generation-types";

// Zod schemas for validating LLM JSON output
const campaignResponseSchema = z.object({
  campaign: z.object({
    name: z.string(),
    description: z.string(),
    goal: z.enum(["form_submit", "appointment_booked", "purchase", "stage_reached"]),
    follow_up_message: z.string(),
  }),
  phases: z.array(
    z.object({
      name: z.string(),
      order: z.number(),
      max_messages: z.number().min(1).max(10),
      goals: z.string(),
      transition_hint: z.string(),
      tone: z.string(),
    })
  ),
});

const faqResponseSchema = z.object({
  faqs: z.array(
    z.object({
      question: z.string(),
      answer: z.string(),
    })
  ),
});

interface ResumeState {
  checkpoint: Checkpoint;
  results: GenerationResults;
}

type ProgressCallback = (step: Checkpoint, currentResults: GenerationResults) => void;

const CHECKPOINT_ORDER: Checkpoint[] = ["context", "campaign", "parallel", "embeddings", "persisted"];

function shouldSkip(checkpoint: Checkpoint | null, step: Checkpoint): boolean {
  if (!checkpoint) return false;
  return CHECKPOINT_ORDER.indexOf(checkpoint) >= CHECKPOINT_ORDER.indexOf(step);
}

export async function runGenerationPipeline(
  input: GenerationInput,
  resumeFrom: ResumeState | null,
  onProgress: ProgressCallback
): Promise<GenerationResults> {
  const results: GenerationResults = resumeFrom?.results ?? {};
  const lastCheckpoint = resumeFrom?.checkpoint ?? null;

  // Step 1: Build context
  if (!shouldSkip(lastCheckpoint, "context")) {
    results.context = buildContext(input);
    onProgress("context", results);
  }
  const ctx = results.context!;

  // Step 2: Generate campaign + phase outlines
  if (!shouldSkip(lastCheckpoint, "campaign")) {
    const { campaign, phaseOutlines } = await generateCampaign(ctx);
    results.campaign = campaign;
    results.phaseOutlines = phaseOutlines;
    onProgress("campaign", results);
  }

  // Step 3: Parallel — prompts + knowledge
  if (!shouldSkip(lastCheckpoint, "parallel")) {
    // Guard: phaseOutlines must exist before parallel step
    if (!results.phaseOutlines) {
      throw new Error(
        "Checkpoint 'campaign' reached but phaseOutlines is missing from resume state"
      );
    }

    const parallelTasks: Promise<void>[] = [];

    // 3a: Phase prompts
    parallelTasks.push(
      generatePhasePrompts(ctx, results.phaseOutlines!).then((phases) => {
        results.phases = phases;
      })
    );

    // 3b: FAQs
    parallelTasks.push(
      generateFaqs(ctx).then((faqs) => {
        results.faqs = faqs;
      })
    );

    // 3c: General article
    parallelTasks.push(
      generateGeneralArticle(ctx).then((article) => {
        results.generalArticle = article;
      })
    );

    // 3d: URL scrape + article (conditional)
    if (input.websiteUrl) {
      parallelTasks.push(
        generateUrlArticle(ctx, input.websiteUrl).then(({ article, scraped }) => {
          results.urlArticle = article ?? undefined;
          results.scrapedContent = scraped ?? undefined;
        })
      );
    }

    await Promise.all(parallelTasks);
    onProgress("parallel", results);
  }

  // Step 4: Embed knowledge
  if (!shouldSkip(lastCheckpoint, "embeddings")) {
    results.embeddings = await embedKnowledge(results);
    onProgress("embeddings", results);
  }

  return results;
}

async function generateCampaign(
  ctx: BusinessContext
): Promise<{ campaign: GeneratedCampaign; phaseOutlines: GeneratedPhaseOutline[] }> {
  const { systemPrompt, userMessage } = buildCampaignPrompt(ctx);
  const response = await generateResponse(systemPrompt, userMessage, {
    maxTokens: 512,
    responseFormat: "json_object",
  });

  const parsed = campaignResponseSchema.parse(JSON.parse(response.content));
  return { campaign: parsed.campaign, phaseOutlines: parsed.phases };
}

async function generatePhasePrompts(
  ctx: BusinessContext,
  outlines: GeneratedPhaseOutline[]
): Promise<GeneratedPhase[]> {
  const prompts = outlines.map(async (outline) => {
    const { systemPrompt, userMessage } = buildPhasePromptPrompt(ctx, outline);
    const response = await generateResponse(systemPrompt, userMessage, {
      maxTokens: 768,
    });
    return { ...outline, system_prompt: response.content };
  });

  return Promise.all(prompts);
}

async function generateFaqs(ctx: BusinessContext): Promise<GeneratedFaq[]> {
  const { systemPrompt, userMessage } = buildFaqPrompt(ctx);
  const response = await generateResponse(systemPrompt, userMessage, {
    maxTokens: 1024,
    responseFormat: "json_object",
  });

  const parsed = faqResponseSchema.parse(JSON.parse(response.content));
  return parsed.faqs;
}

async function generateGeneralArticle(ctx: BusinessContext): Promise<string> {
  const { systemPrompt, userMessage } = buildGeneralArticlePrompt(ctx);
  const response = await generateResponse(systemPrompt, userMessage, {
    maxTokens: 1024,
  });
  return response.content;
}

async function generateUrlArticle(
  ctx: BusinessContext,
  url: string
): Promise<{ article: string | null; scraped: string | null }> {
  const scraped = await scrapeUrl(url);
  if (!scraped) return { article: null, scraped: null };

  const { systemPrompt, userMessage } = buildUrlArticlePrompt(ctx, scraped);
  const response = await generateResponse(systemPrompt, userMessage, {
    maxTokens: 1024,
  });
  return { article: response.content, scraped };
}

async function embedKnowledge(
  results: GenerationResults
): Promise<GenerationResults["embeddings"]> {
  const faqTexts = (results.faqs ?? []).map(
    (f) => `Q: ${f.question}\nA: ${f.answer}`
  );

  const [faqEmbeddings, generalArticleEmbedding, urlArticleEmbedding] =
    await Promise.all([
      faqTexts.length > 0 ? embedBatch(faqTexts) : Promise.resolve([]),
      results.generalArticle
        ? embedText(results.generalArticle)
        : Promise.resolve([]),
      results.urlArticle
        ? embedText(results.urlArticle)
        : Promise.resolve(undefined),
    ]);

  return { faqEmbeddings, generalArticleEmbedding, urlArticleEmbedding };
}
