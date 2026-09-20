-- 149: When a profile's city is unknown, hold recall on its region / country instead.
--
-- 148 let an unknown city pass the plan filter. Right for a profile with no location
-- at all, wrong for one that says "Texas, United States": the city is unknown but the
-- state is not, and Texas is not New York. Mirrors the same fallback in
-- outsidePlanReason(): city when known → region when known → country when known;
-- only a level that is genuinely unknown passes.

DROP FUNCTION IF EXISTS match_pool_profiles(vector(768), int, uuid[], boolean, text, numeric, numeric);

CREATE OR REPLACE FUNCTION match_pool_profiles(
  query_embedding   vector(768),
  match_count       int,
  exclude_ids       uuid[]  DEFAULT '{}',
  only_reachable    boolean DEFAULT false,
  plan_city         text    DEFAULT NULL,   -- canonical city (location_city); NULL = any
  plan_min_years    numeric DEFAULT NULL,   -- years band, applied with ±1 slack; NULL = open
  plan_max_years    numeric DEFAULT NULL,
  plan_region       text    DEFAULT NULL,   -- the plan city's state/province, for city-less profiles
  plan_country_code text    DEFAULT NULL    -- the plan city's ISO country, for region-less profiles
)
RETURNS TABLE (id uuid, distance float)
LANGUAGE sql STABLE AS $$
  SELECT p.id, (p.embedding <=> query_embedding) AS distance
  FROM pool_profiles p
  WHERE p.embedding IS NOT NULL
    AND NOT (p.id = ANY(exclude_ids))
    AND (NOT only_reachable OR p.reachable)
    AND (
      plan_city IS NULL
      OR p.location_city = plan_city
      OR (
        p.location_city IS NULL
        AND (plan_region       IS NULL OR p.location_region       IS NULL OR p.location_region       = plan_region)
        AND (plan_country_code IS NULL OR p.location_country_code IS NULL OR p.location_country_code = plan_country_code)
      )
    )
    AND (plan_min_years IS NULL OR p.experience_years IS NULL OR p.experience_years >= plan_min_years - 1)
    AND (plan_max_years IS NULL OR p.experience_years IS NULL OR p.experience_years <= plan_max_years + 1)
  ORDER BY p.embedding <=> query_embedding
  LIMIT match_count;
$$;
