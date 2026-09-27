-- 152_candidate_avatar.sql
-- A photo for a candidate, where one can be had honestly.
--
-- WHY A URL AND NOT A STORED IMAGE. The only source we can use today is a GitHub
-- avatar, which GitHub serves publicly and updates when the person changes it. Copying
-- the bytes into our storage would freeze a stale picture of someone and make us the
-- custodian of a portrait we were never given — a URL keeps the person in control of
-- their own image, and deleting the row deletes our copy of anything.
--
-- WHAT THIS IS NOT FOR. LinkedIn photos sit behind their authentication and their terms
-- forbid taking them; nothing here should ever be filled from LinkedIn. Résumé-embedded
-- photos are a separate question (a picture in a CV needs a face check before it is
-- shown as a person, or a company logo ends up as someone's portrait) and are
-- deliberately out of scope.
--
-- Nullable, and the UI falls back to the initials circle — which will stay the common
-- case, because most candidates have no public photo anywhere.

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS avatar_url text;

COMMENT ON COLUMN candidates.avatar_url IS
  'Public portrait URL (GitHub avatar today). Never populated from LinkedIn.';
