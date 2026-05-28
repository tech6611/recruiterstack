# HRIS Architecture: RecruiterStack vs Deel vs Workday

A detailed architectural comparison **purely in the HRIS context** — how each
platform models a person's employment, what shape their data takes, where they
draw module boundaries, and how the candidate→employee transition actually
works under the hood. Written 2026-05-28.

## TL;DR

Three companies, three eras of thinking about HRIS architecture, and
RecruiterStack lands in a surprisingly clean position next to them.

- **Workday** — the patented object-oriented HCM gold standard for the enterprise.
  One Universal ID per worker, Foundation Data Model under everything,
  configurable business-process framework. Architecturally the most rigorous.
  Enterprise-only; **6–12 month** implementations.
- **Deel** — modern unified suite (ATS + HRIS + global payroll + EOR) for
  growth-stage global teams. Single platform philosophy — "ATS connected
  directly within Deel"; pitches the same unified-data thesis as RecruiterStack,
  built recently with this assumption baked in. **2–4 week** implementations.
- **RecruiterStack** — solo-built, AI-first, **agentic-from-the-core**, on a
  canonical `people` spine. Architecturally the same shape as Workday's
  Universal ID and Deel's unified record, but the **agent layer is the
  primary UX**, not a feature bolted onto modules. The differentiator isn't
  unified data alone (Deel claims that too) — it's *unified data + agentic-by-default
  + sub-agent-per-module*.

Translation: **architecturally we're aligned with the right archetypes** —
this isn't a Greenhouse/Ashby (ATS-only, hands off at hire). We're competing
in the unified-suite category. The honest gaps are depth (especially HRIS
beyond core lifecycle) and scale-tested customization (Workday's business-
process framework is genuinely deep). The honest moats are the agentic
architecture and the speed to ship modules.

## The comparison axes

| Axis | Workday | Deel | RecruiterStack |
| --- | --- | --- | --- |
| **Identity spine** | Universal ID persists across Pre-Hire → Employee → Contingent Worker; "patented object-oriented data model" | Single platform; "ATS connected directly within Deel"; one record across ATS/HRIS/payroll | `people` table as canonical anchor; same `person_id` from candidate → pre-hire → active → terminated |
| **Lifecycle states** | 3 explicit record types: Candidate, Pre-Hire (created at Offer step), Worker (created at hire completion) | Approved role → ATS requisition → hire → onboarding → payroll, all on one record | Candidate → Pre-hire (`employee_profiles.status='pending'`, created by DB trigger on hire) → Active → Terminated |
| **Audit/timeline** | Business Process Framework auto-tracks every transition; configurable per process | Workflow logs across modules; less surfaced as a first-class timeline | `employee_events` table — first-class per-employee timeline of every transition, written by data-layer triggers |
| **Extensibility** | Implementation teams define business object behaviors + relationships; deepest customization in market | Per-country policy templates; lighter workflow config | New `event_type` values + module-scoped tables extend without rearchitecture; modular monolith keeps boundaries clean |
| **ATS depth** | Workday Recruiting (mature, enterprise) | AI-powered ATS, recently launched, integrated | The original product — deep AI scoring, autopilot, sourcing, sequences, scorecards, approvals (~38 ATS tools) |
| **Payroll / global** | Workday Payroll (US-strong, partner ecosystem) | **In-house global payroll + EOR in 150+ countries** — their DNA | Not built yet (module placeholder); designed to attach to the same `person_id` |
| **Customization model** | Object-oriented business processes; tenant-level config | Workflows + integration platform | Modular monolith with enforced import boundaries; new modules drop in without touching core |
| **AI / agentic** | AI features added across modules; not natively agentic at the data layer | AI ATS + AI compliance; productized AI on top | **Agentic-first architecture**: orchestrator + per-module sub-agents (ATS + HRIS today), shared canonical DB underneath |
| **Implementation time** | 6–12 months | 2–4 weeks | Sign-up SaaS |
| **Segment** | Large enterprise (1,000+) | Growth-stage 50–500, global teams | Currently small/startup; architecture supports growing into Deel-segment |

## Three architectural patterns, three eras

### Workday (2005-era thinking, executed extremely well)

Workday's architecture is the academic textbook version of HCM — and is
intentionally so. Every entity is a **business object** with explicit
relationships; the **Foundation Data Model** is the shared kernel under HCM,
payroll, finance, and supply chain. Workers are not one record but three:

```
Candidate ──Offer step──► Pre-Hire ──hire completed──► Worker (Employee or Contingent)
   │                          │                            │
   └─────── one Universal ID persists across all three ────┘
```

The **Business Process Framework** lets each customer configure *every*
transition (hire, promotion, comp change, transfer, termination) as a
configurable workflow with approval chains, conditions, and notifications.
This is what makes Workday so deep — and also what makes it 6–12 months and
millions of dollars to implement.

> Architecturally, this is what we are building toward. The `people` spine
> is RecruiterStack's Universal ID equivalent. Our `employee_events` table is
> our (very lightweight) Business Process Framework audit equivalent.

**Gaps vs Workday:** depth. Workday has decades of HCM domain modeling. We
have the same shape but with the minimal subset.

### Deel (2020-era thinking)

Deel started as global payroll/EOR and grew into HRIS, then bolted on an ATS
("Engage Hire" / Deel ATS). The architectural thesis they now sell is exactly
the one RecruiterStack started from independently:

> "When your Applicant Tracking System (ATS) and HRIS are the same, there are
> no gaps. The process simply keeps moving from workforce planning to hiring
> and eventually to onboarding." — Deel marketing copy

That's the **unified-data pitch**, and Deel is the most direct architectural
peer to RecruiterStack — same thesis, modern stack, ATS built into the HRIS
foundation rather than the other way around. Notes from the public material:

- **"ATS is available for all clients with HRIS as a required foundation"** —
  i.e., the HRIS is the spine, ATS hangs off it. This is the inverse of
  Greenhouse/Workday-recruiting where ATS comes first.
- **"ATS data flows between workforce planning, onboarding, payroll, and
  compensation modules"** — one record, many module-roles. Same thesis.
- **In-house global payroll** is Deel's structural moat (the EOR network +
  payroll in 150+ countries is non-trivial to replicate).

**Gaps vs Deel:** global / payroll / EOR (huge), customer scale (their HRIS
sits on real payroll volume, ours is solo-built). **Advantages over Deel:** we
went agentic-first; Deel's AI is productized features on top of conventional
modules. Their ATS is an acquired/recent addition; ours is the original deep
product.

### RecruiterStack (2026 thinking — what we have now)

Our architecture, restated honestly:

```
  CORE (people, org, departments, locations, approvals, notifications)
   │
   ├── ATS module (openings, jobs, applications, candidates, interviews, offers, scoring, autopilot)
   ├── HRIS module (employee_profiles, employee_events, manager_id, [comp+time-off pending])
   ├── CRM module (placeholder — leads/sequences/sourcing migrate here)
   └── Payroll module (placeholder — future)
                ▲
                │ same person_id flows from candidate → pre-hire → active
                │
   Orchestrator agent ── delegate_to_ats ──► ATS sub-agent
                       └─ delegate_to_hris ─► HRIS sub-agent  (CRM/Payroll to follow)
```

Three architectural decisions we made that the other two didn't (or didn't
make as cleanly):

1. **The agent layer is the primary UX, not a feature.** Workday's AI is
   bolted onto modules. Deel's AI is productized on top. Ours is a per-module
   sub-agent system with a top-level orchestrator — the natural-language
   interface is structurally first-class. This is **the** differentiator
   today, and it leans on the unified-data spine to actually work (an agent
   that needs to integrate across systems can't reliably "just do the job").
2. **Data-layer-enforced lifecycle invariants.** "A hire always yields an
   employee record" lives in a DB trigger (migration 047), not in app code.
   "Every employment transition writes a timeline event" lives in DB triggers
   (migration 048), not in app code. This is more like Workday's data model
   discipline than Deel's app-layer workflow logs — and it means the agentic
   layer can never violate the invariant by accident.
3. **Modular monolith with enforced import boundaries.** One repo, one DB,
   one deploy; module-to-module sideways imports fail CI
   (`npm run check:boundaries`). We can extract modules to services later if
   a forcing function appears, without rebuilding. Workday is a single
   massive system (no module extraction story). Deel is a unified suite
   (similar — but their public docs don't describe internal module separation
   the way we've codified it).

## Where each platform is structurally strong

**Workday** — depth of HCM modeling and configurability. If a Fortune 500
needs region-specific multi-step approval workflows on comp changes that
differ by job level and country and feed into a payroll batch process, Workday
does it. We won't catch up to that surface area; we shouldn't try.

**Deel** — global breadth (EOR in 150+ countries) and payroll volume. They
have the operational moat of being a literal employer of record. We don't
compete here at all today.

**RecruiterStack** — speed to ship, agentic UX, ATS depth on a unified
foundation, fast time-to-value. The architecture is set up to add modules
without rearchitecting.

## Where each platform is structurally weak

**Workday** — implementation cost and rigidity. The configurability that makes
it deep also makes it slow. Mid-market and below cannot afford it.

**Deel** — ATS is a recently-added second product on a payroll-first
foundation; the unified-data pitch is newer than their core architecture (they
came from EOR, not from "one identity across the lifecycle"). AI is productized
on top, not architectural. They are *retrofitting* the architecture we have
green-field.

**RecruiterStack** — HRIS depth beyond core lifecycle (no comp, time-off, org
chart depth, documents, benefits, performance/reviews yet). No payroll. No
real customer scale on the HRIS side. Customization surface area is shallow
compared to Workday's BPF.

## What this means strategically

1. **Stop selling "unified ATS + HRIS" as the differentiator alone.** Deel sells
   that. Greenhouse + an HRIS integration claims it. The structural moat is
   **unified ATS + HRIS + agentic-first** — the AI doesn't just *use* the
   unified data, it's how users interact with the suite. That's harder to
   replicate because Workday/Deel/Greenhouse have entrenched non-agentic UIs
   that retrofit poorly.
2. **Don't try to be Workday in HRIS depth.** Pick the 80/20: employment
   history (have it), comp records, manager-routed approvals, time-off,
   documents. Skip the deep custom-workflow business-process framework — by
   the time customers need that, the agent should be how they get it
   ("create an approval that routes through this person's grandboss for any
   comp change over 15%").
3. **Don't try to be Deel in payroll/global.** This is a multi-year, capital-
   intensive moat (legal entities, banking, compliance). Either partner
   (integrate to existing global payroll providers via Merge/Finch) or skip
   the segment entirely.
4. **Sharpen the agentic-first message.** "Talk to your HR suite" is true and
   structurally hard to clone for incumbents. The HRIS module is now real
   enough to demo this end-to-end (lead → candidate → hire → employee →
   timeline → manager → notes, all via natural language).

## Honest gap list (HRIS-only)

What we'd realistically need to be "the HRIS choice" for a Deel-segment
customer (50–500 employees, global teams):

- **Comp records** (next slice on the plan) + comp-change history on the
  timeline — structurally same shape as everything else, ships fast.
- **Time-off** — its own product (balances, accrual rules, requests, calendar
  views). Bigger lift.
- **Documents** — per-employee document storage with categories, signing,
  expiry, country-specific compliance docs.
- **Org chart at scale** — direct reports, all descendants, visualizations,
  manager-routed approvals (we have `manager_id`; chain-walking is one query).
- **Benefits** — enrollment + provider integrations. Big.
- **Reviews / performance** — Deel ships this as "Deel Engage."
- **Multi-country employment compliance** — handbooks, statutory minimums,
  document requirements per country. Heavy.
- **Payroll** — either integrate (Merge.dev, Finch) or skip the segment.

## Sources

- [Deel HRIS](https://www.deel.com/solutions/hris/) · [Deel HR](https://www.deel.com/solutions/hr/) ·
  [Deel ATS](https://www.deel.com/solutions/hire/ats/) ·
  [How Deel's ATS closes the gap between recruitment and onboarding](https://www.deel.com/blog/how-deel-ats-closes-the-gap-between-recruiment-and-onboarding/) ·
  [Deel Engage](https://www.deel.com/solutions/engage/)
- [Workday HCM (technical deep dive)](https://samawds.com/insightblog/workday-hris-a-technical-deep-dive-into-enterprise-hcm-architecture-and-implementation-strategy/) ·
  [Workday HCM datasheet](https://www.workday.com/content/dam/web/en-us/documents/datasheets/datasheet-workday-human-capital-management.pdf) ·
  [Workday Business Process Framework](https://www.workday.com/content/dam/web/en-us/documents/datasheets/workday-business-process-framework.pdf) ·
  [Workday Foundation Data Model](https://www.suretysystems.com/insights/workday-fdm-building-more-efficient-data-models/) ·
  [Workday: Candidate vs Pre-Hire vs Worker](https://workday.utexas.edu/news/terminology-talk-candidate-vs-pre-hire-vs-worker-records)
- [Workday vs Deel comparison](https://www.getguru.com/reference/workday-vs-deel) ·
  [Best HCM software](https://www.deel.com/blog/best-hcm-software/)
- Earlier RecruiterStack research: [hire-to-employee research](./hire-to-employee-research.md) ·
  [platform modular architecture](./platform-modular-architecture.md) ·
  [canonical data model](./canonical-data-model.md)
