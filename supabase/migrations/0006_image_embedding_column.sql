-- Phase 5: Image embedding support + tenant image config

-- 1. Add embedding column to knowledge_images
alter table knowledge_images
  add column embedding vector(1536);

-- 2. HNSW index for fast cosine similarity search on image embeddings
create index knowledge_images_embedding_idx
  on knowledge_images
  using hnsw (embedding vector_cosine_ops)
  with (m = 24, ef_construction = 128);

-- 3. Tenant-level max images per response config
alter table tenants
  add column max_images_per_response integer not null default 2
  constraint max_images_per_response_check check (max_images_per_response between 1 and 5);

-- 4. RPC function: semantic search over pre-filtered image candidates
create or replace function match_knowledge_images(
  query_embedding        vector(1536),
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
