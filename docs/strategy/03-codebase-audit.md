# 03 — Codebase Audit (Cut-Throat Brutal)

> **Date:** 2026-05-28
> **Branch audited:** `canonical/people-foundation` (with uncommitted org_id safety fixes)
> **Size:** 29,398 LOC src/ • 138 API routes • 50 migrations • 44 copilot tools • 37 test files, 272 tests, ~15% coverage
> **Build status:** Green ✓ • Tests pass ✓ • Production: live at recruiterstack.in

This is the *no-corners-cut* audit. Every claim cites a path. Verdicts are deliberately uncomfortable; if it reads as harsh, that is the brief.

---

## 0. TL;DR — One paragraph

RecruiterStack is **well-intentioned, architecturally ambitious, operationally immature**. The core hiring loop works end-to-end. The canonical data-model migration is a *correct* and well-sequenced bet. The 5-persona AI surface is real, not vapor. But three load-bearing structures are cracking: (1) a 2,746-LOC copilot monolith that recapitulates Supabase access in every tool; (2) two parallel data models (`hiring_requests` legacy vs `jobs`/`openings` canonical) with no concrete migration path for in-flight data; (3) an AI cost-and-safety story that is one bad bulk-action away from a four-figure daily Anthropic bill. None of these are fatal today. All three will be at 100 paying orgs.

---

## 1. Repo Map

```
src/ (29,398 LOC)
├── app/                                    [13,637 LOC]
│   ├── api/                               [138 route.ts files]
│   │   ├── admin/                         approval chains, groups, custom fields
│   │   ├── agent/                         schedule-interview (AI agent callable)
│   │   ├── apply/                         public job application entry
│   │   ├── approvals/                     governance workflows
│   │   ├── candidates/                    CRUD + AI summary + tags/tasks
│   │   ├── copilot/                       44 agentic tools (single endpoint)
│   │   ├── hiring-requests/               LEGACY: frozen
│   │   ├── jobs/                          pipeline + scoring
│   │   ├── openings/                      canonical requisitions
│   │   ├── postings/                      job posting management
│   │   ├── req-jobs/                      canonical job pipelines
│   │   ├── schedule/                      public self-serve interview booking
│   │   ├── sequences/                     email campaign automation
│   │   ├── sourcing/                      CSV import + CV parsing
│   │   ├── webhooks/                      Clerk + Slack
│   │   └── [oauth, integrations, notifications, audit, …]
│   │
│   ├── (auth)/                            Clerk sign-in/up
│   ├── (dashboard)/                       Protected: candidates, jobs, pipeline, settings, HRIS
│   ├── (public)/                          Marketing: landing, pricing, features, blog
│   ├── apply/[token]/                     Public job application form
│   ├── intake/[token]/                    JD generation intake form
│   └── schedule/[token]/                  Public interview self-scheduling
│
├── lib/                                    [13,903 LOC]
│   ├── ai/                                job-scorer, jd-generator, autopilot, matcher
│   ├── api/                               cache, rate-limit, search, csv, job-queue
│   ├── approvals/                         engine, condition eval, notifications
│   ├── copilot-tools.ts                   ★ 2,746 LOC — 44 tools + executeTool
│   ├── auth.ts                            requireOrg, getOrgId, JWT handling
│   ├── crypto.ts                          AES-256-GCM token encryption
│   ├── supabase/                          server + browser clients
│   ├── types/database.ts                  Supabase-generated types
│   ├── validations/                       Zod schemas
│   └── [notifications, hooks, ui, logger, analytics, …]
│
├── modules/                                [1,521 LOC — new]
│   ├── ats/domain/                        candidates, applications, job-pipelines, openings, reporting, role-profiles
│   ├── core/domain/                       people.ts (new identity abstraction)
│   └── hris/domain/                       employees.ts (hire-to-employee lifecycle)
│
├── components/                            layout, forms, tables
├── middleware.ts                          Clerk auth routing
└── test/                                  Vitest setup + helpers
```

**Headline:** the codebase has a *clear architectural intent* but is mid-flight between two architectures. `src/lib/` is the old world. `src/modules/` is the new one. Both are alive. The current state is a compatibility bridge, not a final form.

---

## 2. API Route Inventory (138 routes)

| Domain | Routes (sample) | Maturity | Org-scoped | Rate-limited |
|---|---|---|---|---|
| ATS — Legacy | `hiring-requests/*` | Prototype (frozen) | ✓ | ✗ |
| ATS — Canonical | `req-jobs/*`, `openings/*`, `postings/*` | Functional | ✓ | ✗ |
| Applications | `applications/[id]`, email-draft, send-email | Functional | ✓ | ✗ |
| Candidates | `candidates/[id]`, ai-summary, tags, tasks, referrals | Functional | ✓ | ✗ |
| Interviews | `interviews/[id]` | Functional | ✓ | ✗ |
| Offers | `offers/[id]` | Functional | ✓ | ✗ |
| Copilot (AI) | `copilot/route` POST | Functional | ✓ | **✗ ← risk** |
| Approvals (HRIS) | `approvals/[id]`, inbox, steps, cancel | Functional | ✓ | ✗ |
| Employees (HRIS) | `employees/[id]`, events | Functional | ✓ | ✗ |
| Sequences | `sequences/[id]`, stages, analytics, process, enroll | Functional | ✓ | ✗ |
| Admin | approval-chains, groups, custom-fields, departments, locations, compensation-bands | Functional | ✓ | ✗ |
| Public (token) | `apply/route`, `schedule/[token]`, `intake/[token]` | Functional | ✓ (token) | **Apply only** |
| Integrations | google/*, microsoft/*, zoom/*, slack/* | Functional | ✓ | ✗ |
| Analytics / Export | analytics, export/candidates, export/applications, export/pipeline | Functional | ✓ | ✗ |
| Webhooks | clerk, slack/interactions, slack/install | Functional | header-based | ✗ |
| Job Queue / Cron | `queue/process` (Upstash), `sequences/process` | Functional | CRON_SECRET | ✗ |
| Settings & Utils | org-settings, user-preferences, me/profile, dashboard, notifications, audit-log, onboarding | Functional | ✓ | ✗ |

**Brutal observation:** out of 138 routes, **exactly one public endpoint is rate-limited** (`apply`). The copilot endpoint — the single most expensive thing in the system to call — has no rate limit. The `intake/[token]` and `schedule/[token]` public endpoints have no rate limit. Token-based access is HMAC-signed but predictable; nothing prevents replay or flood.

---

## 3. Migration Inventory — 50 migrations across 5 epochs

| Epoch | Range | What it built | Status |
|---|---|---|---|
| **Legacy ATS** | 001–030 | candidates, hiring_requests, pipeline_stages, applications, interviews, offers, scorecards, roles, leads, email templates, sequences | Frozen — compatibility only |
| **Org multi-tenancy** | 007 | `org_id` backfill across legacy tables | Applied (load-bearing) |
| **Users & HRIS foundation** | 032–041 | users, org_members, departments, locations, compensation_bands, user_integrations, onboarding_members | Applied |
| **Requisition / canonical** | 035–039 | jobs, openings, job_openings, job_postings, approval_*, custom_fields, webhooks | Applied (clean) |
| **Governance** | 036, 042–043 | approval_groups, OOO delegation, SLA breach tracking | Applied |
| **People & employee lifecycle** | 045–048 | candidate_email per-org unique, `people`, `employee_profiles`, `employee_events`, manager links | Applied (current branch) |

**~6,700 LOC of SQL.** Migration discipline is the *single best-executed thing in the repo*. Sequencing is clean, names are descriptive, each migration is scoped. No "fix migration N" patches found.

---

## 4. AI Layer

### 4.1 Copilot tools (`src/lib/copilot-tools.ts` — 2,746 LOC, 44 tools)

| Group | Tools | Storage path |
|---|---|---|
| Search & discovery | search_candidates, search_candidate_pool, find_stale_applications, list_jobs, get_job_pipeline | Direct Supabase |
| Pipeline | move_application_to_stage, bulk_move_to_stage, bulk_add_to_pipeline, update_application_status, update_candidate_status | Direct Supabase |
| Scoring | bulk_score_applications, bulk_reject_below_score, get_scorecard, create_scorecard | `scoreApplicationForJob` + direct |
| Job lifecycle | create_job_and_pipeline, update_job, list_jobs, get_job_pipeline, get_recruiting_analytics | Direct (legacy `hiring_requests`) |
| Candidates | create_candidate, update_candidate_status, get_candidate, get_application_events, add_note_to_application | Direct |
| Communication | send_outreach_email, draft_application_email | SendGrid + Haiku |
| Interviewing | schedule_interview, get_interviews, update_interview_status, create_self_schedule_invite | Direct + Google/MS/Zoom |
| Offers | create_offer, update_offer_status, get_offers | Direct |
| Intake & assessment | create_intake_request, send_assessment | Direct |
| Approval | request_approval | `src/lib/approvals/engine.ts` ✓ |
| Roles | list_roles, create_role, update_role | Direct |
| Analytics | get_dashboard_stats, get_recruiting_analytics | Aggregation queries |
| **HRIS (new)** | list_employees, mark_employee_joined, mark_employee_terminated, get_employee_history, set_employee_manager, record_employee_note | **`src/modules/hris/domain/employees.ts` ✓** |

**Single biggest tech-debt time-bomb in the entire codebase.** This file is *2,746 LOC of inline Supabase queries indexed by tool name*. Every tool re-implements `from('table').select(…).eq('org_id', …)`. Any storage rename ripples through ~20 tools. There is no domain layer between the agent and the database for the ATS surface — only the new HRIS tools call a facade. Decomposing this file is the precondition for *every* other agentic improvement.

### 4.2 The 5 AI personas

| Persona | Flow | Model | Cost/op | Maturity | Gap |
|---|---|---|---|---|---|
| **Drafter** | `/intake/[token]` → `/api/intake/[token]/generate-jd` → `lib/ai/jd-generator.ts` | Sonnet | ~$0.03 / JD | **90 %** | No version history, no multi-turn refinement |
| **Scout** | `/api/sourcing/import` → Haiku CSV parse | Haiku | ~$0.001 / row | **70 %** | No skill extraction, no semantic matching |
| **Sifter** | `/api/jobs/[id]/score` (bulk SSE) → Haiku scores | Haiku | ~$0.001 / app | **85 %** | No feedback loop from interviewer scorecard → rubric |
| **Scheduler** | `/schedule/[token]` self-serve + `/api/agent/schedule-interview` | Sonnet | ~$0.01 / event | **75 %** | No timezone-aware re-optimization on conflict |
| **Closer** | `/api/applications/[id]/email-draft` → Haiku | Haiku | ~$0.001 / draft | **50 %** | Drafts only; no offer approval workflow, no negotiation loop |

**Brutal observation:** none of these have:
- Cumulative spend caps (per org, per day)
- Fallback models if Anthropic is down
- Token-budget enforcement per tool call
- Conversation memory across copilot turns (each request is amnesiac)
- Persistent task-state tracking (SSE drop = silent loss)

The persona narrative is honest *as far as it goes*. As a public product story it is no longer differentiating (every ATS now says "5 AI agents"). See [01-competitive-intel.md](./01-competitive-intel.md) §1 and [02-whitespace-and-icp.md](./02-whitespace-and-icp.md) §3.

---

## 5. Domain Facade Coverage (`src/modules/`)

| Module | Files | LOC | Used by copilot? | Verdict |
|---|---|---|---|---|
| `ats/domain` | candidates(84), applications(66), job-pipelines(593), openings(21), reporting(131), role-profiles(182) | ~1,077 | Partial — `job-pipelines.ts` bridges legacy↔canonical; candidates/applications are stubs | **Incomplete migration** |
| `core/domain` | people(114) | 114 | Not yet | **Newly added — Slice 1** |
| `hris/domain` | employees(236) | 236 | Yes — HRIS tools use it | **Well-integrated** |

**Reality check.** Of the 44 copilot tools, only the 6 HRIS tools talk to a domain facade. The ATS surface (38 tools) still talks directly to Supabase. The facade work is ~40% done — `job-pipelines.ts` is the only meaty bridge; `candidates.ts` and `applications.ts` are essentially TODOs with one function each. The whole canonical-completion-plan hinges on closing this gap.

---

## 6. Canonical Migration Status

### 6.1 `npm run audit:canonical` output (verbatim)

```
Summary:
- mixed: 0           ✓ (no files mixing legacy + canonical work)
- legacy: 7          (intentionally frozen)
- adapter: 0
- compatibility: 21  (bridged, moving toward canonical)
- canonical: 20      (requisition/HRIS/employee workflows)
```

### 6.2 Files by status

**Legacy (7, frozen):**
1. `src/app/api/hiring-requests/[id]/route.ts`
2. `src/app/api/hiring-requests/route.ts`
3. `src/app/api/intake/[token]/approve/route.ts`
4. `src/app/api/intake/[token]/generate-jd/route.ts`
5. `src/app/api/intake/[token]/route.ts`
6. `src/lib/api/job-handlers.ts`
7. `src/lib/copilot-tools.ts` ← *the elephant*

**Canonical (20):**
- All `/api/req-jobs/*`, `/api/openings/*`, `/api/postings/*`
- `src/lib/approvals/engine.ts`, `notifications.ts`, `approver-resolver.ts`

**Compatibility (21):**
- All `/api/applications/*`, `/api/candidates/*`, `/api/interviews/*`, `/api/offers/*`
- Most of `/api/jobs/[id]/score`, `/api/jobs/[id]/stages`
- `src/lib/ai/autopilot.ts`

### 6.3 Uncommitted safety fix

```diff
src/app/api/jobs/[id]/stages/route.ts
+ .eq('org_id', orgId)   // 3 new assertions in POST handlers
```

**This is the single most important diff in the working tree.** Pipeline-stage POST handlers were not org-scoped. The fix is targeted and correct. It must ship. The fact that it sat uncommitted on a branch is also evidence that a multi-tenancy linting/CI guard is *missing*.

### 6.4 Slice progress vs [`docs/canonical-completion-plan.md`](../canonical-completion-plan.md)

| Slice | Goal | Status |
|---|---|---|
| **0** — candidate email uniqueness per org | `045_candidate_email_per_org.sql` | ✓ Applied |
| **1** — people table + identity split | `046_people.sql` + `core/domain/people.ts` | ✓ Applied |
| **2** — domain facades for agent surface | `ats/domain/*` filled in | **~40% done — biggest open work** |
| **3** — applications → jobs forward link | `047_employee_profiles.sql` adds `job_id` col | ✓ Applied (untested in agent path) |
| **4** — employee lifecycle | `048_employee_events_and_manager.sql` + `hris/domain/employees.ts` | ✓ Applied |
| **5** — audit guard + enforcement | pre-commit / CI integration of `audit:canonical` | **Not started** |

**Verdict:** Slices 0, 1, 3, 4 = applied. Slice 2 is the choke-point. Slice 5 is missing — meaning the audit script exists but nothing prevents regression. Add a pre-commit hook and a CI check; without those, the score will drift back down on the next "quick fix."

---

## 7. Test Coverage

| Category | Files | Tests | Focus | Verdict |
|---|---|---|---|---|
| API routes | 15 | ~140 | candidates, apply, offers, copilot, roles, depts, openings, applications, interviews, notifications, scorecards, webhooks/clerk, email-templates, leads | **Decent** |
| Lib helpers | 12 | ~80 | auth, crypto, cache, rate-limit (×2), search, CSV, job-queue, helpers, oauth-state, background | **Decent** |
| Validations | 3 | ~20 | candidates, hiring-requests, applications | **Good** |
| Domain | 2 | ~10 | approvals engine | **Sparse** |
| Onboarding | 1 | ~10 | step progression | **Sparse** |
| Integrations | 2 | ~12 | user integration store, host resolver | **Minimal** |

**~272 tests, ~5.65s runtime, all green. Estimated coverage ~15%.**

**Gaps that will hurt:**
- **Zero AI tests.** `job-scorer`, `jd-generator`, `autopilot` are entirely untested. Refactoring the scorer is a coin flip.
- **Zero end-to-end tests.** The full apply→score→advance→hire flow is never exercised in CI.
- **Zero React/component tests.** Every UI change is a YOLO.
- **Zero migration tests.** Schema correctness depends on Postgres accepting the migration; no semantic checks.
- **Zero load tests.** No baseline for p95 latency at any RPS.

For a product with a paying customer footprint, **15% coverage is the largest single barrier to confident refactoring**. Slice 2 cannot be done safely without a test floor.

---

## 8. Per-Area Verdicts

### A. Candidate management
*Functional · decent tests · medium debt · ~40% migrated · medium risk.* `ai-summary` is doing too much; no concurrency dedup; 30s Vercel timeout silently truncates long summaries.

### B. Applications & pipeline
*Functional · decent tests · **high** debt · ~50% migrated · **high** risk.* No idempotency on bulk score; SSE drops = silent progress loss; the uncommitted `org_id` fix proves the boundary is fragile.

### C. Hiring-requests (legacy)
*Prototype · decent tests · max debt · 0% migrated · low risk because frozen.* Will accumulate stale data; no backfill plan to canonical `jobs`.

### D. Requisition / jobs / openings (canonical)
*Functional · good tests · **low** debt · 85% migrated · low risk.* Cleanest area in the repo. `job_openings` join, `openings`/`jobs`/`job_postings` separation is *correct*. Problem: almost no traffic flows through it yet — it's a well-built road with no cars.

### E. Copilot & AI tools
*Functional / prototype · **zero** tests · **critical** debt · 20% migrated · **critical** risk.* Already covered in §4. The single biggest concentration of risk in the codebase.

### F. Integrations (Google / MS / Zoom / Slack)
*Functional · zero tests · medium debt · 0% migrated · medium risk.* OAuth tokens are *conditionally* encrypted — if `TOKEN_ENCRYPTION_KEY` is not set, tokens persist in plaintext. There is no startup validation. Slack signing verification on `/api/slack/interactions` is missing. No refresh-token rotation.

### G. Approvals & governance
*Functional · good tests · low debt · 80% migrated · low risk.* Best-architected feature in the repo. Engine cleanly separates condition eval, next-block logic, notifications. SLA breach tracking exists. Only gap: no escalation when an approver is OOO without delegation set.

### H. HRIS & employees
*Functional · zero tests · low debt · 95% migrated · low risk.* Timeline + reports-to + employee detail in the last commit. The HRIS module is *the proof that the canonical approach works* — clean facade, agent tools that call the facade, ergonomic.

### I. Sequences & automation
*Functional · zero tests · low debt · 50% migrated · low risk.* Solid logic. Single dependency on Upstash — if Upstash is down, sequences hang silently.

### J. Public routes (apply / intake / schedule)
*Functional · good apply tests · medium debt · 10% migrated · medium risk.* Apply is rate-limited (10 / 60s / IP); intake and schedule are not. Token-based access is signed but predictable — same token can be replayed.

---

## 9. Top 10 Risks (Impact × Likelihood)

| # | Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|---|
| 1 | **Unbounded AI token spend on bulk operations** | Critical ($1,000s/day possible) | High (any `bulk_score_applications` on a large pool) | Add per-call cap (≤100 items), per-org daily $ ceiling, per-tool cost log + alerts |
| 2 | **Multi-tenant leak in `pipeline_stages`** | Critical | Medium (UI doesn't trigger it; agent can) | **Ship the uncommitted `org_id` fix immediately** + add a CI assertion |
| 3 | Copilot prompt injection via job/candidate descriptions | High | Medium | Sanitize agent context; verify XML-tag wrapping; refuse instructions inside data fields |
| 4 | OAuth tokens in plaintext when `TOKEN_ENCRYPTION_KEY` missing | High | Medium (silent operator omission) | Hard-fail at startup if integrations are enabled and key is absent |
| 5 | No idempotency on bulk ops (score / move / reject) | High | High (any double-click) | Idempotency keys (UUID) on bulk endpoints |
| 6 | Copilot endpoint has no rate limit | High | Medium | Apply `checkAuthRateLimit` to `/api/copilot` (per org + per user) |
| 7 | SSE progress drops are silent | High | Medium | Persistent `bulk_job` status row; poll for completion |
| 8 | Async tasks (autopilot, ai_summary, sequences) have no DLQ | Medium | High | Unify on the job queue; add retries + DLQ + monitoring |
| 9 | Candidate email globally unique → cross-org visibility | Medium | Low (slice 0 applied) | Confirm `045_candidate_email_per_org.sql` is deployed |
| 10 | Slack signing verification missing | Medium | Low | Verify `x-slack-signature` on `/api/slack/interactions` |

---

## 10. Top 10 Tech-Debt Items (Pain ÷ Cost-to-Fix)

| # | Item | Where | Pain | Effort | Payoff |
|---|---|---|---|---|---|
| 1 | **Copilot monolith (2,746 LOC, 44 tools)** | `src/lib/copilot-tools.ts` | Critical | 2–3 sprints | Massive — unblocks per-module agents, fixes 20+ direct table accesses |
| 2 | Candidates / applications facades are stubs | `src/modules/ats/domain/{candidates,applications}.ts` | High | 1 sprint | High — decouples copilot from schema |
| 3 | Two data models in parallel; no backfill plan | `hiring_requests` ↔ `jobs`/`openings` | High | 2–3 sprints | High — single source of truth |
| 4 | No idempotency on bulk endpoints | `/api/jobs/[id]/score`, move, reject | High | 2–3 days | Medium |
| 5 | Async task tracking is fragmented (`enqueue` vs `runInBackground`) | `lib/api/background.ts`, `lib/api/job-queue.ts` | High | 1 sprint | High — SLA + retry |
| 6 | Zero React/component tests | `app/(dashboard)/**`, `components/**` | High | 3–4 sprints | Medium |
| 7 | Conditional OAuth encryption | `app/api/schedule/**`, `app/api/availability/**` | Medium | 1–2 days | Medium |
| 8 | AI model identifiers hardcoded; no fallback | `lib/ai/*.ts` | Medium | 2–3 days | Low |
| 9 | Single point of failure on Upstash for queue | `sequences/process`, `queue/process` | Medium | 2–3 sprints | Low |
| 10 | ~15% test coverage; AI/E2E/component all zero | repo-wide | Medium | 4–6 sprints | High — enables confident refactor |

---

## 11. Kill / Pivot / Double-down

### Kill
- **The "5 AI agents" headline** as primary positioning. Every competitor now claims this. Keep the *implementation*, change the *narrative*. See [02-whitespace-and-icp.md](./02-whitespace-and-icp.md) §3.
- **Standalone Zoom integration depth** beyond basic meeting-link creation. ROI is low compared to Google/Outlook.
- **Manual UI polish for the legacy `hiring_requests` admin views.** Spend zero hours improving the legacy admin.

### Pivot
- **Copilot tool definitions** from one monolith to per-module tool exports. Each `src/modules/<mod>/agent/tools.ts` exports its tool set; an orchestrator composes them at request time. This is the prerequisite for compliance and cost gates being implementable.
- **Job queue strategy** from Upstash-only to **Postgres-as-primary + Upstash-as-fast-path**. Postgres is already the SoR; the queue becoming a Postgres table eliminates the single point of failure.
- **Scoring feedback loop.** Compare AI scores to interviewer scorecards post-hoc; surface deltas as rubric drift; feed deltas back into prompt weights. This is the only feature where the more it's used, the better it gets — exactly what a moat needs.

### Double-down
- **Canonical data-model migration.** Finish Slice 2 (facades) and Slice 5 (CI guard) before *anything else*.
- **Multi-tenancy as an automated invariant.** Pre-commit hook running `audit:canonical`; CI assertion that every Supabase query in a protected route has `org_id` in scope; periodic data audit comparing `org_id` cardinality.
- **Approval-engine + audit-log.** Already the best-architected feature; it is also the spine of a compliance story (DPDP, EU AI Act, LL144). Make this the *flagship* surface.
- **HRIS module pattern** as the *template* for every future module. The pattern (`modules/<mod>/{domain,agent,api}`) is right; replicate it.

---

## 12. Summary Verdicts

| Dimension | Verdict |
|---|---|
| Codebase maturity | **Functional but fragile.** Core flows work; cohesion is weak. |
| Test coverage | **Sparse (~15%).** No AI, no E2E, no component tests. Refactoring is risky. |
| Multi-tenancy isolation | **Right design, partial execution.** Audit-guard is missing. |
| Tech debt | **High** — concentrated in the copilot monolith and the incomplete facades. |
| AI safety & cost control | **Dangerous.** No spend caps, no rate limit on copilot, no fallbacks. |
| Canonical migration | **~50% done.** Slice 2 is the choke-point; Slice 5 is missing. |
| Production readiness | **Yellow.** Handles ~100 orgs; will crack at 1,000. |
| Strategic positioning of the code | **Strong architecturally, weak narratively** — see strategy docs [02](./02-whitespace-and-icp.md) and [04](./04-roadmap-2yr.md). |

---

## 13. The Single Biggest Tech-Debt Time-Bomb

**`src/lib/copilot-tools.ts` — 2,746 LOC, 44 tools, no facade, no tests, no cost gate, no rate limit.**

Every storage change ripples here. Every new persona requires editing it. Every safety control (rate limit, spend cap, audit log, redaction) must be re-added 44 times. The next 12 months of product velocity are gated on decomposing this file.

**Cost to decompose:** 2–3 sprints if Slice 2 facades land first.
**Cost to *not* decompose:** every other strategic move becomes 5–10× harder.

This is *the* decision the 2-year plan must front-load. See [04-roadmap-2yr.md](./04-roadmap-2yr.md) §Q1.

---

*End of audit.*
