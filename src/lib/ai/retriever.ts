import { classifyQuery, type QueryTarget } from "@/lib/ai/query-router";
import { reformulateQuery } from "@/lib/ai/query-reformulator";
import { embedText } from "@/lib/ai/embedding";
import { searchKnowledge, type ChunkResult } from "@/lib/ai/vector-search";

const SIMILARITY_THRESHOLD = 0.3;
const GENERAL_TOP_K = 5;
const PRODUCT_TOP_K = 3;

export interface RetrievalParams {
  query: string;
  tenantId: string;
}

export interface RetrievalResult {
  status: "success" | "low_confidence" | "no_results";
  chunks: ChunkResult[];
  queryTarget: QueryTarget;
}

export async function retrieveKnowledge(
  params: RetrievalParams
): Promise<RetrievalResult> {
  const { query, tenantId } = params;
  const queryTarget = classifyQuery(query);

  const queryEmbedding = await embedText(query);
  let chunks = await searchTargets(queryEmbedding, tenantId, queryTarget);

  const strong = chunks.filter((c) => c.similarity >= SIMILARITY_THRESHOLD);

  if (strong.length > 0) {
    return {
      status: "success",
      chunks: strong.sort((a, b) => b.similarity - a.similarity),
      queryTarget,
    };
  }

  // Reformulate and retry once
  const simplified = reformulateQuery(query);
  if (simplified && simplified !== query.toLowerCase().trim()) {
    const retryEmbedding = await embedText(simplified);
    chunks = await searchTargets(retryEmbedding, tenantId, queryTarget);
    const retryStrong = chunks.filter((c) => c.similarity >= SIMILARITY_THRESHOLD);

    if (retryStrong.length > 0) {
      return {
        status: "success",
        chunks: retryStrong.sort((a, b) => b.similarity - a.similarity),
        queryTarget,
      };
    }
  }

  return {
    status: chunks.length === 0 ? "no_results" : "low_confidence",
    chunks: [],
    queryTarget,
  };
}

async function searchTargets(
  queryEmbedding: number[],
  tenantId: string,
  target: QueryTarget
): Promise<ChunkResult[]> {
  if (target === "both") {
    const [general, product] = await Promise.all([
      searchKnowledge({
        queryEmbedding,
        tenantId,
        kbType: "general",
        topK: GENERAL_TOP_K,
      }),
      searchKnowledge({
        queryEmbedding,
        tenantId,
        kbType: "product",
        topK: PRODUCT_TOP_K,
      }),
    ]);
    return [...general, ...product];
  }

  return searchKnowledge({
    queryEmbedding,
    tenantId,
    kbType: target,
    topK: target === "general" ? GENERAL_TOP_K : PRODUCT_TOP_K,
  });
}
