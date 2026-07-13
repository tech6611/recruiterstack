-- ============================================================
-- 090: Hiring-manager seats — free-seat model + pending users
-- Foundational layer for first-class hiring managers:
--   * invite-on-assignment provisions a real users + org_members
--     row the moment a hiring manager is picked as an approver,
--     BEFORE they have a Clerk login. So clerk_user_id must be
--     nullable (NULL = pending, claims a login later).
--   * is_free_seat flags the billing carve-out: hiring-manager
--     seats never count against paid recruiter seats.
-- ============================================================

-- A users row with clerk_user_id IS NULL is a "pending" user: we
-- created it so the approval engine has a real user_id to target,
-- but the person hasn't accepted their Clerk invitation yet. When
-- they do, syncUserFromClerk backfills clerk_user_id onto this row.
-- (Postgres UNIQUE allows multiple NULLs, so the existing UNIQUE
-- constraint on clerk_user_id keeps working for real logins.)
ALTER TABLE users ALTER COLUMN clerk_user_id DROP NOT NULL;

-- How this users row came to exist. NULL = normal Clerk sign-up.
-- 'approver_invite' = auto-provisioned when named as an approver.
ALTER TABLE users ADD COLUMN IF NOT EXISTS provisioned_via TEXT;

-- Billing carve-out. Seats provisioned as hiring managers are free
-- and must be excluded from any future paid-seat count. No billing
-- enforcement exists yet — this flag is the forward-looking hook.
ALTER TABLE org_members ADD COLUMN IF NOT EXISTS is_free_seat BOOLEAN NOT NULL DEFAULT false;

-- Find pending users by email fast (the backfill-on-Clerk-accept path).
CREATE INDEX IF NOT EXISTS idx_users_pending_email
  ON users(lower(email)) WHERE clerk_user_id IS NULL;
