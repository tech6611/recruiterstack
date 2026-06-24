-- ============================================================
-- 071: Branded company career page (Publish JD — Phase 2a).
--
-- Adds public-facing branding + a vanity slug to org_settings so each org can
-- host a branded careers page at /careers/<slug> listing its open jobs, and
-- creates a public storage bucket for logo/hero images (mirrors the manually
-- created `resumes` bucket, but declared in SQL so it's reproducible).
--
-- Additive/reversible & idempotent: re-runnable; rollback = drop the columns,
-- the unique index, and the bucket.
-- ============================================================

-- 1. Branding + slug columns on org_settings (all optional; page is off by default)
ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS careers_slug   TEXT,
  ADD COLUMN IF NOT EXISTS careers_public BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS logo_url       TEXT,
  ADD COLUMN IF NOT EXISTS hero_image_url TEXT,
  ADD COLUMN IF NOT EXISTS brand_color    TEXT,
  ADD COLUMN IF NOT EXISTS accent_color   TEXT,
  ADD COLUMN IF NOT EXISTS brand_font     TEXT,
  ADD COLUMN IF NOT EXISTS tagline        TEXT,
  ADD COLUMN IF NOT EXISTS about          TEXT;

-- 2. Slug is unique across all orgs, case-insensitive. Partial index so the
--    many orgs without a slug (NULL) don't collide.
CREATE UNIQUE INDEX IF NOT EXISTS org_settings_careers_slug_unique
  ON org_settings (lower(careers_slug))
  WHERE careers_slug IS NOT NULL;

-- 3. Public storage bucket for branding images (logo + hero). Public read so the
--    careers/apply pages can render the images via getPublicUrl; writes happen
--    through the service-role admin client, which bypasses storage RLS.
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-assets', 'company-assets', true)
ON CONFLICT (id) DO NOTHING;
