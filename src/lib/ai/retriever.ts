import { classifyQuery, type QueryTarget } from "@/lib/ai/query-router";
import { embedText } from "@/lib/ai/embedding";
import { searchKnowledge, type ChunkResult } from "@/lib/ai/vector-search";
import { rerankChunks } from "@/lib/ai/reranker";
import { generateResponse } from "@/lib/ai/llm-client";

const GENERAL_TOP_K = 15;
const PRODUCT_TOP_K = 15;
const RERANK_CONFIDENCE_THRESHOLD = 0.6;

export interface RetrievalParams {
  query: string;
  tenantId: string;
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
  const { query, tenantId } = params;
  const queryTarget = classifyQuery(query);

  const queryEmbedding = await embedText(query);
  const pass1Chunks = await searchTargets(queryEmbedding, query, tenantId, queryTarget);
  const pass1Reranked = await rerankChunks(query, pass1Chunks);

  if (pass1Reranked.length > 0 && pass1Reranked[0].similarity >= RERANK_CONFIDENCE_THRESHOLD) {
    return { status: "success", chunks: pass1Reranked, queryTarget, retrievalPass: 1 };
  }

  // Pass 2: LLM-assisted query expansion
  const expanded = await expandQuery(query);
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
