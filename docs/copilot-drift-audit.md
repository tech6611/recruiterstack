# Copilot ⇄ Product Drift Audit

_Date: 2026-06-30. Method: five parallel code analysts, each comparing one slice of
`src/lib/copilot-tools.ts` (75 tools) against the current product (API routes + domain
facades). Evidence cited as `file:line` in each section below._

## Verdict

The copilot is roughly **one product-generation behind**. It was last seriously touched
before the canonical-jobs collapse and the job-lifecycle redesign. The damage falls in
four buckets:

1. **Silently broken** — tools that look fine but, on today's data, return empty results,
   "Unknown job", or an error. ~7 tools. **Most dangerous** — the chatbot confidently
   gives wrong answers.
2. **Stale** — tools that run but use the old status vocabulary or skip new workflow
   steps. ~16 tools.
3. **In sync** — ~50 tools, mostly HRIS reads, offers, WhatsApp, roles, sequences.
4. **Missing** — whole product capabilities the chatbot can't reach at all (openings,
   job lifecycle, sourcing/Scout, approvals, leads, screening, HR cases, payroll run…).

Almost all the *breakage* traces to **three root causes**, so the fixes cluster nicely.

---

## Root cause #1 — copilot still speaks "hiring_requests", product moved to canonical "jobs"

The legacy `hiring_requests` table is retired/empty, but several copilot facades still
filter `hiring_request_id` or join `hiring_requests`. Pipelines now key off canonical
`jobs.id` (`api/apply/route.ts:116-119`). Result:

| tool | effect | evidence |
|---|---|---|
| `bulk_add_to_pipeline` | ❌ writes the canonical job id into `hiring_request_id` (wrong column); dedup never matches | `applications.ts:253-288` |
| `bulk_score_applications` | ❌ filters `hiring_request_id = <canonical id>` → 0 rows → "No unscored applications" | `applications.ts:298-317` |
| `bulk_reject_below_score` | ❌ same filter → 0 rows → "No applications below X" | `applications.ts:451-472` |
| `get_recruiting_analytics` | ❌ reads retired `hiring_requests` → empty/stale funnel (a canonical reader already exists in the same file, unused) | `reporting.ts:6-13` vs `:45+` |
| `get_inbox` | ❌ joins `hiring_requests` for job title → null/"Unknown" | `copilot-tools.ts:2482` |
| `search_candidates`, `get_candidate`, `move_application_to_stage`, `find_stale_applications` | ⚠️ work, but show "Unknown job" because the job-title label comes from `hiring_requests` | `applications.ts:89-103,165-186` |

**One pivot (`hiring_request_id` → `job_id`) un-breaks the three bulk tools and removes the
"Unknown job" cosmetic drift everywhere.**

## Root cause #2 — references to a `candidates.full_name` column that never existed

Real column is `candidates.name` (`migrations/001:40`). Three places select `full_name`,
which makes PostgREST error out:

| tool | effect | evidence |
|---|---|---|
| `create_scorecard` | ❌ existence check errors → always returns "Application not found" | `applications.ts:524-542` |
| `get_inbox` | ❌ compounds with root cause #1 | `applications.ts:500` |
| `draft_application_email` | ❌ errors on candidate lookup | `applications.ts:547-570` |

## Root cause #3 — stale status vocabulary

- **Jobs:** real `JobStatus` = `draft, pending_approval, approved, open, paused,
  withdrawn, closed, archived` (`requisitions.ts:216-224`). Copilot still uses legacy
  `intake_pending…jd_approved…posted`:
  - `list_jobs` status filter matches nothing → silent empty list (`copilot-tools.ts:190-203`).
  - `update_job` description tells the agent to write `'posted'`/`'paused'` directly — `'posted'`
    isn't a valid status (writes garbage), and `'paused'`/withdrawn skip the real cascades
    (unpublish postings, clear apply token, re-approval gate) in `req-jobs/[id]/{pause,withdraw}`.
- **Candidates & applications:** both enums now include `on_hold` (`database.ts:78,853`),
  which the copilot can neither set nor filter by. `update_candidate_status` /
  `update_application_status` omit it (`copilot-tools.ts:467,488`).

---

## Stale-but-working (beyond status vocab)

- `create_job_and_pipeline` — silently discards `hiring_manager_name, location, headcount,
  department, level, nice_to_haves, remote_ok` (only title+description persist), and jumps a
  job straight to `open`, bypassing the whole submit→approve→publish lifecycle
  (`copilot-tools.ts:1720-1723`; `job-pipelines.ts:645-666`).
- `schedule_interview` — **biggest behavioral gap in its slice.** Product scheduling creates
  the real Google Meet / Zoom / Teams meeting and fires notifications
  (`api/interviews/route.ts:116-220`); the copilot facade just inserts a bare DB row — no
  meeting link, no calendar event, no notification. Missing inputs: `interviewer_email`,
  `meeting_platform`, `panel[]`, `host_email`, `timezone`, `stage_id`.
- `create_self_schedule_invite` — creates an invite with an empty `panel`, so the candidate's
  self-schedule page shows no availability (`api/schedule/[token]/route.ts:60`).
- `send_outreach_email` — bypasses the saved `email_templates` system and reply-to threading.
- `request_approval` — a stub: returns a `CHECKPOINT:` string, never touches the real
  approval engine (`copilot-tools.ts:1294-1295`).
- `send_assessment` — description oversells; there is no assessment feature, it only writes a
  timeline event.

---

## Missing capabilities (whole flows/modules with NO chatbot tool)

**Recruiting / ATS**
- **Openings / requisitions** — create, submit-for-approval, list, get; link/unlink to a job
  (`api/openings/*`, `api/req-jobs/[id]/link-opening`). The canonical requisition spine is
  entirely unreachable. _(This was the original ask.)_
- **Job lifecycle** — submit, publish, pause, resume, withdraw, clone ("New version")
  (`api/req-jobs/[id]/*`). The headline redesign — zero coverage.
- **Postings** — publish/unpublish to careers page / boards (`api/postings/*`).
- **Screening questions + EEO / application form** (`api/jobs/[id]/screening`, `screening.ts`).
- **Sourcing / Scout** — CSV import, parse-CV, parse-profile, parse-drive-url
  (`api/sourcing/*`). A *marketed* AI agent, unreachable from chat.
- **Candidate–role matching** (`api/matches`, `lib/ai/matcher.ts`).
- **Candidate tags & tasks** (`api/candidates/[id]/{tags,tasks}`).
- **Candidate AI summary** (`api/candidates/[id]/ai-summary`).
- **Application review status** triage — `unreviewed|reviewed|yes|no|maybe` (`database.ts:851`).
- **Weighted scoring + autopilot config** — the real engine is `api/jobs/[id]/score`
  (criteria, `ai_criterion_scores`, auto-advance/auto-reject). The copilot's `bulk_score`
  is a thinner, now-broken parallel path.
- **Pipeline-stage edits** — add/rename/reorder (`api/jobs/[id]/stages`).

**Approvals** — the chatbot can't list pending approvals, approve/reject/cancel, or report
status. Full engine + routes exist (`approvals/engine.ts`, `api/approvals/*`); copilot has
only the stub above.

**HRIS / Payroll** (existing read tools are all in sync; gaps are write/whole-module):
- **Run payroll** — create/compute/finalize a run, adjust payslips (`api/payroll/runs/*`).
- **Tax declarations & regime** (`api/payroll/employees/[id]/{declarations,regime}`).
- **Payroll settings** (`api/payroll/settings`).
- **HR Cases (employee help-desk)** — entire module, zero tools (`hris/cases/*`, `cases.ts`).
- **Employee profile edits** beyond lifecycle (e.g. DOB), **leave policies**, **holiday
  add/delete**, **onboarding template authoring**, **full org chart**, **org-wide time-off
  approval queue**.

**CRM / platform**
- **Leads** — the CRM front door (`api/leads`), unreachable despite the orchestrator
  advertising a "lead → candidate → hire" story.
- **Enrollments** — read-only; can't enroll/unenroll a candidate in a sequence.
- **Team / per-member RBAC admin** (`api/team`), **email templates**, **comp bands**,
  **departments**, **locations**, **notifications**, **org-settings**, **audit-log**.

_(Correctly excluded as internal/infra: webhooks, queue, debug-\*, parse-document, me,
user-preferences, agent, and OAuth callbacks.)_

---

## Cross-cutting issues

- **No acting user (`userId`) threaded through the copilot.** `executeTool(name, input,
  orgId, supabase, capabilities?)` carries org but not the user
  (`copilot-tools.ts:1259-1267`; `sub-agent.ts:68`; `orchestrator.ts:134-141`). So writes
  land with a null/system actor, and approval tools (which need `requesterId`/`userId`)
  can't be called correctly. **Must be fixed before openings/approvals tools can work.**
- **RBAC holes** — `schedule_interview`, `update_interview_status`, `get_interviews` are
  missing from `TOOL_CAPABILITIES`, so they run ungated (a view-only user can schedule/cancel
  interviews via chat). `request_time_off` is gated by `leave:view` (a *read* cap) and resolves
  employees by email, letting a viewer file time-off for anyone.
- **Permission vocabulary is ahead of the tools** — `permissions.ts` defines
  `openings:*`, `hr_cases:*`, `approvals:*`, `settings:*`, `compliance:view`,
  `documents:edit`, `leave:edit` — none used by any tool. They map 1:1 to the missing
  modules above.

---

## Suggested remediation sequence

- **Phase 0 — Stop the bleeding (small, high-impact).** Fix the silently-broken tools:
  pivot `hiring_request_id` → `job_id` (root cause #1), fix `full_name` → `name` (root cause
  #2), repoint analytics/inbox to canonical. Restores correctness with no new surface area.
- **Phase 1 — De-stale.** Refresh job-status enum + `update_job` to route lifecycle changes
  through `req-jobs/[id]/{submit,publish,pause,resume,withdraw}`; add `on_hold` to candidate/
  application status tools. Fix the 3 RBAC holes.
- **Phase 2 — Openings + lifecycle (the original ask).** Thread `userId`; add a `createOpening`
  /`submitOpeningForApproval` facade; add opening + job-lifecycle + lookup tools.
- **Phase 3 — Reconnect marketed pillars.** Sourcing/Scout import, approvals tool family,
  screening, matches, tags/tasks.
- **Phase 4 — Breadth.** Payroll run/tax, HR cases, email templates, team/RBAC, leads, etc.
