-- 148: Hold semantic recall to the plan BEFORE taking the nearest N.
--
-- Until now match_pool_profiles returned the N nearest profiles by embedding and the
-- plan (city / years band) was applied only afterwards, so a wrong-city person could
-- take one of the N slots. This adds optional filters with the SAME tolerance as
-- outsidePlanReason() in src/modules/pool/domain/pool-sourcing.ts: an unknown city or
-- years still passes (can't be judged), and the years band has one year of slack.
-- All new parameters default to NULL, so existing callers are unchanged.
--
-- Postgres treats a different parameter list as a new overload, so the old signature
-- is dropped first rather than left behind as an ambiguous twin.

DROP FUNCTION IF EXISTS match_pool_profiles(vector(768), int, uuid[], boolean);

CREATE OR REPLACE FUNCTION match_pool_profiles(
  query_embedding vector(768),
  match_count     int,
  exclude_ids     uuid[]  DEFAULT '{}',
  only_reachable  boolean DEFAULT false,
  plan_city       text    DEFAULT NULL,   -- canonical city (location_city); NULL = any
  plan_min_years  numeric DEFAULT NULL,   -- years band, applied with ±1 slack; NULL = open
  plan_max_years  numeric DEFAULT NULL
)
RETURNS TABLE (id uuid, distance float)
LANGUAGE sql STABLE AS $$
  SELECT p.id, (p.embedding <=> query_embedding) AS distance
  FROM pool_profiles p
  WHERE p.embedding IS NOT NULL
    AND NOT (p.id = ANY(exclude_ids))
    AND (NOT only_reachable OR p.reachable)
    AND (plan_city      IS NULL OR p.location_city    IS NULL OR p.location_city = plan_city)
    AND (plan_min_years IS NULL OR p.experience_years IS NULL OR p.experience_years >= plan_min_years - 1)
    AND (plan_max_years IS NULL OR p.experience_years IS NULL OR p.experience_years <= plan_max_years + 1)
  ORDER BY p.embedding <=> query_embedding
  LIMIT match_count;
$$;
