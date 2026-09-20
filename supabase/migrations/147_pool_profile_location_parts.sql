-- 147: Store pool locations as separate city / region / country fields (the Ashby shape).
--
-- Until now the pool kept one normalised city name (location_city) next to the raw
-- string. Ashby stores a candidate's location as three independently optional
-- levels — city, region (state/province), country — which is what lets it filter
-- by country, group by region and infer a timezone. This adds those levels.
-- location_city and location_raw are unchanged; every column here is nullable and
-- filled by rebuildProfile (src/modules/pool/domain/rebuild.ts). Existing rows are
-- backfilled by scripts/backfill-pool-locations.ts.

ALTER TABLE pool_profiles
  ADD COLUMN IF NOT EXISTS location_region       text,   -- state / province, e.g. "Karnataka", "Texas"
  ADD COLUMN IF NOT EXISTS location_country      text,   -- display name, e.g. "India"
  ADD COLUMN IF NOT EXISTS location_country_code text;   -- ISO 3166-1 alpha-2, e.g. "IN"

CREATE INDEX IF NOT EXISTS idx_pool_profiles_country ON pool_profiles (location_country_code);
CREATE INDEX IF NOT EXISTS idx_pool_profiles_region  ON pool_profiles (location_country_code, location_region);

COMMENT ON COLUMN pool_profiles.location_region       IS 'State/province parsed from location_raw (E1). Nullable; independent of location_city.';
COMMENT ON COLUMN pool_profiles.location_country      IS 'Country display name parsed from location_raw (E1). Nullable.';
COMMENT ON COLUMN pool_profiles.location_country_code IS 'ISO 3166-1 alpha-2 code for location_country. Filter on this, not the name.';
