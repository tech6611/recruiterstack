-- 108_candidate_embeddings.sql
-- Semantic recall (Component 05, Slice 5c). Enables pgvector, adds an embedding
-- to candidates, and a nearest-neighbour RPC used to shortlist candidates by
-- similarity to an ICP before the (expensive) Fit Engine — replacing the crude
-- keyword overlap at scale. Embeddings are Gemini text-embedding-004 (768-dim),
-- backfilled via POST /api/candidates/embed. Sourcing falls back to keyword
-- overlap when a candidate has no embedding, so this is additive and safe.
--
-- NOTE: enabling the `vector` extension may require running this as a privileged
-- role, or enabling "vector" under Database → Extensions in the Supabase dashboard.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE candidates ADD COLUMN IF NOT EXISTS embedding vector(768);

-- ivfflat cosine index; fine for modest pools (falls back to a scan when sparse).
CREATE INDEX IF NOT EXISTS idx_candidates_embedding
  ON candidates USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Nearest candidates to a query embedding within an org, excluding a set of ids
-- (e.g. already in the pipeline). Returns candidate id + cosine distance.
CREATE OR REPLACE FUNCTION match_candidates(
  query_embedding vector(768),
  match_org       text,
  match_count     int,
  exclude_ids     uuid[] DEFAULT '{}'
)
RETURNS TABLE (id uuid, distance float)
LANGUAGE sql STABLE AS $$
  SELECT c.id, (c.embedding <=> query_embedding) AS distance
  FROM candidates c
  WHERE c.org_id = match_org
    AND c.embedding IS NOT NULL
    AND NOT (c.id = ANY(exclude_ids))
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;
