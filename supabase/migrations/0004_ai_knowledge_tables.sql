-- =============================================================
-- AI Knowledge & Conversation Phase Tables
-- =============================================================

-- Enable pgvector extension for embedding storage
create extension if not exists vector;

-- =============================================================
-- BOT FLOW PHASES
-- =============================================================

create table bot_flow_phases (
  id                uuid primary key default uuid_generate_v4(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  name              text not null,
  order_index       integer not null default 0,
  max_messages      integer not null default 3,
  system_prompt     text not null,
  tone              text default 'friendly and helpful',
  goals             text,
  transition_hint   text,
  action_button_ids uuid[],
  created_at        timestamptz not null default now()
);

create index on bot_flow_phases (tenant_id);

-- =============================================================
-- KNOWLEDGE DOCS
-- =============================================================

create table knowledge_docs (
  id          uuid primary key default uuid_generate_v4(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  title       text not null,
  type        text not null check (type in ('pdf', 'docx', 'xlsx', 'faq', 'richtext', 'product')),
  content     text,
  file_url    text,
  status      text not null default 'processing' check (status in ('processing', 'ready', 'error')),
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create index on knowledge_docs (tenant_id);

-- =============================================================
-- KNOWLEDGE CHUNKS
-- =============================================================

create table knowledge_chunks (
  id          uuid primary key default uuid_generate_v4(),
  doc_id      uuid not null references knowledge_docs(id) on delete cascade,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  content     text not null,
  kb_type     text not null check (kb_type in ('general', 'product')),
  embedding   vector(1536),
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

-- HNSW index for fast cosine similarity search
-- HNSW tuned for 1536-dim vectors: higher m and ef_construction improve recall
create index on knowledge_chunks using hnsw (embedding vector_cosine_ops)
  with (m = 24, ef_construction = 128);
create index on knowledge_chunks (tenant_id, kb_type);

-- =============================================================
-- KNOWLEDGE IMAGES
-- =============================================================

create table knowledge_images (
  id            uuid primary key default uuid_generate_v4(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  url           text not null,
  description   text not null,
  tags          text[] not null default '{}',
  context_hint  text,
  created_at    timestamptz not null default now()
);

create index on knowledge_images (tenant_id);

-- =============================================================
-- CONVERSATION PHASES
-- =============================================================

create table conversation_phases (
  id                uuid primary key default uuid_generate_v4(),
  conversation_id   uuid not null references conversations(id) on delete cascade,
  phase_id          uuid not null references bot_flow_phases(id) on delete cascade,
  entered_at        timestamptz not null default now(),
  message_count     integer not null default 0
);

create index on conversation_phases (conversation_id);

-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================

alter table bot_flow_phases enable row level security;
create policy "bot_flow_phases_all" on bot_flow_phases for all
  using (tenant_id = current_tenant_id());

alter table knowledge_docs enable row level security;
create policy "knowledge_docs_all" on knowledge_docs for all
  using (tenant_id = current_tenant_id());

alter table knowledge_chunks enable row level security;
create policy "knowledge_chunks_all" on knowledge_chunks for all
  using (tenant_id = current_tenant_id());

alter table knowledge_images enable row level security;
create policy "knowledge_images_all" on knowledge_images for all
  using (tenant_id = current_tenant_id());

alter table conversation_phases enable row level security;
create policy "conversation_phases_all" on conversation_phases for all
  using (
    conversation_id in (
      select id from conversations where tenant_id = current_tenant_id()
    )
  );

-- =============================================================
-- VECTOR SEARCH RPC
-- =============================================================

create or replace function match_knowledge_chunks(
  query_embedding     vector(1536),
  p_tenant_id         uuid,
  p_kb_type           text,
  p_top_k             integer default 5,
  p_similarity_threshold float default 0.3
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
  -- Defense in depth: verify caller has access to this tenant
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
