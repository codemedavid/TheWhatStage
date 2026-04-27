import { classifyQuery, type QueryTarget } from "@/lib/ai/query-router";
import { embedText } from "@/lib/ai/embedding";
import { searchKnowledge, type ChunkResult } from "@/lib/ai/vector-search";
import { rerankChunks } from "@/lib/ai/reranker";
import { generateResponse } from "@/lib/ai/llm-client";

const GENERAL_TOP_K = 15;
const PRODUCT_TOP_K = 15;
// Lowered from 0.6 — short Taglish queries against English-leaning KB content
// score 0.4–0.55 even when the chunk is genuinely relevant. Higher threshold
// was dropping useful pass-1 results, forcing a wasted pass-2 expansion.
const RERANK_CONFIDENCE_THRESHOLD = 0.45;

export interface RetrievalCampaignContext {
  name: string;
  description: string | null;
  goal: string;
}

export interface RetrievalContext {
  businessName?: string;
  businessType?: string;
  currentPhaseName?: string;
  recentMessages?: string[];
  campaign?: RetrievalCampaignContext;
}

export interface RetrievalParams {
  query: string;
  tenantId: string;
  context?: RetrievalContext;
}

export interface RetrievalResult {
  status: "success" | "low_confidence" | "no_results";
  chunks: ChunkResult[];
  queryTarget: QueryTarget;
  retrievalPass: 1 | 2;
}

export async function retrieveKnowledge(
  params: RetrievalParams
): Promise<RetrievalResult> {
  const { query, tenantId, context } = params;
  const queryTarget = classifyQuery(query);
  const searchQuery = buildSearchQuery(query, context);

  const queryEmbedding = await embedText(searchQuery);
  const pass1Chunks = await searchTargets(queryEmbedding, searchQuery, tenantId, queryTarget);
  const pass1Reranked = await rerankChunks(query, pass1Chunks);

  if (pass1Reranked.length > 0 && pass1Reranked[0].similarity >= RERANK_CONFIDENCE_THRESHOLD) {
    return { status: "success", chunks: pass1Reranked, queryTarget, retrievalPass: 1 };
  }

  // Pass 2: LLM-assisted query expansion
  const expanded = await expandQuery(searchQuery);
  if (expanded) {
    const expandedEmbedding = await embedText(expanded);
    const pass2Chunks = await searchTargets(expandedEmbedding, expanded, tenantId, queryTarget);
    const pass2Reranked = await rerankChunks(query, pass2Chunks);

    // Merge Pass 1 + Pass 2, deduplicate by chunk id, re-sort
    const merged = deduplicateAndSort([...pass1Reranked, ...pass2Reranked]);

    if (merged.length > 0) {
      return { status: "success", chunks: merged, queryTarget, retrievalPass: 2 };
    }
  }

  const allEmpty = pass1Chunks.length === 0;
  return {
    status: allEmpty ? "no_results" : "low_confidence",
    chunks: [],
    queryTarget,
    retrievalPass: 2,
  };
}

// Always enrich the embedding query with campaign + business + recent context.
// Previously gated by `isVagueHighIntentQuery`, which meant short Taglish
// messages like "uy" or "magkano?" were embedded raw — useless for vector
// search against a Whatstage-specific KB. Enriching always produces stronger
// recall for the cost of one extra string concat.
function buildSearchQuery(query: string, context?: RetrievalContext): string {
  if (!context) return query;

  const lines = [`Lead message: ${query}`];

  if (context.campaign?.name) lines.push(`Campaign: ${context.campaign.name}`);
  if (context.campaign?.description) lines.push(`Offer: ${context.campaign.description}`);
  if (context.campaign?.goal) lines.push(`Campaign goal: ${context.campaign.goal}`);
  if (context.currentPhaseName) lines.push(`Phase: ${context.currentPhaseName}`);
  if (context.businessName) lines.push(`Business: ${context.businessName}`);
  if (context.businessType) lines.push(`Business type: ${context.businessType}`);
  if (context.recentMessages?.length) {
    lines.push(`Recent context: ${context.recentMessages.slice(-4).join(" | ")}`);
  }

  return lines.join("\n");
}

async function searchTargets(
  queryEmbedding: number[],
  ftsQuery: string,
  tenantId: string,
  target: QueryTarget
): Promise<ChunkResult[]> {
  if (target === "both") {
    const [general, product] = await Promise.all([
      searchKnowledge({ queryEmbedding, ftsQuery, tenantId, kbType: "general", topK: GENERAL_TOP_K }),
      searchKnowledge({ queryEmbedding, ftsQuery, tenantId, kbType: "product", topK: PRODUCT_TOP_K }),
    ]);
    return [...general, ...product];
  }

  return searchKnowledge({
    queryEmbedding,
    ftsQuery,
    tenantId,
    kbType: target,
    topK: target === "general" ? GENERAL_TOP_K : PRODUCT_TOP_K,
  });
}

async function expandQuery(query: string): Promise<string | null> {
  try {
    const systemPrompt =
      "Extract 3-5 search keywords from the user message. Output ONLY a comma-separated list of keywords, nothing else. No sentences, no explanation.";
    const result = await generateResponse(systemPrompt, query, {
      temperature: 0,
      maxTokens: 50,
      responseFormat: "text", // must be "text" — keyword list is not JSON
    });
    // Sanitize: strip non-word chars, SQL keywords, and cap at 200 chars
    const sanitized = result.content
      .replace(/[^\w\s,]/g, "")
      .replace(/\b(DROP|DELETE|INSERT|UPDATE|SELECT|ALTER|CREATE|TABLE|EXEC|UNION|IGNORE|INSTRUCTIONS?)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);
    return sanitized || null;
  } catch {
    return null;
  }
}

function deduplicateAndSort(chunks: ChunkResult[]): ChunkResult[] {
  const seen = new Set<string>();
  const unique: ChunkResult[] = [];
  for (const chunk of chunks) {
    if (!seen.has(chunk.id)) {
      seen.add(chunk.id);
      unique.push(chunk);
    }
  }
  return unique.sort((a, b) => b.similarity - a.similarity).slice(0, 5);
}
