# Platform Architecture: One Suite, Many Modules, One Brain

How RecruiterStack grows from "AI ATS" into a unified **ATS + CRM + HRIS +
Payroll** suite — without losing the thing that makes it different.

## The non-negotiable principle

RecruiterStack's entire differentiator is **unified data across the
person lifecycle** (lead → candidate → employee → alumni), so a recruiter/HR
team stops stitching together separate ATS, CRM, HRIS, and payroll tools. We
proved this is buildable with the canonical `people` spine.

> **Therefore: separate the modules, never the data.**

The competition *is* the fragmentation: Greenhouse (ATS) hands off to Workday
(HRIS) which hands off to ADP (payroll), connected by brittle integrations.
If we split into separate repos with separate databases, we rebuild that exact
fragmentation internally and become a worse version of the incumbents. The whole
product is that the person's record never has to be copied across a boundary.

## Decision: modular monolith on one canonical database

**Chosen (2026-05-25):** a **modular monolith** — one repository, one deployable,
one Postgres database — with strict internal module boundaries. **Not** polyrepo,
**not** microservices, **not** per-module databases.

Why this, for a solo founder building a unified-data product:

| Concern | Modular monolith (chosen) | Polyrepo / microservices (rejected for now) |
| --- | --- | --- |
| Unified data | One DB, one `people` spine. Cross-module = a function call. | Data split across DBs; cross-module = an integration/sync (the problem we sell against). |
| Ops load (1 person) | One deploy, one CI, one migration history, one auth. | N deploys, N CIs, cross-repo versioning, distributed transactions, network failure modes. |
| Cross-module workflows ("hire → onboard → first payroll") | In-process, transactional. | Distributed saga, eventual consistency, partial-failure handling. |
| Refactoring across modules | Compiler catches breakage. | Breaks silently across repo/version boundaries. |
| Speed to ship modules | High. | Low (infra tax per module). |

**Modules give ~90% of the "separation" benefit** (clear ownership, focused
agents, independent feature work) **without the distributed-systems tax.** This
is the path Shopify, GitHub, and most successful SaaS ran well past our stage.

**We earn the split later, not now.** Clean module boundaries make extracting a
module into its own service a *refactor, not a rewrite* — to be done only when a
real forcing function appears (see "When to extract a service" below).

## The modules (mapped onto the canonical model we already built)

```
                       ┌─────────────────────────────────────────┐
                       │                CORE                       │
                       │  people (identity spine) · orgs · users   │
                       │  departments · locations · custom fields  │
                       │  approvals · notifications · auth         │
                       │  (depends on nothing; everything needs it)│
                       └─────────────────────────────────────────┘
                          ▲          ▲           ▲           ▲
            ┌─────────────┘   ┌──────┘     ┌─────┘      ┌────┘
      ┌───────────┐    ┌───────────┐  ┌───────────┐  ┌───────────┐
      │    CRM     │   │    ATS     │  │   HRIS     │  │  PAYROLL   │
      │ relationships│ │ recruiting │  │ employment │  │  pay/tax   │
      ├───────────┤    ├───────────┤  ├───────────┤  ├───────────┤
      │ leads      │   │ openings   │  │ employee_  │  │ pay_runs   │
      │ talent_    │   │ jobs       │  │  profiles  │  │ salaries   │
      │  pools     │   │ postings   │  │ employment_│  │ tax_info   │
      │ sequences  │   │ applications│ │  history   │  │ benefits   │
      │ sourcing   │   │ candidates │  │ org_chart  │  │            │
      │ outreach   │   │ (profile)  │  │ time_off   │  │            │
      │            │   │ pipeline   │  │ documents  │  │            │
      │            │   │ interviews │  │            │  │            │
      │            │   │ offers     │  │            │  │            │
      │            │   │ scoring/   │  │            │  │            │
      │            │   │  autopilot │  │            │  │            │
      └───────────┘    └───────────┘  └───────────┘  └───────────┘
```

- **Core** — the shared kernel. The `people` table is the identity spine; one
  person can simultaneously be a CRM lead, an ATS candidate, and an HRIS
  employee. That single-record-many-roles is the unified product.
- **ATS (Recruiting)** — what exists today (openings, jobs, applications,
  candidates-as-profile, interviews, offers, scoring, autopilot).
- **CRM (Relationships)** — partially exists (leads, sequences, sourcing).
  People we have a relationship with who aren't active applicants.
- **HRIS (Employment)** — started today: `employee_profiles`, the apply→employee
  lifecycle. Grows into employment history, org chart, comp records, time-off,
  documents. **The Employees page is the first HRIS surface.**
- **Payroll** — future. Pay runs, salaries, tax, benefits — downstream of HRIS.

Status legend reuses the canonical ownership matrix (`canonical`, `compatibility`,
`adapter`, `legacy`). Modules are a *grouping* of the same canonical objects, not
a new data model.

## Code structure (target)

Move from the current flat `src/lib/domain/*` into module folders. One repo,
clear walls:

```
src/
  modules/
    core/      domain/ (people, org, approvals, notifications) · types/
    ats/       domain/ · tools/ (agent) · validations/
    crm/       domain/ · tools/ · validations/
    hris/      domain/ (employees, ...) · tools/ · validations/
    payroll/   (future)
    agents/    orchestrator + per-module sub-agent wiring
  app/         Next.js routes, grouped to mirror modules:
    (dashboard)/hris/employees/...      ← Employees page lives here
    api/employees/...                   ← HRIS API boundary
```

**The boundary rule (what keeps this honest):** a module may depend on `core`
and on itself — **never sideways** on a sibling module's internals. Cross-module
needs go through a module's public domain interface (its `domain/index.ts`), not
its tables. Enforce mechanically with an import-boundary lint rule
(e.g. `eslint-plugin-boundaries` or `dependency-cruiser`) so violations fail CI.
This single rule is what makes a future service extraction cheap.

## The agentic layer: per-module sub-agents + one orchestrator

Today there is one copilot with ~41 tools — already near the point where tool
count hurts accuracy and cost. The module structure fixes this and matches where
we want to go (Pillar 2: "talk to it, the job gets done").

```
                 ┌──────────────────────────────┐
   user NL  ───► │      Orchestrator agent       │  routes intent, composes
                 │  (router + cross-module plans) │  multi-module workflows
                 └──────────────────────────────┘
                    │        │         │        │
              ┌─────┘   ┌────┘    ┌────┘   ┌────┘
        ┌──────────┐ ┌────────┐ ┌────────┐ ┌────────┐
        │ ATS agent│ │CRM agent│ │HRIS agt│ │Payroll │
        │ ats.*    │ │ crm.*   │ │ hris.* │ │ pay.*  │
        │ tools    │ │ tools   │ │ tools  │ │ tools  │
        └──────────┘ └────────┘ └────────┘ └────────┘
              └──────── all share the canonical DB + domain layer ────────┘
```

- Each module owns a **namespaced tool registry** (`ats.*`, `crm.*`, `hris.*`,
  `payroll.*`). The HRIS tools we just added (`list_employees`,
  `mark_employee_joined`, `mark_employee_terminated`) become the seed of `hris.*`.
- Each module has a **sub-agent**: a focused system prompt + only that module's
  tools. Smaller surface ⇒ more reliable, cheaper, more accurate.
- A top-level **orchestrator** receives the request, routes to the right
  sub-agent(s), and composes cross-module workflows. Example: *"hire Jane and
  start her onboarding"* → ATS sub-agent records the hire → HRIS sub-agent marks
  the pre-hire and kicks off onboarding. Because everything shares one DB +
  domain layer, this is **function calls, not API integrations** — the monolith
  advantage again.
- Implementable on the Google GenAI SDK / sub-agent patterns; the orchestrator
  is itself a tool-use loop whose "tools" are the sub-agents.

## Migration path (incremental, non-disruptive)

Each step ships independently; nothing is a big-bang.

1. **Seed the module folders** and the import-boundary lint rule in the current
   monolith. Mechanically move existing `domain/*` files into `modules/*`. Low
   risk; compiler-checked.
2. **Carve `core`** (people, org, approvals, notifications) as the shared kernel
   every module imports.
3. **Build out HRIS** — Employees page (now) → employment history, org chart,
   comp, time-off.
4. **Split the copilot** into per-module tool registries + sub-agents + an
   orchestrator. Retire the single 41-tool agent.
5. **Extract a service only on a forcing function** (below), behind the module's
   existing domain interface.

## When to extract a module into its own service/repo

Do it **only** when a concrete forcing function appears — not on instinct:

- **Compliance isolation** — e.g. Payroll needs SOC2/PCI or data-residency
  boundaries that are cheaper to enforce as a separate service.
- **Independent scaling** — one module's load profile is wildly different
  (e.g. payroll batch runs) and co-scaling is wasteful.
- **Team boundaries** — multiple teams need independent deploy cadences and the
  monolith's shared deploy becomes the bottleneck.
- **Third-party productization** — a module is sold/embedded standalone.

Until then, the modular monolith is the correct architecture, and the boundary
rule keeps the option open.

## What this means right now

- We are **not** restructuring everything today. We establish the **HRIS module**
  as the first concrete expression: an `/hris` route group, an Employees page,
  the HRIS agent tools (already built), all on the shared canonical core.
- Nav gains lightweight **sections** (Recruiting / HRIS / Insights / Admin) so the
  module structure is visible to users and to us.
- New HRIS UI is behind a simple feature flag so we control the reveal, per the
  rollout decision.
