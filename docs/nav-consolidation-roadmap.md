# Navigation Consolidation Roadmap

How the **sidebar information architecture** and the **canonical data model
migration** relate, and the order in which to do them. Read alongside
[`canonical-data-model.md`](./canonical-data-model.md),
[`canonical-ownership-matrix.md`](./canonical-ownership-matrix.md), and
[`canonical-completion-plan.md`](./canonical-completion-plan.md).

## Product principle (scopes everything below)

**This platform is for TA / recruiting professionals — recruiter and org-admin
views only.** Employee self-service (HRIS & Payroll *for the employee*) ships as
a **separate variant**. There is therefore no "Me vs Org" tension in *this*
product: the TA professional sees org-wide state (departmental, per their access),
never a personal self-service surface.

Consequences for the nav:
- The entire **`Me`** bucket (`/me/*`, 10 items) belongs to the employee variant
  and is **removed here**.
- **Time-off / payslips / tax-declarations as self-service** are removed.
  `Me/Approvals` (a manager approving an employee's time-off) is an
  employee/manager workflow → removed. **Governance approvals** (`/approvals/inbox`,
  `/admin/approvals` = requisition/offer sign-off) are core TA workflow → **kept**.
- HRIS/Payroll keep only **admin/org oversight** views where relevant.

## The core insight: two layers, do not conflate

| Layer | What it can do | What it *cannot* do |
| --- | --- | --- |
| **Nav redesign** (presentation) | Hide, relabel, reorder, group surfaces | Eliminate duplicate data; wire candidates onto canonical tables |
| **Canonical migration** (data) | Collapse parallel models into one source of truth | (is the only thing that makes a "single Jobs item" *real*) |

The nav fix is a **stopgap** that makes the product look coherent now. The
canonical migration is the **prerequisite** for the nav consolidation to be real
rather than cosmetic. They are complementary, not alternatives.

## The recruiting-pipeline overlap, precisely

Four surfaces today describe "a thing we're hiring for" (three in the sidebar):

| Sidebar label | Route | Table | Status |
| --- | --- | --- | --- |
| Openings | `/openings` | `openings` | canonical — **keep** |
| Pipelines | `/req-jobs` | `jobs` | canonical — but **holds no candidates yet** |
| Jobs | `/jobs` | `hiring_requests` | legacy — **where all candidates actually live** |
| *(hidden)* | `/hiring-requests` | `hiring_requests` | legacy raw view |

**Why this matters:** `applications` (a candidate's candidacy, carrying stage / AI
score / status) links to a job *only* via `applications.hiring_request_id` (NOT
NULL). There is **no `job_id` / `opening_id` column on `applications`**. So:

- `/jobs` (reads `hiring_requests`) can render candidates-per-stage. It works.
- `/req-jobs` (reads `jobs`) **structurally returns zero candidates** — no
  application row points at a `jobs.id`.
- Confirmed blocker (completion plan §Current state): **no row-level
  `hiring_requests → jobs` mapping exists**, so even an adapter has nothing to
  join on, and Slice 3 cannot trivially backfill `applications.job_id`.

So it is **2 real concepts + 1 legacy duplicate** — but the legacy duplicate is
the one doing all the work until the migration wires candidates onto `jobs`.

### Adapter feasibility (verified 2026-06-14)

Can `/req-jobs` show real candidates today via an adapter? **No — confirmed dead-end.**

- The only `job_id` FK from migration 035 is on `hiring_teams` (035:99), not on
  `applications`.
- `hiring_requests` has **zero** columns referencing `jobs`/`openings`.
- `applications` never gains `job_id`/`opening_id`; its only job link is
  `hiring_request_id`. (The `?job_id=` export param filters `hiring_request_id`.)
- There is **no row-level mapping** between canonical `jobs` and legacy
  `hiring_requests` in either direction, so a candidate-bearing adapter has
  nothing to join on. Building it *is* Slice 3.

**Dormant asset found:** `listCanonicalJobPipelines()`
(`src/modules/ats/domain/job-pipelines.ts:77`) already merges `jobs` +
`hiring_requests` into one list tagged with `source`
(`requisition_job` | `legacy_hiring_request`). It has **no callers**. It returns
metadata only (title/status/dept) — no candidate counts (it can't compute them
for canonical jobs).

Near-term pipeline-surface options:

| Option | Result | Candidates | Cost |
| --- | --- | --- | --- |
| **A. Legacy `/jobs` as the one "Jobs"** | hide `/req-jobs`; show populated legacy board | full | zero (already wired) |
| **B. Wire the dormant union facade** | one "Jobs" list, both kinds, `source`-tagged | legacy ✅ / canonical metadata-only | modest |
| **C. True `/req-jobs` candidate adapter** | canonical board w/ real candidates | — | not possible (= Slice 3) |

## Jobs vs Openings (canonical reference)

Both say "we're hiring for X" but answer different questions for different people.

|  | **Opening** (`openings`) | **Job** (`jobs`) |
| --- | --- | --- |
| Answers | *Is this hire authorized, on what terms?* | *How are we running the search?* |
| Owner | Finance / HR / hiring manager | Recruiter |
| Lifecycle | draft → pending_approval → approved → open → **filled** → closed → archived | draft → pending_approval → approved → open → closed → archived (no "filled") |
| Owns | department, location, **comp** (min/max/currency/band/out_of_band), employment_type, target_start_date, hiring_manager, recruiter, justification, external_id (HRIS sync) | internal description (JD), hiring_team, interview_plan, scorecard, confidentiality |
| Downstream | nothing (planning record) | `job_postings`; ↔ openings via `job_openings` |

- **Opening = the authorization / "req"** — a budgeted *seat*. Gets `filled`.
  Comp & location live here (properties of the headcount, not the search).
- **Job = the recruiting campaign** that fills openings — the recruiter's
  workspace (team, interview plan, scorecard, postings, confidentiality). No comp
  or location of its own.
- **Many-to-many** (`job_openings`): one job pipeline can fill several openings
  ("hire 3 engineers" = one pipeline, three seats); one opening can rarely be
  served by multiple jobs (reorg).
- Analogy: **Opening = purchase order**, **Job = the project that fulfills it**,
  **Posting = the advertisement**. Legacy `hiring_requests` mashed all three into
  one flat row — which is why it must be decomposed.

## Roadmap

### Phase 1 — Nav now (DONE 2026-06-14; presentation only)

Implemented in `src/components/layout/Sidebar.tsx`:

1. Removed the `Me` bucket entirely (all `/me/*` → employee variant). This kills
   overlaps #2–#4: the self-service side disappears, the admin/org side stays.
2. Dropped the duplicate `Pipelines` (`/req-jobs`) entry → legacy `/jobs` is the
   single "Jobs" surface (**Option A**; the only board with candidates pre-Slice-3).
   `/hiring-requests` stays out of the nav.
3. Renamed `HRIS` → `People`; kept the full HR-ops module set as admin/org views.
4. Kept `Payroll` as its own bucket (distinct access domain, shared with Finance).
5. Removed orphaned `Me`-only icon imports (`UserCircle`, `Calendar`, `Clock`).

Resulting shape (HR-ops product for a centralized TA team; HR-ops sections
remain `adminOnly`-gated until finer RBAC lands):

```
Home          /dashboard
Recruiting    Openings · Jobs · Candidates · Sourcing · Sequences · Inbox
People        Employees · Org chart · Onboarding · OKRs · Documents · HR cases · Leave policies
Payroll       Payroll runs · Tax settings
Insights      Analytics · People analytics
Admin         Approvals · Approval chains · Settings
```

**Follow-up (not done):** per-member access control. The team wants module-level
access (e.g. OKRs visible to one member, Payroll to a TA + Finance member). Today
the sidebar only has a coarse `adminOnly` flag + `/api/me` admin check — true
per-module RBAC is a separate feature.

### Phase 2 — Canonical migration (the real fix; ongoing)

Per `canonical-completion-plan.md`, in order:
- **Slice 0** — scope `candidates.email` per-org (hard blocker).
- **Slice 1** — introduce `people`; split identity from `candidates`.
- **Slice 2** — domain facades for candidates/applications; re-point ~38 copilot tools.
- **Slice 3** — add `applications.job_id` / `opening_id`; **dual-write** new
  candidacies onto canonical `jobs`. (Forward-only; legacy rows need a separate
  backfill, which has no existing `hiring_requests → jobs` mapping to lean on.)
- **Slice 4** — `employee_profiles`; link hired applications to employees.
- **Slice 5** — drift guard / audit enforcement.

Slice 3 is the one that makes canonical `jobs` hold real candidates. It sits
*downstream* of Slices 0–1, which are **not started**.

### Phase 3 — Final nav collapse (after Slice 3 + backfill)

> **Phase 3 complete (code, 2026-06-19):** the Canonical Jobs Collapse (C1–C6) is
> done — `/hiring-requests` UI + `/api/hiring-requests` are deleted, the legacy
> job-create path now creates canonical `/api/req-jobs` jobs, dead legacy domain
> functions are removed, and the drift-guard allowlist is empty. Remaining is
> operational only (production legacy-data wipe + final Openings-fold decision).

- Flip the surviving "Jobs" entry to canonical `/req-jobs` (now populated).
- Delete `/jobs` and `/hiring-requests` for real.
- **Target IA (decided 2026-06-14):** collapse toward **one** "Jobs" entry with
  the opening folded in (Greenhouse-style) — but only once `openings`↔`jobs`↔
  `applications` are data-linked. Until then, ship **two** entries (Openings +
  Jobs); a true single object can't be honest while they're unlinked.

## Decisions (resolved)

1. **Pipeline surface now** — **Option A**: legacy `/jobs` is the single "Jobs"
   entry; `/req-jobs` and `/hiring-requests` stay out of the nav. *(done — Phase 1)*
2. **Org surface scope** — keep the **fuller HR-ops surface** (renamed `People`)
   plus a standalone `Payroll` bucket. The product serves a centralized TA team
   that also runs HR-ops; modules are admin/org views, access-gated per member.
   The `Me` self-service bucket is removed (separate employee variant). *(done — Phase 1)*
3. **Final Jobs IA** — **two entries now** (Openings + Jobs), **one entry** as the
   Phase-3 target once the data is linked. *(decided; nav unchanged for now)*

## Open follow-ups

- **Per-member RBAC** — module-level access (e.g. OKRs → one member, Payroll →
  a TA + Finance member). Today only a coarse `adminOnly` flag + `/api/me` check
  exists. Next piece of work after this.
