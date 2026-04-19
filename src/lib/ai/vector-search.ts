import { createServiceClient } from "@/lib/supabase/service";

export interface ChunkResult {
  id: string;
  content: string;
  similarity: number;
  metadata: Record<string, unknown>;
}

export interface SearchParams {
  queryEmbedding: number[];
  ftsQuery: string;
  tenantId: string;
  kbType: "general" | "product";
  topK?: number;
}

const SIMILARITY_THRESHOLD = 0.45;

export async function searchKnowledge({
  queryEmbedding,
  ftsQuery,
  tenantId,
  kbType,
  topK = 15,
}: SearchParams): Promise<ChunkResult[]> {
  const supabase = createServiceClient();

  const { data, error } = await supabase.rpc("match_knowledge_chunks_hybrid", {
    query_embedding: queryEmbedding,
    fts_query: ftsQuery,
    p_tenant_id: tenantId,
    p_kb_type: kbType,
    p_top_k: topK,
  });

  if (error) {
    throw new Error(`Vector search failed: ${error.message}`);
  }

  return (data ?? []).filter((c: ChunkResult) => c.similarity >= SIMILARITY_THRESHOLD);
}
