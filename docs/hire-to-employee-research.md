# Research: The Hire → Employee Transition (and who gets to press "Hired")

Strategic background for Slice 4 of the canonical data model. Question that
prompted it: *should a TA user be able to mark a candidate as hired directly, and
how do mature ATS/HRIS platforms architect the candidate → employee transition?*

## TL;DR

- **Yes, a TA user marking "hired" is correct and universal.** In every mature
  ATS, "hired" is a *pipeline disposition* — a TA-owned outcome that closes out a
  candidacy. It is **not** the same act as *creating an employee*.
- The two are deliberately **separate events**: the disposition (TA action) and
  the employee-record creation (a downstream consequence owned by the system/HR).
- The market splits into two architectures, and RecruiterStack is explicitly
  trying to be the second one:
  1. **Two-system split** (Greenhouse, Lever, most ATS): the ATS data model
     *stops* at hire; a separate HRIS owns the employee; an integration copies
     data across. This is the fragmentation our product promise attacks.
  2. **Unified identity** (Workday, Rippling): one persistent human record carries
     across candidate → pre-hire → employee. This is the model we want.

## Pattern A — the two-system split (what most ATS do)

"Hired" is modeled as an exit disposition from the active pipeline:

- **Lever:** `hired` is literally an *archive reason*. "Candidates exit your
  active pipeline either due to being hired or rejected." Hired = a disposition,
  not an employee object.
- **Ashby:** "Hired" is a pipeline stage = "offer accepted and hire confirmed."
  It can be configured to set the hire date and mark the *opening* as filled when
  the offer is accepted or the candidate is moved to Hired.
- **Greenhouse:** hiring is the *boundary* of the product. Its key documented
  limitation: **"once a candidate becomes an employee, Greenhouse's data model
  does not follow them"** — post-hire data lives in a separate HRIS, requiring a
  deliberate integration to avoid a broken handoff.

In all three, the employee is born in a *different system*. When a candidate is
marked hired, an integration (native, or via Merge.dev / Flexspring / Zapier)
pushes name, title, department, comp, manager, and start date into the HRIS,
which then *creates* the employee record. New-hire data flows ATS → HRIS; later
status changes (promotion, termination) flow HRIS → ATS.

**Takeaway:** the disposition and the employee creation are decoupled by an
integration boundary. The TA marks hired; a separate system materializes the
employee.

## Pattern B — unified identity (what we want to be)

The platforms that don't fragment use **one durable identity** spanning the
whole lifecycle:

- **Workday** uses three record *types* but one persistent ID:
  - **Candidate** record during recruiting.
  - **Pre-Hire** record, created **at the Offer step** from candidate data.
  - **Worker** record, created **when the hire is completed**, from the pre-hire.
  - A **Universal ID persists** across Pre-Hire → Employee/Contingent Worker —
    "one identity" by design, so downstream systems don't break.
- **Rippling** calls its single source of truth the **"employee graph"** — "when
  a candidate accepts an offer in Rippling Recruiting, it triggers onboarding
  workflows… their information flows straight into the employee record, with no
  duplicate data entry."

**Takeaway:** the unified players prove the thesis behind our `people` table —
identity is the spine, and candidate/employee are *roles* a person record takes
on over time, not separate islands. We already built this anchor in Slice 1.

## The lifecycle states (synthesized)

```
 Candidate ──offer accepted──► Pre-Hire / Pending ──start date──► Employee / Worker
     │                              │                                  │
     └──────────────── one persistent person identity ────────────────┘
```

- **Hire date ≠ start date.** Hire date = offer accepted (begins the employment
  relationship; drives benefits/seniority). Start date = first actual day (drives
  onboarding + payroll). Industry default gap: ~2–3 weeks.
- Employee records are commonly created **at offer acceptance** as a *pending /
  pre-hire* state, then **activated at start date**. This is why Workday has a
  distinct Pre-Hire record before the Worker record.

## Answering the actual question

**Should a TA user be able to mark a candidate hired?** Yes — unambiguously. It's
a normal disposition action and exists in every ATS, via multiple surfaces
(pipeline move, offer acceptance, manual status). Our current 7 entry points are
not a bug in concept; scattered ATS hire actions are normal.

**But marking hired should not *be* the employee creation.** The mature pattern
separates:

| Concern | Owner | Nature |
| --- | --- | --- |
| Disposition ("this candidacy ended in a hire") | TA user | An action, many surfaces |
| Employee record creation | The system (HR-governed) | A consequence, one place |

This separation is exactly why the **Slice 4 hook decision matters**. The
research favors making employee creation a **guaranteed downstream consequence**
of *any* hire disposition — not logic re-implemented at each TA surface:

- The two-system world enforces this with an **integration boundary** (one sync
  pipe below all hire actions).
- The unified world (Workday/Rippling) enforces it with **event/workflow triggers**
  ("offer accepted → trigger onboarding/worker creation").
- In our single-database world, the equivalent of "one pipe below all hire
  actions" is a **DB trigger / single domain event** on the status columns — the
  centralized option from the Slice 4 decision.

## Implications for RecruiterStack's architecture

1. **Keep "hired" as a TA disposition.** Don't restrict it. The 7 entry points
   are legitimate; we just shouldn't duplicate employee-creation logic across them.
2. **Model employee creation as a consequence, fired once, centrally.** This is
   the strategic argument for the DB-trigger (or single domain-event) approach
   over hand-wiring 6 call sites.
3. **Introduce a pre-hire / pending employee state, not just "active."** Mirror
   Workday: create the employee record at offer-accept as `pending`, flip to
   `active` at start date. Our minimal `employee_profiles.status` should at least
   allow `pending | active | terminated`.
4. **`start_date` is first-class** and distinct from the hire moment — already in
   the Slice 4 minimal schema.
5. **This is the moat.** Greenhouse openly stops at the hire boundary. Our entire
   pitch is that the person record *doesn't* stop there. Slice 4 is the first
   place that promise becomes literally true in the data.

## Recommendation for Slice 4

Adopt the **centralized employee-creation** model (DB trigger or a single
domain-level hire event) rather than instrumenting each TA surface, and widen the
minimal employee state to include a `pending` (pre-hire) status with a real
`start_date`. This matches how both market archetypes enforce the invariant and
keeps the TA's freedom to mark hired from any surface intact.

## Sources

- [Greenhouse: ATS onboarding / handoff boundary](https://www.greenhouse.com/blog/blog-ats-onboarding) ·
  [ATS→HRIS onboarding sync](https://zythr.com/resources/the-best-greenhouse-ats-integrations-a-practical-guide/ats-hris-onboarding-sync)
- [Ashby: Multiple Offer Stages / "mark opening filled when hired"](https://www.ashbyhq.com/product-updates/track-your-full-offer-process-with-multiple-offer-stages) ·
  [Ashby Candidate Pipeline](https://docs.ashbyhq.com/candidate-pipeline)
- [Lever: hired as an archive reason / disposition](https://hire.lever.co/developer/documentation)
- [Workday: Candidate vs Pre-Hire vs Worker records](https://workday.utexas.edu/news/terminology-talk-candidate-vs-pre-hire-vs-worker-records) ·
  [Workday Universal ID persistence](https://evocs.tech/workday-universal-id-hr-driven-identity-management/)
- [Rippling: the employee graph](https://marvinvista.substack.com/p/rippling-and-the-employee-graph-yc) ·
  [Kleiner Perkins on Rippling unifying employee data](https://www.kleinerperkins.com/perspectives/rippling/)
- [Merge.dev: ATS↔HRIS integration data flow](https://www.merge.dev/blog/guide-to-ats-api-integrations)
- [Hire date vs start date](https://www.candidate-experience-institute.com/blog/understanding-the-difference-between-hire-date-and-start-date)
