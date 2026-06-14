# Canonical Data Model — Completion Plan

This is the build plan to finish the canonical data model started in
`canonical-data-model.md` and tracked in `canonical-ownership-matrix.md`.

## Why this is the foundation for both product pillars

RecruiterStack's two differentiators both rest on this model:

1. **Unified data across the full candidate lifecycle (apply → employee).**
   This is literally the canonical spine. It can only be true if one durable
   **Person** record survives the journey. Today `candidates` *is* the person,
   so a hired candidate has nowhere to "become" an employee — the lifecycle
   dead-ends at `status = 'hired'`.
2. **Agentic — talk in natural language, the job gets done.**
   An agent can only act reliably if there is *one* place to read and write each
   concept. Today the 38 copilot tools make raw Supabase calls to legacy tables
   (≈25 hit `applications`, 12 hit `candidates`, ≈8 hit `hiring_requests`). Every
   tool re-implements storage knowledge, so storage changes ripple into the agent.

So this is one project, not two. Person is the linchpin for both.

## Completion status (verified 2026-06-14)

**All slices 0–5 are DONE.** The canonical spine (Person → Candidate Profile →
Application → Interview → Offer → Employee Profile) exists end-to-end, the agent
layer routes through domain facades, and a CI drift guard prevents regression.

| Slice | Status | Landed by |
| --- | --- | --- |
| 0 — candidate email per-org | ✅ done | migration 045 |
| 1 — `people` + identity split | ✅ done | migrations 046 (people, backfill) + 062 (Party Model triggers) |
| 4 — `employee_profiles` | ✅ done | migration 047 |
| 2 — domain facades + agent re-point | ✅ done | `copilot-tools.ts` + `job-handlers.ts` now call `src/modules/ats/domain/*`; both off the audit's `legacy` list |
| 3 — `applications` → canonical jobs | ✅ done | migration 064 (`applications.job_id`/`opening_id`) + dual-write in `createApplication` |
| 5 — drift guard | ✅ done | `audit:canonical:check` + `.github/workflows/canonical-guard.yml` (fails CI on new legacy access) |

**Audit:** `mixed: 0, legacy: 5, compatibility: 20, canonical: 20`. The remaining
5 `legacy` files are the intake/`hiring_requests` routes frozen by decision (see
Resolved decisions #2) — allowlisted in the drift guard.

### Notes carried forward
- **`applications.job_id` is forward-only.** No `hiring_requests → jobs` row-level
  mapping exists, so legacy applications keep `hiring_request_id` only. New
  canonical-job applications populate `job_id`. A `hiring_requests → jobs`
  converter (for a true backfill, and the eventual single-"Jobs" nav collapse —
  see `nav-consolidation-roadmap.md`) remains a separate future project.
- **`hiring_request_id` is still `NOT NULL`** on `applications`; a later cleanup
  slice can relax it once a canonical apply path exists.
- **Two intentional Slice-2 micro-drifts** (error-string-only, genuine-DB-fault
  paths only, more accurate): the `matching` queue handler and
  `move_application_to_stage` now surface real DB errors instead of masking them
  as "Role/Stage not found". Success/no-row paths are byte-identical.

<details><summary>Historical pre-work state (verified 2026-05-24)</summary>

- Canonical & done at that time: `openings`, `jobs`, `job_postings`,
  `job_openings`, `departments`, `locations`, `compensation_bands`, `approval_*`.
- `applications`/`candidates`/`interviews`/`offers` still anchored to
  `hiring_requests`; no `people`/`employee_profiles`; `candidates.email` globally
  unique; latest migration was `044`.
</details>

## Guardrails (apply to every slice)

1. **Additive, never destructive.** New columns/tables are nullable or backfilled;
   no `DROP COLUMN` until a later, separate cleanup slice after callers move.
2. **Dual-write during transition.** When a new link replaces an old one, write
   both until reads are fully migrated.
3. **Reversible.** Every migration has a documented rollback. No data is deleted
   in the forward path.
4. **One concept, one facade.** Storage changes hide behind `src/lib/domain/*`.
   Agent tools and routes call the facade, never raw tables.
5. **Tenant-scoped.** Every write sets `org_id`; every read filters by `org_id`.
6. **Measured.** Re-run `npm run audit:canonical` after each slice; the
   ownership-matrix status for affected surfaces must improve, never regress.

---

## Slice 0 — Fix candidate identity scope (prerequisite)

**Goal:** make candidate identity unique *per org by email*, not globally.
Unblocks Person and fixes a live tenancy bug.

**Migration `045_candidate_email_per_org.sql`:**
- Drop the global unique constraint on `candidates.email`
  (`candidates_email_key`).
- Add `UNIQUE (org_id, email)`.
- Pre-flight guard: if any `(org_id, email)` duplicates already exist, the
  migration should fail loudly rather than silently — add a `SELECT` check or run
  a detection query first (see Verification).

**Detection query (run before applying):**
```sql
SELECT org_id, email, count(*) FROM candidates
GROUP BY org_id, email HAVING count(*) > 1;
```
If rows return, resolve duplicates manually first (this slice does not auto-merge).

**Code:** none. `findCandidateByEmailForOrg` already scopes by org, so the
constraint just makes the DB enforce what the code assumes.

**Verification:** detection query returns 0 rows; inserting the same email under
two different `org_id`s now succeeds; same email + same org fails.

**Rollback:** drop `(org_id, email)` unique, restore global unique (only safe if
no cross-org duplicate emails were created in the interim).

**Matrix effect:** unblocks Person; closes "fix legacy routes creating candidates
globally" (First Implementation Slice #1).

---

## Slice 1 — Introduce `people`, backfill, split identity from profile

**Goal:** create the universal human record. `candidates` becomes the
candidate *profile*; identity moves to `people`. The heart of Pillar 1.

**Migration `046_people.sql`:**
```sql
CREATE TABLE IF NOT EXISTS people (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       TEXT NOT NULL,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,
  phone        TEXT,
  linkedin_url TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, email)
);
CREATE INDEX idx_people_org       ON people(org_id);
-- RLS to match existing convention (service_role_all)
ALTER TABLE people ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_people" ON people FOR ALL USING (true) WITH CHECK (true);

-- Backfill: one person per distinct (org_id, email). Keep earliest candidate's
-- identity fields as canonical.
INSERT INTO people (org_id, email, name, phone, linkedin_url, created_at)
SELECT DISTINCT ON (org_id, email)
       org_id, email, name, phone, linkedin_url, created_at
FROM candidates
ORDER BY org_id, email, created_at ASC;

-- Link candidates to people.
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS person_id UUID REFERENCES people(id);
UPDATE candidates c SET person_id = p.id
FROM people p WHERE p.org_id = c.org_id AND p.email = c.email;
```
(Leave `person_id` nullable for now; a later slice makes it `NOT NULL` once all
write paths populate it.)

**Field ownership going forward:**
- `people`: `name`, `email`, `phone`, `linkedin_url` (identity that follows the human).
- `candidates` (= candidate profile): `resume_url`, `skills`, `experience_years`,
  `current_title`, `location`, `status`, `ai_summary*` (search/opportunity context).

**Code changes:**
- `src/lib/domain/people.ts`: add real table-backed functions —
  `findPersonByEmail(org, email)`, `findOrCreatePerson(org, input)`,
  `getPersonById`. Keep `personFromCandidate` for back-compat. Add
  `PersonSource = 'candidate_record' | 'manual'` (extensible for future sources).
- `src/lib/domain/candidates.ts`: `findOrCreateCandidateProfile` should first
  `findOrCreatePerson`, then set `person_id` on the candidate row. New
  candidates always get a person.
- `src/lib/types/database.ts`: add `Person`/`PersonInsert` types; add
  `person_id: string | null` to `Candidate`.

**UI:** unchanged. Candidate URLs and pages keep working — they read the same
`candidates` row, which now also carries `person_id`.

**Verification:** every candidate has a non-null `person_id`; `people` row count
== distinct `(org_id, email)` count from candidates; creating a new candidate via
the copilot/import path creates exactly one person and links it.

**Rollback:** drop `candidates.person_id`, drop `people`. No candidate data lost.

**Matrix effect:** Person object → moves from `future` toward `compatibility`
(candidates still carries profile data, but identity is now resolvable).

---

## Slice 2 — Domain facades for candidates & applications, then re-point the agent

**Goal:** make Pillar 2 structurally sound. Tools stop knowing table names.

**Steps:**
1. Extend `src/lib/domain/candidates.ts` and `applications.ts` into full
   read/write facades covering what the agent needs: search, get-by-id,
   status/stage updates, list-by-job. Model the read facade on the existing
   `listCanonicalJobPipelines` pattern in `job-pipelines.ts`.
2. Migrate `src/lib/copilot-tools.ts` tools to call the facades instead of raw
   `supabase.from('candidates'|'applications'|'hiring_requests')`. Prioritize the
   ≈8 tools touching `hiring_requests` directly, then the 25 touching
   `applications`, then the 12 touching `candidates`.
3. Candidate-facing agent tools resolve identity through `people.ts`.

**No schema change.** This is pure refactor — low risk, high structural payoff.

**Verification:** `grep` shows zero raw `supabase.from('hiring_requests')` in
`copilot-tools.ts`; existing copilot integration behavior unchanged (manual
smoke test of search/move/score tools).

**Rollback:** revert the refactor commit; facades are additive.

**Matrix effect:** `copilot-tools.ts` and `/api/copilot` move `mixed → compatibility`.
AI tool families move toward their canonical owners.

---

## Slice 3 — Link `applications` to canonical jobs

**Goal:** decouple candidacy from legacy `hiring_requests` — the last big
legacy dependency for the lifecycle.

**Reality check:** there is no `hiring_request → job` mapping to backfill from
(verified). So this slice is **forward-only dual-write**, not a bulk backfill:

**Migration `047_applications_job_link.sql`:**
```sql
ALTER TABLE applications ADD COLUMN IF NOT EXISTS job_id     UUID REFERENCES jobs(id);
ALTER TABLE applications ADD COLUMN IF NOT EXISTS opening_id UUID REFERENCES openings(id);
CREATE INDEX idx_applications_job     ON applications(job_id);
CREATE INDEX idx_applications_opening ON applications(opening_id);
```
Both nullable. `hiring_request_id` stays `NOT NULL` for now.

**Code:**
- `createApplication` (domain) accepts optional `jobId`/`openingId` and writes
  them. Applications created against canonical `jobs` populate `job_id`;
  applications against legacy `hiring_requests` keep `hiring_request_id` only.
- Reads via `job-pipelines.ts` already abstract the source — extend them to join
  applications by whichever link is present.
- **Optional companion:** a `hiring_requests → jobs` migration tool (separate,
  later) that creates canonical `jobs` from legacy requests and stamps the
  correspondence, enabling a true backfill. Out of scope for this slice.

**Verification:** new applications created against canonical jobs have non-null
`job_id`; legacy apply flow still works with `hiring_request_id` only.

**Rollback:** drop `job_id`/`opening_id` columns.

**Matrix effect:** `applications` and `/api/applications/*` improve toward
`canonical`; Application's "no canonical job link" gap closes for new data.

---

## Slice 4 — `employee_profiles`, closing the lifecycle loop

**Goal:** make "apply → employee" literally one identity. The unique HRIS bridge.

**Migration `048_employee_profiles.sql`:**
```sql
CREATE TABLE IF NOT EXISTS employee_profiles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       TEXT NOT NULL,
  person_id    UUID NOT NULL REFERENCES people(id),
  application_id UUID REFERENCES applications(id),  -- the candidacy that became this hire
  start_date   DATE,
  department_id UUID REFERENCES departments(id),
  status       TEXT NOT NULL DEFAULT 'active',      -- active | terminated | on_leave
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_employee_profiles_org    ON employee_profiles(org_id);
CREATE INDEX idx_employee_profiles_person ON employee_profiles(person_id);
ALTER TABLE employee_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_employee_profiles" ON employee_profiles FOR ALL USING (true) WITH CHECK (true);
```

**Code:**
- `src/lib/domain/employees.ts` (new): `createEmployeeFromHire(applicationId)` —
  resolves the candidate's `person_id`, creates the employee profile, links the
  originating application.
- Hook into the hire transition (when `applications.status → 'hired'` or
  candidate `status → 'hired'`) to call it. Fire-and-forget, mirroring autopilot.

**Verification:** marking an application hired creates one `employee_profile`
linked to the same `person_id` as the candidate; the person now resolves as both
"was a candidate" and "is an employee."

**Rollback:** drop `employee_profiles`.

**Matrix effect:** Hire / Employee Profile object → `future` to `canonical`.
Lifecycle spine is end-to-end.

---

## Slice 5 — Harden the drift guard

**Goal:** prevent regression while features get built on top.

- Extend `scripts/audit-canonical-model.mjs` to **exit non-zero** when a file
  introduces a new direct write to `hiring_requests` (or other legacy tables)
  without a registered compatibility exception.
- Add `audit:canonical` to CI (or a pre-push/pre-commit hook).
- Maintain an allowlist of known compatibility files so legitimate bridges pass.

**Verification:** introducing a raw legacy write in a new file fails the audit.

**Matrix effect:** "No-New-Drift Rules" become enforced, not aspirational.

---

## Sequencing & dependencies

```
Slice 0 (email scope)  ──►  Slice 1 (people)  ──┬──►  Slice 2 (agent facades)
                                                 ├──►  Slice 3 (app→job link)
                                                 └──►  Slice 4 (employees)
                                          Slice 5 (audit guard) runs after each
```

- **0 → 1 are strictly sequential** and must come first.
- **2, 3, 4 are independent** once Person exists; can be built in parallel or in
  any order based on which pillar you want to advance first.
- **Recommended order:** 0 → 1 → 2 (makes the agent sound) → 4 (closes the
  lifecycle, the headline demo) → 3 (cleans up the last legacy link) → 5.

## Resolved decisions (locked 2026-05-24)

1. **`candidates` rename:** keep the name `candidates`. Identity moves to
   `people`; the table now holds the candidate *profile* but is not renamed.
   Revisit in a later cleanup slice if ever.
2. **Legacy `hiring_requests`:** **freeze now, migrate later.** No new writes to
   `hiring_requests`; everything net-new is created as canonical `jobs`. The
   `hiring_requests → jobs` converter is a separate future project. Therefore
   Slice 3 stays **forward-only** (no bulk backfill).
3. **Employee data depth:** **minimal first** — person link, start date,
   department, status. Comp/manager/employment-history layered on later once the
   unified-identity spine is proven.
4. **Rollout:** **ship the data layer additively, no flag** (every slice is
   non-breaking). Gate any user-visible new UI (e.g. an Employees view) behind a
   feature flag to control the reveal.

## Risk register

| Risk | Slice | Mitigation |
| --- | --- | --- |
| Cross-org duplicate emails block the unique constraint | 0 | Detection query first; resolve manually before applying |
| Backfill mis-maps a candidate to the wrong person | 1 | `DISTINCT ON (org_id, email)` + verification counts; reversible |
| Agent behavior regresses during refactor | 2 | No schema change; smoke-test tools; revert is clean |
| `applications.job_id` stays mostly null (no legacy mapping) | 3 | Expected; forward-only by design; optional later backfill tool |
| Duplicate employee profiles on repeated hire events | 4 | Idempotent `createEmployeeFromHire` (check existing by application_id) |
