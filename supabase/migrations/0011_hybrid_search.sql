-- supabase/migrations/0011_hybrid_search.sql

-- Enable trigram extension (for future use)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add generated tsvector column for full-text search
ALTER TABLE knowledge_chunks
  ADD COLUMN IF NOT EXISTS fts tsvector
    GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

-- GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS knowledge_chunks_fts_idx
  ON knowledge_chunks USING GIN (fts);

-- Hybrid search function using Reciprocal Rank Fusion
CREATE OR REPLACE FUNCTION match_knowledge_chunks_hybrid(
  query_embedding vector(1024),
  fts_query       text,
  p_tenant_id     uuid,
  p_kb_type       text,
  p_top_k         int DEFAULT 5
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
  vector_k int := 15;
  fts_k    int := 15;
BEGIN
  RETURN QUERY
  WITH vector_results AS (
    SELECT
      kc.id,
      kc.content,
      kc.metadata,
      ROW_NUMBER() OVER (ORDER BY kc.embedding <#> query_embedding) AS vec_rank
    FROM knowledge_chunks kc
    WHERE kc.tenant_id = p_tenant_id
      AND kc.kb_type   = p_kb_type
      AND kc.embedding IS NOT NULL
    ORDER BY kc.embedding <#> query_embedding
    LIMIT vector_k
  ),
  fts_results AS (
    SELECT
      kc.id,
      kc.content,
      kc.metadata,
      ROW_NUMBER() OVER (
        ORDER BY ts_rank(kc.fts, plainto_tsquery('english', fts_query)) DESC
      ) AS fts_rank
    FROM knowledge_chunks kc
    WHERE kc.tenant_id = p_tenant_id
      AND kc.kb_type   = p_kb_type
      AND kc.fts @@ plainto_tsquery('english', fts_query)
    ORDER BY ts_rank(kc.fts, plainto_tsquery('english', fts_query)) DESC
    LIMIT fts_k
  ),
  combined AS (
    SELECT
      COALESCE(v.id, f.id)           AS id,
      COALESCE(v.content, f.content) AS content,
      COALESCE(v.metadata, f.metadata) AS metadata,
      COALESCE(1.0 / (60.0 + v.vec_rank), 0.0)
        + COALESCE(1.0 / (60.0 + f.fts_rank), 0.0) AS rrf_score
    FROM vector_results v
    FULL OUTER JOIN fts_results f ON v.id = f.id
  )
  SELECT
    c.id,
    c.content,
    c.rrf_score::float AS similarity,
    c.metadata
  FROM combined c
  ORDER BY c.rrf_score DESC
  LIMIT p_top_k;
END;
$$;
