# Canonical Jobs Collapse — Build Plan (nav roadmap Phase 3)

Make canonical `jobs` the single, candidate-bearing recruiting pipeline and
retire the legacy `hiring_requests` board. See `nav-consolidation-roadmap.md`
(Phase 3) and `canonical-data-model.md`.

**Strategy (decided 2026-06-18): wipe & canonical-first, big-bang.** The legacy
`hiring_requests` candidates/pipelines are disposable test data, so we do NOT
build a `hiring_requests → jobs` converter. We build the canonical pipeline, then
in one cutover: wipe legacy data + flip the nav + delete the legacy surfaces.
(Production DB; take a Supabase snapshot before the wipe.)

## End state
- Apply / intake / job-creation all produce canonical `jobs` (+ `openings`),
  with `applications.job_id` set and a job-keyed stages model.
- The "Jobs" nav entry is the canonical board (candidates move through stages,
  interviews/offers/scoring all attach via `application_id`).
- `/jobs` (legacy `hiring_requests`) and `/hiring-requests` are deleted; the
  intake/hiring_requests routes leave the drift-guard allowlist.
- IA: keep **Openings** (requisition/approval) + a single canonical **Jobs**
  pipeline. Whether to fold Openings *into* Jobs is a final C6 nav decision.

## Slices

| # | Slice | Type | Summary |
| --- | --- | --- | --- |
| **C1** | Canonical job stages | schema + code | Generalize `pipeline_stages` to belong to a `job_id` OR a `hiring_request_id` (relax NOT NULL, add CHECK exactly-one); trigger seeds 6 default stages on `jobs` insert (mirrors the legacy trigger). Domain helper to read a job's stages. |
| **C2** | Relax candidacy anchors | schema | `applications.hiring_request_id`, `interviews.hiring_request_id`, `offers.hiring_request_id` → nullable, so a canonical-job candidacy needs no `hiring_request`. (`applications.job_id`/`opening_id` already exist; interviews/offers already carry `application_id`.) |
| **C3** | Create-side → canonical | code | Job creation (UI + `/api/req-jobs` already canonical; retire the legacy create path), public apply (`/api/apply` + posting tokens) and intake re-pointed to create canonical `jobs`/`openings` + `applications.job_id` (+ default stages). `createApplication` already dual-writes `job_id`. |
| **C4** | Canonical pipeline board + reads | code | The Jobs board (kanban/detail) reads canonical `jobs` + applications-by-`job_id` + job stages. Repoint `job-pipelines` domain reads; confirm scoring/autopilot, scorecards, interviews, offers operate on canonical applications. |
| **C5** | Agent + analytics → canonical | code | Repoint copilot job tools (`list_jobs`/`get_job_pipeline`/`create_job_and_pipeline`/…) and dashboard/analytics off the legacy facade onto canonical jobs. |
| **C6** | Cutover | data + nav | Snapshot → wipe legacy data → flip the "Jobs" nav entry to canonical → delete `/jobs` + `/hiring-requests` → drop the intake/hiring_requests rows from the drift-guard allowlist → decide the Openings-fold. |

## Sequencing
C1 + C2 (schema) first — additive/reversible. Then C3 → C4 → C5 (code, build
the canonical pipeline alongside legacy; dummy data means no dual-run needed).
C6 last (the one-shot cutover). Each slice: `tsc` + tests + build + drift guard,
plus a manual smoke of apply → board → score → interview → offer on canonical.

## Guardrails
- **Snapshot before the C6 wipe.** Reversible to that point.
- Schema migrations are additive (relax constraints / add columns) — no drops
  until C6.
- Migrations are authored here and **run by Sagar on Supabase**; code deploys
  only after its migration is applied (or is defensively column-guarded).
