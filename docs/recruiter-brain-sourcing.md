# The recruiter-brain sourcing plan (#2 reasoned ladder · #3 adaptive planner)

Status: **design** — not yet built. #1 (titles are sourcing-only, not a gate) shipped
separately. This doc specs the two layers that turn our fixed relaxation ladder into
something that reasons like a niche recruiter.

## The problem, in one line

Today the entire relaxation behaviour lives in a constant:

```ts
// src/lib/ai/gate-evaluator.ts
export const RELAX_AT = { companies: 2, titles: 3, location: 4 } as const
```

`ladderFromIdealProfile` (`src/modules/pool/search/spec-from-brief.ts`) expands in that
fixed order, by fixed amounts, **regardless of what it actually finds**:

- **L1** — core companies (`feeder_pools[0]`) × exact titles × location
- **L2** — "wider companies" = the *rest of* `feeder_pools`, else "any company"
- **L3** — adjacent titles (`brief.adjacent_titles`), **no company constraint**
- **L4** — wider location (3× radius)

A recruiter doesn't run a script. They look at the yield and decide the next move. When
only 3 EMs turn up at the 6 core companies, a recruiter says *"too thin — who else hires
this exact title?"* and **broadens the company set (same title) to competitors,
same-space peers, then big-tech** before ever compromising on the title. Our ladder
instead jumps straight to "any Staff Engineer anywhere" (L3), which is why the market
list filled with non-EMs at Cribl / David AI / Amplitude.

**Two gaps:**
1. **Order & depth (#2):** company breadth (same title) should be exhausted — across
   *reasoned* tiers, not a short pre-baked list — before titles widen.
2. **No feedback (#3):** the plan never asks "how many did I find?" and re-reasons. This
   is the Juicebox move from the original screenshot: *"the exact 5-company pool is only
   56 profiles — too tight; expand to peer high-growth startups."*

## What already exists (build on, don't rebuild)

- The LLM **already reasons company expansion**: the generation prompt
  (`icp-generator.ts:530`) asks for prioritised `feeder_pools` — *direct competitors →
  similar-problem → adjacent talent markets* — each with a `relationship` + `rationale`,
  and it already uses the HR-tech example ("recruiting-tech competitors before generic
  SaaS"). We under-use this: only `feeder_pools[0]` seeds L1; the rest collapse into one
  "wider companies" level.
- `brief.adjacent_titles` — "titles ONE step wider" — the logical career-progression
  titles. Also under-used (one flat L3 step).
- A **count probe** already exists: `POST /api/jobs/[id]/source/spec/counts` sizes each
  level against the vendor with a cheap `limit:1` call. This is the sensor #3 needs.
- **Sourcing Lab** already runs A/B "current vs challenger" strategies — the harness for
  comparing expansion strategies.
- **#1 (shipped):** `title_current`/`title_any` with a `relax_at` are now
  `enforcement: 'sourcing_only'`, so widened-title people rank on competencies instead of
  being floored to 20. Exclusions (no `relax_at`) stay hard.

---

## #2 — The reasoned expansion ladder

**Principle:** the relaxation *order* is a recruiter decision, so it should be **data the
brain produces**, not a constant. Exhaust company breadth (same title) before titles;
exhaust title progression before geography.

### Target ladder shape (per role, authored by the brief)

| Tier | Holds title? | Companies | Source |
|---|---|---|---|
| 1 | exact | core (`feeder_pools` priority 1) | brief |
| 2 | exact | direct competitors | brief `relationship: direct_competitor` |
| 3 | exact | same-space / similar-problem | brief `relationship: similar_problem` |
| 4 | exact | adjacent talent market + big-tech 0→1 | brief `relationship: adjacent_talent_market` |
| 5 | **feeder titles** (career progression) | all of tiers 1–4 | `adjacent_titles` × prior companies |
| 6 | feeder titles | any company | — |
| 7 | any of the above | wider location (3× radius) | — |

Key differences from today: (a) companies widen across **several reasoned tiers with the
same title** before titles move; (b) tier 5 applies feeder titles **to the same broadened
company set**, not "any company"; (c) location moves last.

### Changes
- **Retire the `RELAX_AT` constant** as the source of order. Derive per-criterion relax
  levels from the brief's `feeder_pools[].priority` + `relationship` and an explicit
  `title_progression` block. Keep a sane default if the brief is thin.
- **Generation prompt:** ask for `feeder_pools` deep enough to fill tiers 2–4 (name real
  competitors/peers/big-tech, not one pool), and an explicit ordered `title_progression`
  (e.g. `Engineering Manager → Tech Lead Manager → Staff Engineer who leads`), each with a
  one-line rationale.
- **`ladderFromIdealProfile`:** build the levels from those tiers instead of the fixed
  L1/L2/L3/L4. Company tiers first (same title), then title tiers over the accumulated
  company set, then location.
- All company/title lanes stay **sourcing-only** (#1) — the ladder only decides *search
  order and ranking*, never eligibility.

### Effort: medium. Mostly prompt + `spec-from-brief` rewrite; no schema change (the spec
is JSONB). Reuses `SearchSpec`/`SearchLevel`.

---

## #3 — The adaptive planner (the recruiter brain)

**Principle:** plan against the *market*, not a fixed script. After each tier, look at the
yield and decide the next move — expand, deepen, or stop — the way Juicebox narrates
"56 is too tight, expanding to peers".

### The loop
```
target = qualified-lead goal (e.g. 100–150)
plan   = tier 1 (core companies × exact title)
found  = 0
while found < target and tiers remain:
    count = probe(current tier)            # /spec/counts, cheap limit:1
    if count is thin for the whole plan:
        move = brain.nextMove(brief, plan, found, whatIsThin)
        #   → "add these same-space companies with the same title"
        #   → or "step to these feeder titles across the current companies"
        #   → or "widen location"
        plan.append(move)                  # LLM may NAME NEW companies/titles here
    found += count
record plan + reasoning + per-tier counts   # show it, Juicebox-style
```

### What "think like a recruiter" means concretely
- **Dynamic company discovery:** when reasoned tiers run dry, the brain proposes *more*
  same-space employers on the fly ("HR-tech → also Greenhouse, Lever, Ashby, Workable,
  Gem") — not limited to what the first pass listed.
- **Yield-aware ordering:** a huge core pool → never widen; a tiny one → widen
  aggressively but stay same-title first.
- **Narrated, inspectable:** surface the reasoning, the per-tier counts, and a
  qualified-leads range — the persona-tabs + "map the market" UI we already prototyped.

### Reuses
- `spec/counts` route (the sensor), `feeder_pools` reasoning, Sourcing Lab (compare
  strategies), the market-map/persona UI.

### Trade-offs & mitigations
| Concern | Mitigation |
|---|---|
| LLM cost per expansion | Only call the brain when a tier is thin; cheap model (Flash) for expansion; cache per ICP version |
| Latency | Probe counts in parallel; cap iterations (e.g. ≤4 expansions); execute deterministically once the plan is set |
| Predictability / trust | Persist + display the plan and its reasoning; recruiter can edit any tier (the search-plan editor already exists) |
| Vendor credits | Counting uses `limit:1` probes; acquisition still gated behind an explicit "Find people" |

### Effort: larger — this is the genuine recruiter-brain and the Juicebox parity. Best as
its own phase after #2.

---

## Phased build

1. **#1 — titles sourcing-only.** ✅ shipped.
2. **#2 — reasoned ladder.** Prompt deepening (`feeder_pools` tiers + `title_progression`)
   + `ladderFromIdealProfile` rebuild + retire `RELAX_AT` as the order source. Ship behind
   the existing search-plan editor so it's inspectable.
3. **#3 — adaptive planner.** The count-probe loop + `brain.nextMove` + narrated plan.
   Land it first in **Sourcing Lab** as a "challenger" strategy so we can A/B it against
   today's ladder before it becomes default.

## Open decisions (need Sagar)
- **Qualified-lead target** that drives "thin?" — fixed (e.g. 120) or per-role?
- **Max expansion iterations / credit ceiling** for #3.
- **Location:** always relax last, or role-dependent (remote roles skip it)?
- **Who can edit the plan** — recruiter-only, or does the brain's proposal auto-apply then
  get edited?

## Coordination
This is deep in the sourcing/ladder/gate code the other session owns (`RELAX_AT`,
`ladderFromIdealProfile`, `isSourcingOnlyCriterion`, the enforcement flag). #2 and #3 must
be sequenced with that work — this doc is the shared reference.
