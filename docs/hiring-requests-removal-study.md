# Legacy `hiring_requests` → canonical `jobs` — removal study & plan

**Goal:** one source of truth for job data. Finish migrating everything off the
legacy `hiring_requests` model onto the canonical `jobs`/`openings` spine, then
drop the `hiring_requests` table.

**Status:** in progress. Started 2026-07-13.

> This is a cross-repo, cross-database effort. Read it before touching anything
> that reads/writes `hiring_requests` or `hiring_request_id`.

---

## 1. The lay of the land

RecruiterStack runs **two backends against one shared Supabase DB**:

- **Next.js** (`tech6611/recruiterstack`, Vercel) — frontend + some APIs.
- **Django** (`tech6611/recruiterstack-api`, Railway) — most `/api/*` are
  proxied here via `next.config.mjs` `rewrites()` (gated on `DJANGO_API_URL`).
  Django models are `managed = False` — the schema is owned by this repo's
  `supabase/migrations/`.

Two job models exist on the shared DB:

| | Table | Model | Title field |
|---|---|---|---|
| **Canonical (target)** | `jobs` | Django `Job`, Next.js canonical facades | `title` |
| **Legacy (removing)** | `hiring_requests` | Django `HiringRequest`, `HiringRequest` TS type | `position_title` |

Django presents canonical jobs in the legacy board shape via `serialize_job`
(`title`→`position_title`, `department_id`→departments.name, `custom_fields`→
`hiring_manager_*`/`scoring_criteria`). An `Application`/`Interview`/`Offer`
anchors on **`job_id`** (canonical, migrations 064/068) **or** `hiring_request_id`
(legacy) — exactly one. Django serializes a null anchor as the *string* `"None"`.

## 2. Headline finding

The Next.js audit (`npm run audit:canonical`) reports **`legacy: 0`**, and the
board/live jobs are already canonical — but that is **misleading for removal**:

- **Next.js repo:** ~40 files / ~349 line-hits, but *most* are already
  migrated — they read canonical `jobs` and only keep the legacy field *name*
  (`hiring_request:jobs(position_title:title)`). Only a bounded set are true
  legacy-table reads/writes (see §3).
- **Django repo (the live backend for most routes): `hiring_requests` is NOT
  vestigial.** It is still actively read AND written by core flows:
  - **Public apply** (`public/views.py`) resolves the job via
    `HiringRequest.objects.get(apply_link_token=...)` and **creates the
    application with `hiring_request_id=job.id`** (`public/views.py:199`).
  - **Public intake** (`intake_token`) is entirely on `HiringRequest`.
  - **Copilot** can **create** jobs as `HiringRequest` (`ai/copilot_tools.py`
    `HiringRequest.objects.create(...)`, and ~40 legacy refs).
  - **Analytics** (`analytics/views.py`), **voice** (`voice/*`), **autopilot**
    (`ai/autopilot.py`), sequences, and the still-routed `/api/hiring-requests`
    endpoint all read the legacy table.

**GATING QUESTION — ANSWERED 2026-07-13: the legacy WRITE paths are DEAD, and
the `hiring_requests` table is EMPTY.** Decisive evidence:

- **Live DB:** `hiring_requests` = **0 rows**; `jobs` = 4; `applications` = 6,
  **all 6 anchored on `job_id`, 0 on `hiring_request_id`** (including every
  `source="applied"` public application). Nothing legacy exists and nothing is
  creating it.
- **Route topology** — the Django legacy write code is *shadowed*, not used:
  - `/api/apply` → Next.js **static** route `src/app/api/apply/route.ts` wins
    over the Django rewrite; it creates canonical apps
    (`createApplication({ jobId })` via `getCanonicalApplyJobByToken`). Django's
    `public/views.py:ApplyView` (writes `hiring_request_id`) never runs.
  - `/api/intake/[token]` → Next.js only; `next.config.mjs` **explicitly does NOT
    proxy intake to Django** (canonical `jobs`/`intake_token`, Phase 3/C5.5).
  - `/api/copilot` → Next.js only (canonical + Gemini); Django copilot "kept for
    rollback" but not proxied. Its `HiringRequest.objects.create(...)` is dead.
  - `/api/hiring-requests` → still Django-routed, but the frontend deleted all
    callers; unreachable from the app (and would return nothing — empty table).

**Implication: no data migration and no write-path migration are needed.** The
Django legacy write code is dead weight. Remaining work is pure **cleanup**:
repoint/remove the code that still *reads* the empty legacy table (so displays
resolve canonically), delete the dead Django legacy code, relax the validators,
clear the FKs, and drop the empty table.

## 3. Inventory — what actually still touches the legacy table

### Next.js (`recruiterstack`)
**Safe (already canonical — only the field *name* is legacy):** all
`hiring_request:jobs(...)` aliased embeds in `modules/ats/domain/applications.ts`;
the canonical analytics/dashboard/export fetchers in `modules/ats/domain/reporting.ts`;
`canonicalJobToHiringRequest`/`getApplicationJobTokens` in `job-pipelines.ts`;
`schedule/*`, `dashboard`, `analytics`, `agent/schedule-interview`, `interviews`
POST, `jobs/[id]/score`, `lib/interviews/cancel.ts` (nullable, tolerant).

**Legacy-only (must migrate):**
- Domain: `job-pipelines.ts:getLegacyJobTokens`; `applications.ts` `.eq('hiring_request_id')` (×3) + embed `hiring_requests(...)` (:589); `reporting.ts:fetchLegacyAnalyticsInputs` (**dead**).
- API routes: `offers` + `offers/[id]`, `applications/[id]` (+ `email-draft`), `candidates/[id]/ai-summary`, `inbox`, `interviews` GET + `interviews/[id]`, `pipeline-stages`, `jobs/[id]/stages`, `export/applications`, `debug-scores`.
- lib: `ai/autopilot.ts`, `api/job-handlers.ts` embeds, `copilot-tools.ts:2569`.
- Validations (**require** `hiring_request_id` → block canonical-only writes): `applications.ts`, `interviews.ts`, `offers.ts`. `validations/hiring-requests.ts` is **dead**.
- Types: `HiringRequest` interface + `hiring_requests` map entry in `lib/types/database.ts`.

> Note: for routes proxied to Django, the *live* behavior is Django's — fixing
> the Next.js copy alone won't change production. Fix the serving repo.

### Django (`recruiterstack-api`) — the live backend
**Reads for display (migrate with a canonical fallback — low risk):**
- `candidates/views.py` — ✅ **DONE 2026-07-13** (candidate detail + AI summary).
- `interviews/views.py` (interview list/detail + offer serialization titles) — **batch 1**.
- `hiring/views_applications.py:252`, `hiring/views_application_email.py:303` (HM email/title for notifications).
- `analytics/views.py` (dashboard/analytics on `HiringRequest`).
- `ai/copilot_tools.py` read tools (job lookups, counts).

**Writes / create-paths (higher risk — need canonical write path + the §2 answer first):**
- `public/views.py` apply + intake (creates `hiring_request_id` apps; intake on `HiringRequest`).
- `ai/copilot_tools.py` `HiringRequest.objects.create(...)` (copilot job creation).
- `hiring/views_hiring_requests.py` (`/api/hiring-requests` list/create/detail) + `hiring/urls.py` routes.
- `ai/autopilot.py`, `voice/*`, `sequences/tasks.py` (resolve legacy job for scoring/calls/emails).

## 4. Sequenced plan  (simplified — §2 answered: table empty, no live writers)

Because the legacy table is empty and nothing writes it, this is now a **code
cleanup + table drop**, not a data/write migration.

1. **Batch 1 (done): interview/offer title display.** Read-only canonical
   fallback via `application → job_id → jobs.title` (both repos).
2. **Batch 2: remaining read-for-display sites** so nothing depends on the empty
   legacy table to render a title — Django `inbox` (INNER JOIN on
   `hiring_requests` currently *drops canonical apps entirely* — highest impact),
   notification emails, analytics, copilot read tools; Next.js legacy-only
   embeds (`applications/[id]`, `ai-summary`, `job-handlers`, etc.).
3. **Batch 3: delete dead legacy code** (safe now): Django `public/views.py`
   legacy apply/intake, `ai/copilot_tools.py` legacy create, `hiring/views_hiring_requests.py`
   + `/api/hiring-requests` routes; Next.js `validations/hiring-requests.ts`,
   `fetchLegacyAnalyticsInputs`, `getLegacyJobTokens`. Relax the 3
   required-`hiring_request_id` validators (`applications/interviews/offers`).
4. **Batch 4: schema drop.** Supabase migration to drop the FKs / `hiring_request_id`
   columns on `applications`/`interviews`/`offers`/`pipeline_stages` (all null),
   then `DROP TABLE hiring_requests`. Remove the now-unused Django `HiringRequest`
   model + `HiringRequest` TS type. Verify nothing queries it first.

## 5. Progress

- [x] **Candidate "Unknown Role"** — Django candidate detail + AI summary now
  resolve canonical titles (`recruiterstack-api@7ec5893`, deployed & verified live).
- [x] Batch 1 — interview/offer title display. Django detail handlers
  (`interviews/views.py`, `c0a93d5`) **and** the Next.js *list* handlers
  (`api/interviews`, `api/offers` — static routes served by Next.js, not Django).
  Lesson: static Next.js routes win over the Django rewrite, so each endpoint's
  fix lives in whichever repo actually serves it (static→Next.js, dynamic→Django).
- [x] **Gating question answered (2026-07-13)** — legacy write paths DEAD;
  `hiring_requests` table EMPTY (0 rows); 100% of live data canonical. No data
  or write migration needed.
- [ ] Batch 2 — remaining read-for-display (start with Django `inbox` INNER JOIN).
- [ ] Batch 3 — delete dead legacy code + relax validators.
- [ ] Batch 4 — drop FKs/columns + `DROP TABLE hiring_requests` + remove model/type.
