# Canonical Ownership Matrix

This matrix is the migration control plane for aligning RecruiterStack around one unified hiring lifecycle. It should be updated when routes, tables, or AI tools move from legacy storage to canonical services.

> **Status (2026-06-14): canonical completion plan Slices 0–5 are DONE** (see
> `canonical-completion-plan.md`). The agent layer is behind domain facades,
> `applications` can link to canonical jobs, and a CI drift guard
> (`audit:canonical:check`) blocks new legacy access. The only remaining
> `legacy` surfaces are the intake/`hiring_requests` routes frozen by decision.

Status values:

- `canonical`: aligned with the target model.
- `compatibility`: allowed bridge while legacy data remains live.
- `adapter`: explicit bridge that presents legacy and canonical data through one interface.
- `legacy`: existing product surface that should not receive new core behavior.
- `mixed`: touches both generations and needs decomposition.

## Canonical Object Ownership

| Canonical object | Current primary tables | Legacy/related tables | Notes |
| --- | --- | --- | --- |
| Opening | `openings` | `hiring_requests` | `openings` is the canonical headcount/requisition object. |
| Job Pipeline | `jobs`, `job_openings` | `hiring_requests`, `pipeline_stages` | `jobs` is canonical for new pipelines; `hiring_requests` remains compatibility storage. |
| Posting | `job_postings` | `hiring_requests.apply_link_token` | New posting logic should attach to `job_postings`. |
| Person | future `people` | `candidates` | `candidates` currently carries both person and candidate-profile data. |
| Candidate Profile | future `candidate_profiles` | `candidates` | New person-level fields should be designed for later split. |
| Application | `applications` | none | Durable candidacy contract; should point to a person/candidate and job pipeline. |
| Interview | `interviews` | `hiring_requests` references | Interview logic should attach through `application_id` first. |
| Offer | `offers` | none | Offer approvals attach here when compensation terms need governance. |
| Hire / Employee Profile | future `employee_profiles` | `candidates.status = hired` | Hired status is not enough for employee lifecycle data. |

## Route Ownership

| Surface | Status | Canonical owner | Action |
| --- | --- | --- | --- |
| `/openings`, `/api/openings/*` | canonical | Opening | Keep as requisition/headcount source of truth. |
| `/req-jobs`, `/api/req-jobs/*` | canonical | Job Pipeline | Keep as canonical pipeline surface. Rename UI copy from "req-jobs" where possible. |
| `/api/postings/*` | canonical | Posting | Keep. |
| `/admin/approvals`, `/approvals/inbox`, `/api/approvals/*` | canonical | Opening / Job / Offer governance | Keep. |
| `/jobs`, `/api/jobs/*` | compatibility | Job Pipeline | Currently backed by `hiring_requests`; migrate callers to canonical job-pipeline services. |
| `/hiring-requests`, `/api/hiring-requests/*` | legacy | Opening / intake compatibility | Freeze for net-new product work. |
| `/roles`, `/api/roles/*`, `/api/matches` | legacy | Role Profile | Rename/reposition as role templates, or migrate into `role_profiles`. |
| `/apply`, `/api/apply/*` | compatibility | Posting -> Application | Public flow still uses `hiring_requests`; keep stable while adding posting-based apply links. |
| `/intake`, `/api/intake/*` | compatibility | Opening intake | Current flow uses `hiring_requests`; future intake should create/update `openings`. |
| `/candidates`, `/api/candidates/*` | compatibility | Person + Candidate Profile | Keep UI stable; avoid adding fields that cannot split into person/profile later. |
| `/api/applications/*` | compatibility | Application | `applications.job_id`/`opening_id` now exist (Slice 3, migration 064); `createApplication` dual-writes when given a canonical job. Legacy apply still uses `hiring_request_id` (forward-only). |
| `/api/interviews/*`, `/schedule/*` | compatibility | Interview | Prefer `application_id` as the entry point over direct `hiring_request_id`. |
| `/api/offers/*` | compatibility | Offer | Keep; ensure offers always link to applications. |
| `/dashboard`, `/analytics`, `/inbox`, exports | mixed | Reporting | Must dedupe/label legacy and canonical records before executive reporting. |
| `/api/copilot` + `src/lib/copilot-tools.ts` | compatibility | Agent layer | **Done (Slice 2):** all tool storage access routes through `src/modules/ats/domain/*` facades; no raw legacy `from(...)` in `copilot-tools.ts` or `job-handlers.ts`. Off the audit's `legacy` list. |

## AI Tool Ownership

As of Slice 2 (2026-06-14) every tool family below routes through
`src/modules/ats/domain/*` facades rather than raw `supabase.from(...)`.

| Tool family | Status | Canonical owner | Action |
| --- | --- | --- | --- |
| Candidate search/profile tools | compatibility | Person + Candidate Profile | **Done:** via `domain/candidates.ts` (identity resolved through `people`). |
| Pipeline movement tools | compatibility | Application | **Done:** via `domain/applications.ts` + `domain/job-pipelines.ts`; writes application-centric. |
| Job listing/creation tools | compatibility | Opening + Job Pipeline | **Done:** agent reads via `domain/job-pipelines.ts` (no raw `hiring_requests` in the agent layer). Underlying legacy storage still bridged. |
| Bulk scoring/autopilot | compatibility | Application | **Done:** via `domain/applications.ts`; application is the durable contract. |
| Email drafting/sending | compatibility | Application | **Done:** via `domain/applications.ts`; application-first. |
| Interview scheduling | compatibility | Interview | **Done:** via `domain/interviews.ts`; prefer application-linked scheduling. |
| Offer tools | compatibility | Offer | **Done:** via `domain/offers.ts`. Add approval governance before broadening. |

## No-New-Drift Rules

1. New feature work must name its canonical owner in the PR or task notes.
2. New writes to legacy `hiring_requests` require explicit compatibility justification.
3. AI tools should not introduce new direct table writes when a domain helper exists.
4. Reporting must not combine old and new job counts without labeling or deduping.
5. Public/unauthenticated writes must set `org_id` explicitly.
