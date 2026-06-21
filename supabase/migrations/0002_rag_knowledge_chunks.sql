-- RAG knowledge store: chunked Reference_Data with pgvector embeddings.
-- Run after 0001_init_mariposa_schema.sql. Seed via: npm run seed:knowledge

create extension if not exists vector;

create table if not exists knowledge_chunks (
  id           uuid primary key default gen_random_uuid(),
  source_file  text not null,
  section      text not null default '',
  content      text not null,
  topic        text not null,
  embedding    vector(384),
  created_at   timestamptz not null default now(),
  unique (source_file, section)
);

create index if not exists knowledge_chunks_topic_idx
  on knowledge_chunks (topic);

create index if not exists knowledge_chunks_embedding_idx
  on knowledge_chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 8);

-- Similarity search with optional topic filter.
create or replace function match_knowledge(
  query_embedding vector(384),
  match_count int default 8,
  filter_topics text[] default null,
  min_similarity float default 0.15
)
returns table (
  id uuid,
  source_file text,
  section text,
  content text,
  topic text,
  similarity float
)
language sql stable
as $$
  select
    kc.id,
    kc.source_file,
    kc.section,
    kc.content,
    kc.topic,
    1 - (kc.embedding <=> query_embedding) as similarity
  from knowledge_chunks kc
  where kc.embedding is not null
    and (filter_topics is null or kc.topic = any(filter_topics))
    and 1 - (kc.embedding <=> query_embedding) >= min_similarity
  order by kc.embedding <=> query_embedding
  limit match_count;
$$;
