-- Resize embedding columns: 1536 → 1024 dims (BAAI/bge-large-en-v1.5)
-- HNSW indexes must be dropped before altering vector column dimensions.

-- 1. Drop HNSW indexes
drop index if exists knowledge_chunks_embedding_idx;
drop index if exists knowledge_images_embedding_idx;

-- Auto-named index from migration 0004 (postgres names it based on table+column)
drop index if exists knowledge_chunks_embedding_idx1;

-- 2. Null out existing embeddings (1536-dim vectors can't be cast to 1024)
update knowledge_chunks set embedding = null;
update knowledge_images set embedding = null;

-- 3. Alter column dimensions
alter table knowledge_chunks alter column embedding type vector(1024);
alter table knowledge_images  alter column embedding type vector(1024);

-- 4. Recreate HNSW indexes for 1024-dim vectors
create index knowledge_chunks_embedding_idx
  on knowledge_chunks using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

create index knowledge_images_embedding_idx
  on knowledge_images using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- 5. Replace RPC functions with 1024-dim signatures

create or replace function match_knowledge_chunks(
  query_embedding         vector(1024),
  p_tenant_id             uuid,
  p_kb_type               text,
  p_top_k                 integer default 5,
  p_similarity_threshold  float default 0.3
)
returns table(
  id          uuid,
  content     text,
  similarity  float,
  metadata    jsonb
)
language plpgsql
stable
security definer
as $$
begin
  if p_tenant_id <> current_tenant_id() then
    raise exception 'unauthorized tenant access'
      using errcode = 'P0001';
  end if;

  return query
    select
      kc.id,
      kc.content,
      1 - (kc.embedding <=> query_embedding) as similarity,
      kc.metadata
    from knowledge_chunks kc
    where kc.tenant_id = p_tenant_id
      and kc.kb_type = p_kb_type
      and kc.embedding is not null
      and 1 - (kc.embedding <=> query_embedding) >= p_similarity_threshold
    order by kc.embedding <=> query_embedding
    limit p_top_k;
end;
$$;

create or replace function match_knowledge_images(
  query_embedding        vector(1024),
  p_tenant_id            uuid,
  p_candidate_ids        uuid[],
  p_top_k                integer default 3,
  p_similarity_threshold float default 0.3
)
returns table(
  id           uuid,
  url          text,
  description  text,
  context_hint text,
  similarity   float
)
language sql stable
as $$
  select
    ki.id,
    ki.url,
    ki.description,
    ki.context_hint,
    1 - (ki.embedding <=> query_embedding) as similarity
  from knowledge_images ki
  where ki.tenant_id = p_tenant_id
    and ki.id = any(p_candidate_ids)
    and ki.embedding is not null
    and 1 - (ki.embedding <=> query_embedding) >= p_similarity_threshold
  order by ki.embedding <=> query_embedding
  limit p_top_k;
$$;
