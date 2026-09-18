-- 146: one person = one users row.
--
-- Background: the Clerk (login) instance changed mid-2026. The same emails came back
-- with new clerk ids and the webhook inserted them as NEW people, so approvals, team
-- seats and requisitions kept pointing at the old, un-loginable rows ("ghosts").
-- Application-side, sync.ts now RELINKS an existing same-email row to a new login.
-- This migration repairs what already happened and adds the guard rail.
--
-- For every email with more than one active row:
--   1. the most recently created row is the canonical one (the login that works);
--   2. every FK column referencing users(id) is re-pointed from each ghost to it —
--      row by row where a unique constraint collides (the ghost's duplicate seat is
--      dropped because the canonical row already holds it);
--   3. JSON references that are not FKs (approval approvers/decisions, chain
--      approver_value) are rewritten too;
--   4. the ghost is deactivated (deactivated_at) and delegates to the canonical row —
--      never deleted, so history stays intact.
-- Then: at most one ACTIVE row per email, enforced by a partial unique index.

DO $$
DECLARE
  dup       RECORD;
  ghost     RECORD;
  fk        RECORD;
  r         RECORD;
  canonical UUID;
BEGIN
  FOR dup IN
    SELECT lower(email) AS em
    FROM users
    WHERE deactivated_at IS NULL
    GROUP BY lower(email)
    HAVING count(*) > 1
  LOOP
    SELECT id INTO canonical
    FROM users
    WHERE lower(email) = dup.em AND deactivated_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1;

    FOR ghost IN
      SELECT id FROM users
      WHERE lower(email) = dup.em AND deactivated_at IS NULL AND id <> canonical
    LOOP
      RAISE NOTICE 'merging users % -> % (%)', ghost.id, canonical, dup.em;

      -- 2. every FK that references users(id)
      FOR fk IN
        SELECT tc.table_name, kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public'
          AND ccu.table_name = 'users' AND ccu.column_name = 'id'
      LOOP
        BEGIN
          EXECUTE format('UPDATE public.%I SET %I = $1 WHERE %I = $2', fk.table_name, fk.column_name, fk.column_name)
            USING canonical, ghost.id;
        EXCEPTION WHEN unique_violation THEN
          -- Some rows collide with seats the canonical row already holds: go row by row.
          BEGIN
            FOR r IN EXECUTE format('SELECT id FROM public.%I WHERE %I = $1', fk.table_name, fk.column_name) USING ghost.id LOOP
              BEGIN
                EXECUTE format('UPDATE public.%I SET %I = $1 WHERE id = $2', fk.table_name, fk.column_name) USING canonical, r.id;
              EXCEPTION WHEN unique_violation THEN
                EXECUTE format('DELETE FROM public.%I WHERE id = $1', fk.table_name) USING r.id;
                RAISE NOTICE '  dropped duplicate %.% row %', fk.table_name, fk.column_name, r.id;
              END;
            END LOOP;
          EXCEPTION WHEN undefined_column THEN
            RAISE NOTICE '  %.% has no id column; left as is', fk.table_name, fk.column_name;
          END;
        END;
      END LOOP;

      -- 3. JSON references (not FKs)
      UPDATE approval_steps
         SET approvers = replace(approvers::text, ghost.id::text, canonical::text)::jsonb
       WHERE approvers::text LIKE '%' || ghost.id::text || '%';
      UPDATE approval_steps
         SET decisions = replace(decisions::text, ghost.id::text, canonical::text)::jsonb
       WHERE decisions::text LIKE '%' || ghost.id::text || '%';
      UPDATE approval_chain_steps
         SET approver_value = replace(approver_value::text, ghost.id::text, canonical::text)::jsonb
       WHERE approver_value::text LIKE '%' || ghost.id::text || '%';

      -- 4. retire the ghost, pointing anything left at the canonical row
      UPDATE users SET deactivated_at = now(), delegate_user_id = canonical WHERE id = ghost.id;
    END LOOP;
  END LOOP;
END $$;

-- Guard rail: one ACTIVE row per email (ghosts may keep the email, deactivated).
CREATE UNIQUE INDEX IF NOT EXISTS users_active_email_uniq
  ON users (lower(email))
  WHERE deactivated_at IS NULL;
