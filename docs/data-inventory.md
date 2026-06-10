# RecruiterStack Data Inventory

A map of every table the DB stores today, grouped by purpose, with the
cross-module links that make the unified-data story real — and the overlap
zones that need cleanup before they show up on the marketing site.

Written: 2026-06-10. **Re-run the queries in this doc whenever a migration
lands** so it stays accurate.

## TL;DR

- **67 tables** across **8 logical groups**.
- The canonical Person spine (`people`) connects ATS → HRIS → Payroll via FK
  chains that no single-vendor stack can replicate (this is the moat).
- **Seven overlap zones** exist — places where two or more tables map to the
  same product concept, or where one concept lives in multiple tables. These
  are the cleanup targets before refining homepage segmentation.

---

## 1. Category map

| # | Group | Tables | Count |
|---|---|---|---:|
| 1 | **Identity & org spine** | `people`, `users`, `org_members`, `org_settings`, `user_integrations`, `user_preferences` | 6 |
| 2 | **ATS — legacy lean model** | `candidates`, `candidate_tags`, `candidate_tasks`, `candidate_referrals`, `applications`, `application_events`, `hiring_requests`, `pipeline_stages`, `hiring_teams`, `hiring_team_members`, `scorecards`, `interviews`, `offers`, `matches`, `roles` | 15 |
| 3 | **ATS — canonical / requisition** *(mid-migration)* | `openings`, `jobs`, `job_openings`, `job_postings`, `departments`, `locations`, `compensation_bands` | 7 |
| 4 | **CRM** | `sequences`, `sequence_stages`, `sequence_enrollments`, `sequence_emails`, `leads`, `email_templates`, `email_drafts` | 7 |
| 5 | **HRIS** | `employee_profiles`, `employee_events`, `compensation_records`, `time_off_requests`, `onboarding_templates`, `onboarding_template_tasks`, `onboarding_plans`, `onboarding_tasks`, `hr_cases`, `hr_case_messages`, `hr_documents`, `leave_policies`, `holidays`, `okrs`, `okr_key_results` | 15 |
| 6 | **Payroll** | `payroll_runs`, `payslips`, `payroll_org_settings`, `employee_tax_declarations` | 4 |
| 7 | **Approvals (cross-module)** | `approvals`, `approval_chains`, `approval_chain_steps`, `approval_steps`, `approval_groups`, `approval_group_members`, `approval_audit_log` | 7 |
| 8 | **Workflow / infra** | `notifications`, `job_queue`, `webhook_subscriptions`, `webhook_deliveries`, `voice_calls`, `custom_field_definitions` | 6 |

> Type files are split: canonical-model interfaces live in
> `src/lib/types/requisitions.ts` (group 3); everything else lives in
> `src/lib/types/database.ts`. That split itself is part of the segmentation
> mess and will collapse once the canonical migration completes.

---

## 2. The cross-module spine

Every join in the analytics page (`/analytics/people`) and the payroll
compute orchestrator runs through one of these chains:

```
people                                    ← canonical Person (org-scoped)
  ↓                                       ↓
  candidates                              employee_profiles
  ↓                                       ↓
  applications  ───application_id──→  employee_profiles
                                          ↓ ↘
                          compensation_records  payslips
                                                  ↑
                                                payroll_runs

time_off_requests.employee_id → employee_profiles.id
  ↑
  payslips engine reads this for LWP deduction (the unified moat in code)
```

In words:

- `people` is the canonical identity — one row per real human per org.
- `candidates` (ATS) and `employee_profiles` (HRIS) both reference
  `people.id`. Same human, different role hats.
- `applications.candidate_id → candidates.id`. When `applications.status`
  flips to `'hired'`, a DB trigger (migration 047) creates the
  `employee_profile` row and stamps `application_id` on it. That's the
  apply→hire→employee bridge.
- `compensation_records.employee_id → employee_profiles.id`. Immutable
  history (one row per change).
- `payslips.employee_id → employee_profiles.id`,
  `payslips.run_id → payroll_runs.id`.
- `users` (Clerk auth identity) bridges into `employee_profiles.user_id`
  (migration 050) so the same human is correctly identified in `/me/*`
  self-service pages.

---

## 3. Seven overlap zones (the cleanup targets)

These are the seams in the schema where two or more tables / columns map
to one product concept. Each is a likely source of confusion on the
marketing site.

### Zone 1 — Person-like records (4 tables, 1 concept)

| Table | Purpose | Owner |
|---|---|---|
| `people` | Canonical Person spine (mig 046) | core |
| `candidates` | ATS person — anyone who applied or was sourced | ATS |
| `users` | Clerk auth identity, mirrored locally | core |
| `employee_profiles` | HRIS post-hire record | HRIS |

All four reference `people.id` (or should — older rows may not). One human
in your org might have rows in *all four* simultaneously: lead → candidate
→ employee with a Clerk login.

**Homepage angle:** "Person" is not a pillar of its own. It is the
substrate beneath ATS / CRM / HRIS. Don't list it as a feature; list what
the modules *do* with it.

### Zone 2 — Job-shaped tables (5 tables, mid-migration)

| Table | Purpose | Generation |
|---|---|---|
| `hiring_requests` | The lean ATS req | **Legacy (frozen)** |
| `openings` | A specific slot to fill | Canonical |
| `jobs` | Reusable role template | Canonical |
| `job_openings` | M:N join between `jobs` and `openings` | Canonical |
| `job_postings` | Public-facing posting (apply form lives off this) | Canonical |

Both worlds coexist in production. CLAUDE.md mandates new work goes
canonical; legacy is frozen. The `roles` table (group 2) is a sixth
job-flavored table; see Zone 4 below.

**Homepage angle:** show one feature ("Reqs" or "Jobs"), not five tables.

### Zone 3 — Email-shaped tables (3 tables, 3 distinct purposes)

| Table | Purpose |
|---|---|
| `email_templates` | Reusable bodies authored by the user |
| `email_drafts` | AI-generated drafts not yet sent |
| `sequence_emails` | Actually delivered emails inside CRM sequences |

Easy to read as one "Email" feature on a homepage; they're three different
flows.

**Homepage angle:** if you mention email at all, call out three behaviours
(template library, AI draft, outreach delivery) — or pick the most
distinctive (AI draft) and don't talk about the other two.

### Zone 4 — Role / job_title / position (3 places to define one thing)

| Where | Shape | Owner |
|---|---|---|
| `roles` table | `job_title` + `required_skills` + `salary_min/max` + `auto_advance_threshold` | **Legacy** |
| `hiring_requests.position_title` | Free text | Legacy |
| `jobs` | Canonical role template w/ FK relationships | Canonical |

This makes "what's the role?" a tax on every form that asks the question.
The `roles` table also overlaps `compensation_bands` (Zone 5) on
`salary_min/max`.

### Zone 5 — Compensation (5 places where pay lives)

| Where | Purpose | Legacy? |
|---|---|---|
| `compensation_records` | HRIS immutable history per employee | — |
| `compensation_bands` | Canonical per-role / per-location range | — |
| `offers.salary` | Point-in-time offer letter | — |
| `hiring_requests.salary_min/max` | Legacy text on the req | **Legacy** |
| `roles.salary_min/max` | Legacy on the role template | **Legacy** |

Three of these are legitimately different things (history, band, offer
snapshot). Two are legacy duplicates that go away with Zone 2's migration.

### Zone 6 — Departments (2 representations — FK vs free text)

| Where | Shape |
|---|---|
| `departments` table + `employee_profiles.department_id` (FK) | Canonical |
| `hiring_requests.department` (free text) | **Legacy** |

This is why the `/analytics/people` department filter works on cohort
cards (employees → FK) but does not yet work on app-side cards (apps →
text). Cleaning up Zone 2 (and joining apps to the canonical model) fixes
this.

### Zone 7 — "Onboarding" means two different things

| Concept | Where it lives | What it is |
|---|---|---|
| **HRIS onboarding** | `onboarding_templates`, `_template_tasks`, `_plans`, `_tasks` (4 tables) | Post-hire employee checklist (Day 1, Week 1, etc.) |
| **App onboarding** | `org_settings`, `user_preferences`, `org_members.onboarded_at` (no dedicated tables) | New-org / new-user sign-up wizard |

Same word, completely unrelated systems. On a marketing page,
"Onboarding" almost always means the *employee* one. Internally, people
sometimes mean the *signup wizard*.

---

## 4. Bonus oddities worth a look

- **`matches` table** (group 2) — likely the AI candidate↔job match scoring
  output, but its relationship to `applications.ai_score` is unclear.
  Possibly redundant; audit reads before removing.
- **`voice_calls` table** (group 8) — orphan-feeling. Powers the agentic
  phone-screener flow but isn't in the marketing-pillar story.
- **`custom_field_definitions`** — present, unclear how widely used. Grep
  reads before relying on it.
- **`approvals` engine** (group 7) — governs items across ATS *and* HRIS
  (offers, time-off, comp changes). On a homepage this could be sold as a
  feature of either; honest framing is "platform capability."
- **`leads` (group 4)** — populated from the marketing-site signup form,
  but has no admin UI in the app today. Worth deciding whether it's a real
  CRM feature or just a marketing form.

---

## 5. Suggested homepage pillars (derived from this map)

Stop trying to map tables to pillars one-to-one. Pillars are **what the
user does**, not what gets stored.

| Pillar | What it covers | Data it touches |
|---|---|---|
| **Recruit** | sourcing, sequences, candidates, applications, interviews, offers, scorecards | groups 2 + 3 + most of 4 |
| **Manage your team** | employee records, comp, time off, onboarding, OKRs, HR cases, documents | group 5 |
| **Pay your team** | payslips, tax | group 6 |
| **Run on agents** | copilot tool surface across all of the above | cross-cutting |
| **Unified data** | the moat — `apply → hired → joined → payslip` is one chain in one DB | cross-cutting |

The leftover concepts (approvals, notifications, integrations, voice) are
**capabilities**, not pillars — they support all four user activities and
shouldn't get their own homepage box.

---

## 6. How to keep this doc honest

When you add a migration:

1. Run `ls supabase/migrations/ | wc -l` — the count in the TL;DR should
   match.
2. Run `grep -E "^      [a-z_]+: \{\$" src/lib/types/database.ts | sed
   's/[: {]//g' | sort -u` — every new table should appear here.
3. If the new table covers a concept that overlaps an existing one, add
   it to the relevant zone in Section 3 *or* document why it's not an
   overlap.

Related docs:
- [`canonical-data-model.md`](./canonical-data-model.md) — target
  architecture and engineering rules for the mid-migration model.
- [`canonical-ownership-matrix.md`](./canonical-ownership-matrix.md) —
  per-route/table/tool migration status (run `npm run audit:canonical`
  to refresh).
- [`platform-modular-architecture.md`](./platform-modular-architecture.md)
  — modular monolith rationale; explains why `core` owns cross-module
  joins like the people-analytics domain.
