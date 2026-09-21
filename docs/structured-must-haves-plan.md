# Structured must-haves — Phase 1 plan

**Status:** Phase 1 built 2026-09-21 (branch `feat/structured-must-haves`) · **Owner:** Sagar · **Scope:** Phase 1 of 3

> **As built — where Phase 1 differs from the plan below**
> - No `gates_version` marker: the legacy → criterion conversion is pure and runs on
>   every read (`withConvertedGates` in `src/modules/ats/domain/icp.ts`); stored gates
>   are untouched, so rollback is reverting the code.
> - Converted gates keep their **original label verbatim** — the matrix and stored
>   snapshots match gate cells by label. `criterionLabel()` gives the structured wording.
> - "Primary experience in X" becomes `title_any` from the brief's title families; a
>   `function` gate is only the fallback when there are no families (function isn't
>   stored per role, so on pool people it can only read "unverified").
> - Vendor-verification is **per person, from the run that bought them**: each Crustdata
>   run records `baseCriterionIds` in `pool_ingest_runs.query`, and `loadAcquiredLevels`
>   hands them to the scorer. Runs before this record verify nothing — those people are
>   checked from data (which is how the New York job's seven non-engineers now fail the
>   title gate instead of being waved through by today's plan).
> - The generic-title guard applies to includes only; an exclusion ("no Interns") stays broad.
> - Audit: `npx tsx scripts/audit-gates.ts [--job <id>]`.

## The problem, in numbers

Evidence from the New York Engineering Manager job (`4ad86347…`), 2026-09-20:

- Its ICP has 4 must-haves. **3 are free-text questions** with no attribute
  ("Is this candidate's primary experience in software engineering leadership…?",
  "…authorization to work in the US?", "…based in, or willing to relocate to, New York?").
  Only the experience band is structured. Across all 5 approved ICPs: **8 of 10 gates
  are free text, 2 are structured.**
- Free-text gates can only be judged by an LLM reading a profile. Result: `?` on 9 of
  10 bought people for "willing to relocate" (no profile can answer it), and ✗ on
  Andrew Rickards (11.9 yrs) for "6–12 years" even though Crustdata's own filter had
  already passed him — the gate was **judged twice by two different rulers**.
- The Crustdata run bought 10 people; **7 were not engineers** (Senior PM, AE, RevOps,
  GTM…). The L1 lane's title list "Engineering Manager / Tech Lead Manager / Senior /
  Staff Software Engineer" was split on "/", so the bare word **"Senior"** became a title
  term and matched anything containing it. 0.21 of 0.30 credits bought people the job
  could never use.
- The search plan is built from the *recruiter brief* (experience band, feeder pools,
  title families, market) while the *must-haves* are a separate, mostly free-text
  description of the same job. Only one of them reaches the vendor.

## The decision

**A must-have is a search criterion.** The same `SearchCriterion` object the search plan
already sends to the vendor becomes the must-have: one shape, one compiler, one
deterministic gate check. There is no separate "gate model" — `CriterionKind` *is* the
list of things a recruiter can require, and it is open: it grows whenever a vendor
exposes a new filterable field (adding a kind = one entry in the union, one line in the
vendor's compiler, one evaluator case).

What that list is today — every kind below already compiles to a Crustdata field
(`src/modules/pool/vendors/crustdata/compile-spec.ts`):

| Kind | Recruiter meaning | Crustdata field | Gate check from stored data |
|---|---|---|---|
| `school` | only IIMs / IITs / this list of colleges | `education.schools.school` | any degree at a listed school |
| `employer_current` / `employer_past` / `employer_any` | currently / formerly / ever at these companies | `…company_name` | any experience employer matches |
| `title_current` / `title_any` | holds / has held one of these titles | `…title` | whole-phrase match on role titles |
| `seniority` | vendor closed set (VP, Director …); `exclude` flips it | `…seniority_level` | current role seniority (when a source stores it) |
| `function` | Engineering / Sales / Consulting … | `…function_category` | current role function (when stored) |
| `years_band` | 6–12 years | `years_of_experience_raw` | `experience_years` from dated roles, ±1 yr |
| `grad_year_band` | graduated 2014–2019 | `education.schools.end_year` | highest-degree year |
| `location` | within 50 km of New York / in the US | `professional_network.location.raw` | city → region → country (as recall, migration 149) |
| `skill` | has Kubernetes / SQL | `skills.professional_network_skills` | stored skills (sparse on most sources) |
| `industry` / `company_size` / `company_type` / `funding_stage` | employer is B2B SaaS / 51–200 / private / Series A | `…company_industries` / `…headcount_range` / `…company_type` / — | vendor-verified when bought; unverified otherwise (employer metadata is not stored per role yet) |

Rules that follow:

1. **A gate never asks an LLM.** Pass / fail / unverified come from data. Missing data →
   `unverified` (`?`), never ✗.
2. **A vendor-filtered gate cannot fail a bought person.** If the criterion was compiled
   into the query that bought them, it is marked `verified: 'vendor'` and passes. No more
   Andrew / Ian / Will disagreements at the decimals.
3. **One source of truth.** The search plan's *base line* (common to every level) **is the
   must-have list.** Ladder levels still come from the brief's feeder pools — they are
   where to look first, not who is allowed.
4. **Generic words are never title terms.** A title is matched as a whole phrase; `Senior`,
   `Staff`, `Lead`, `Head`, `Manager`, `Principal`, `Director` alone are rejected by the
   compiler.
5. **Not filterable ⇒ not a must-have.** Work authorization, willingness to relocate,
   "genuine passion for X" have no vendor field and no profile field. They become
   screening questions (Phase 3) and are listed on the ICP as "ask the candidate" until
   then. Competencies stay competencies (rated 1–4).

## Data model

`icps.must_haves` is JSONB, so **no schema migration** is needed; a `gates_version: 2`
marker inside `sourcing_map` tells readers which shape the row holds. Legacy gates keep
their `IcpMustHave` shape and are handled by the conversion rules below.

```ts
// src/lib/types/icp.ts
import type { SearchCriterion } from '@/lib/types/search-spec'

/** A must-have IS a search criterion. Kept as an alias so the intent reads in call sites. */
export type MustHave = SearchCriterion

export interface GateVerdict {
  id: string
  kind: CriterionKind
  label: string                       // rendered for the matrix column header
  pass: boolean | null                // null = unverified
  verified_by: 'data' | 'vendor' | null
  reason: string                      // "11.9 yrs, band 6–12" / "no dated roles on file"
}
```

`Icp.must_haves` becomes `(IcpMustHave | MustHave)[]`; a type guard `isCriterion`
separates them (a criterion has `kind`, a legacy gate has `attribute`). Legacy
`IcpMustHave` stays exported so nothing outside the ICP breaks.

## Converting the gates that exist today

Run once per ICP on read (pure, cached on the row after first conversion), and shown in
the ICP editor as "converted — please confirm":

| Existing gate | Becomes | Confidence |
|---|---|---|
| `attribute: experience_band` / `min_experience` | `years_band` | exact |
| label matches `/(\d+)\s*(?:–\|-\|to)\s*(\d+)\s*years/` or `/(\d+)\+?\s*years/` | `years_band` | exact |
| `attribute: location`, or label mentions the job market's city / "based in" | `location` from the job's market (`roleContext.market`), 50 km | high |
| `attribute: skill` / label "has X" where X is a known skill | `skill` | high |
| `attribute: school` / label names IIM / IIT / a college list | `school` | high |
| label matches `/primary experience in\|background in\|genuine .* background/` | `title_any` from the brief's `title_families` + `function` from the job's function | **needs review** |
| anything else (work authorization, relocation willingness, "genuine passion for…") | **not a gate** — moved to `sourcing_map.unmapped_requirements` and shown on the ICP as "not verifiable from a profile; ask the candidate" | — |

For the New York job this yields: `years_band` 6–12 · `title_any` [Engineering Manager,
Tech Lead Manager, Head of Engineering] + `function` Engineering (review) · `location`
New York 50 km · work-authorization → unmapped. Four questions become three filters and
one honest gap.

## Evaluation

New pure module `src/lib/ai/gate-evaluator.ts` — one case per `CriterionKind`:

```ts
export function evaluateMustHaves(
  gates: MustHave[],
  candidate: { experience_years, location, current_title, skills, ... },
  history: { experiences[], education[] },
  ctx: { vendorFilteredGateIds: Set<string> },
): GateVerdict[]
```

- Any gate in `vendorFilteredGateIds` → `pass: true, verified_by: 'vendor'` before the
  data check runs.
- `years_band`: `experience_years` null → unverified; else pass iff within
  `[min − 1, max + 1]` (matches recall's slack; the 25 % tolerance in `gateFails` goes).
- `title_current` / `title_any`: whole-phrase, case-insensitive match against the current
  role / any role (via the existing `roleTerms` expansion); no titles on file → unverified.
- `employer_*`: any (current / past / any) experience employer matches via `employerTerms`;
  no employers → unverified.
- `school`: any education school matches; no education → unverified.
- `grad_year_band`: highest-degree year within band; none → unverified.
- `location`: `resolveLocationParts(candidate.location)`; city → region → country exactly
  as `outsidePlanReason`; nothing resolvable → unverified.
- `skill`: stored skills contain the value (case-insensitive); no skills → unverified.
- `seniority` / `function`: from the current role when the source stores it; else unverified.
- `industry` / `company_size` / `company_type` / `funding_stage`: unverified unless
  vendor-verified (employer metadata is not stored per role yet — a later slice).
- `exclude: true` inverts pass/fail; unverified stays unverified.

`scoreAgainstIcp` (`src/lib/ai/fit-engine.ts`):
- criteria go through the evaluator; the judge prompt receives **only legacy free-text
  gates** (which shrink to zero as ICPs convert) and competencies.
- `gate_results`, `gate_failures`, `gate_unknown` are built from `GateVerdict[]`; the
  existing `combineFit` is unchanged.
- `absentPolicy === 'reject'` keeps rejecting market candidates that have no history at
  all, as today.

## One source of truth for the search plan

`specFromIcp` (`src/modules/pool/search/spec-from-brief.ts`):

- The base line **is** `icp.must_haves` (the criteria), verbatim — no translation step.
  The brief's `experience_band` / `market` only seed a must-have when the ICP has none
  of that kind.
- A `title_*` must-have applies on every level (today the title terms come from each
  pool's `role_types`; those remain as *extra* terms per level, unioned).
- The ladder levels still come from `feeder_pools`; an `employer_*` must-have narrows
  which pools may appear at all.
- The compiled spec records `gate_ids` per criterion, so the acquire path can hand
  `vendorFilteredGateIds` to the evaluator for the people it bought.

`compile-spec.ts` (`src/modules/pool/vendors/crustdata/`):
- `textMatch` for titles rejects single generic tokens (`Senior|Staff|Lead|Head|Manager|
  Principal|Director|Junior|Associate`) and logs them as `unsupported`; a family like
  "Senior / Staff Software Engineer" is expanded upstream to the two full phrases.
- `years_band` is emitted once (today it is duplicated when both the brief and a gate
  carry a band).

## Files

| File | Change |
|---|---|
| `src/lib/types/icp.ts` | `MustHave = SearchCriterion`, `GateVerdict`, `isCriterion`, `Icp.must_haves` union |
| `src/lib/ai/gate-evaluator.ts` *(new)* | deterministic evaluation + legacy→structured conversion |
| `src/lib/ai/gate-evaluator.test.ts` *(new)* | every kind × pass / fail / unverified / exclude / vendor-verified; the 4 New York gates convert as specified |
| `src/lib/ai/fit-engine.ts` | structured gates bypass the judge; verdicts from evaluator; drop the 25 % band tolerance |
| `src/modules/pool/search/spec-from-brief.ts` | base line = must-haves; titles on every level; criterion ids carried so bought people can be vendor-verified |
| `src/modules/pool/vendors/crustdata/compile-spec.ts` | generic-token guard; single `years_band` |
| `src/modules/pool/domain/crustdata-acquire.ts` | pass `vendorFilteredGateIds` for bought profiles |
| `src/modules/pool/domain/pool-sourcing.ts` | thread `vendorFilteredGateIds` into `scoreAgainstIcp` for acquired people |
| `src/modules/ats/domain/icp.ts` | convert legacy gates on read; persist `gates_version: 2` after first conversion |
| `src/components/req-jobs/SourcingMatrix.tsx` | gate column header from `GateVerdict.label`; tooltip shows `reason` + `verified_by` |
| `scripts/audit-gates.ts` *(new)* | prints every approved ICP's gates → converted form → what would be unmapped |

Not in Phase 1: the ICP editor UI for structured pickers, the seeding prompt that
generates gates, screening questions (Phases 2–3). Until Phase 2, a recruiter edits a
must-have through the existing **search-plan editor** — it already edits `SearchCriterion`
chips, and after Phase 1 the plan's base line *is* the must-have list.

## Verification

1. Unit: evaluator tests above; `compile-spec.test.ts` gains the generic-token case
   ("Senior / Staff Software Engineer" → two phrases, never `Senior`).
2. `scripts/audit-gates.ts` against the 5 approved ICPs — expect 10 gates → 2 bands +
   converted kinds/locations + a short unmapped list; nothing silently dropped.
3. Replay the New York job **without buying**: re-score the 10 cached Crustdata people
   through the new path. Expected: Andrew Rickards ✓ on the band (vendor-verified);
   the 7 non-engineers ✗ on `title_any` with a reason naming their title; the
   "willing to relocate" `?` column gone.
4. Compile the New York spec and diff the Crustdata request: title condition contains
   `Engineering Manager`, `Tech Lead Manager`, `Senior Software Engineer`, `Staff Software
   Engineer` — and **not** `Senior`.
5. `npm run typecheck`, `npm run test:run`, `npm run audit:canonical` unchanged.

## Decisions to confirm before build

1. **Band slack:** ±1 year everywhere (recall, gate, vendor) — replaces the 25 % rule.
2. **Adding kinds later is cheap** — union entry + compiler line + evaluator case. Nothing
   in Phase 1 assumes a fixed list; the ICP editor (Phase 2) renders whatever
   `CriterionKind` contains.
3. **Existing free-text gates that don't convert** are shown as "not verifiable from a
   profile" and stop gating immediately — i.e. the 8 blank gates lose the power to
   reject as soon as Phase 1 ships. (Recommended: yes; they were only ever producing `?`.)

## Rollback

Everything keys off `gates_version`. Removing the marker from an ICP row returns it to
the legacy path unchanged; no data is rewritten destructively (converted gates are
stored *alongside* the originals until Phase 2 replaces the editor).
