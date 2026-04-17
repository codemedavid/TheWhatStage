import { createServiceClient } from "@/lib/supabase/service";

export interface ChunkResult {
  id: string;
  content: string;
  similarity: number;
  metadata: Record<string, unknown>;
}

export interface SearchParams {
  queryEmbedding: number[];
  tenantId: string;
  kbType: "general" | "product";
  topK?: number;
  similarityThreshold?: number;
}

/**
 * Search knowledge_chunks by cosine similarity using the
 * match_knowledge_chunks Supabase RPC function.
 */
export async function searchKnowledge({
  queryEmbedding,
  tenantId,
  kbType,
  topK = 5,
  similarityThreshold = 0.3,
}: SearchParams): Promise<ChunkResult[]> {
  const supabase = createServiceClient();

  const { data, error } = await supabase.rpc("match_knowledge_chunks", {
    query_embedding: queryEmbedding,
    p_tenant_id: tenantId,
    p_kb_type: kbType,
    p_top_k: topK,
    p_similarity_threshold: similarityThreshold,
  });

  if (error) {
    throw new Error(`Vector search failed: ${error.message}`);
  }

  return data ?? [];
}
