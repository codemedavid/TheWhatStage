-- supabase/migrations/0028_rag_metadata_and_iterative_scan.sql

-- 1. Iterative scan defaults for filtered HNSW queries (pgvector 0.8+).
ALTER DATABASE postgres SET hnsw.iterative_scan = 'relaxed_order';
ALTER DATABASE postgres SET hnsw.max_scan_tuples = 40000;

-- 2. Add language column for filter pre-pass.
ALTER TABLE knowledge_chunks
  ADD COLUMN IF NOT EXISTS language text;

-- 3. Functional index on metadata.doc_title for source attribution lookups.
CREATE INDEX IF NOT EXISTS knowledge_chunks_doc_title_idx
  ON knowledge_chunks ((metadata->>'doc_title'));

-- 4. Composite index supporting (tenant_id, kb_type, language) pre-filter.
CREATE INDEX IF NOT EXISTS knowledge_chunks_tenant_kb_lang_idx
  ON knowledge_chunks (tenant_id, kb_type, language);

-- 5. Refresh hybrid RPC to accept an optional language filter.
CREATE OR REPLACE FUNCTION match_knowledge_chunks_hybrid(
  query_embedding vector(1024),
  fts_query       text,
  p_tenant_id     uuid,
  p_kb_type       text,
  p_top_k         int DEFAULT 5,
  p_language      text DEFAULT NULL
)
RETURNS TABLE (
  id         uuid,
  content    text,
  similarity float,
  metadata   jsonb
)
LANGUAGE plpgsql
AS $$
DECLARE
  vector_k int := 25;
  fts_k    int := 25;
BEGIN
  -- Session-local recall safety net for filtered HNSW.
  PERFORM set_config('hnsw.iterative_scan', 'relaxed_order', true);

  RETURN QUERY
  WITH vector_results AS (
    SELECT kc.id, kc.content, kc.metadata,
      ROW_NUMBER() OVER (ORDER BY kc.embedding <#> query_embedding) AS vec_rank
    FROM knowledge_chunks kc
    WHERE kc.tenant_id = p_tenant_id
      AND kc.kb_type   = p_kb_type
      AND kc.embedding IS NOT NULL
      AND (p_language IS NULL OR kc.language IS NULL OR kc.language = p_language)
    ORDER BY kc.embedding <#> query_embedding
    LIMIT vector_k
  ),
  fts_results AS (
    SELECT kc.id, kc.content, kc.metadata,
      ROW_NUMBER() OVER (
        ORDER BY ts_rank(kc.fts, plainto_tsquery('simple', fts_query)) DESC
      ) AS fts_rank
    FROM knowledge_chunks kc
    WHERE kc.tenant_id = p_tenant_id
      AND kc.kb_type   = p_kb_type
      AND kc.fts @@ plainto_tsquery('simple', fts_query)
    ORDER BY ts_rank(kc.fts, plainto_tsquery('simple', fts_query)) DESC
    LIMIT fts_k
  ),
  combined AS (
    SELECT
      COALESCE(v.id, f.id)             AS id,
      COALESCE(v.content, f.content)   AS content,
      COALESCE(v.metadata, f.metadata) AS metadata,
      COALESCE(1.0 / (60.0 + v.vec_rank), 0.0)
        + COALESCE(1.0 / (60.0 + f.fts_rank), 0.0) AS rrf_score
    FROM vector_results v
    FULL OUTER JOIN fts_results f ON v.id = f.id
  )
  SELECT c.id, c.content, c.rrf_score::float AS similarity, c.metadata
  FROM combined c
  ORDER BY c.rrf_score DESC
  LIMIT p_top_k;
END;
$$;
