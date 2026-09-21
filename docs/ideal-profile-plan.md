# The ideal profile — Phase 2 of structured must-haves

**Status:** built 2026-09-21 (branch `feat/ideal-profile`) · **Owner:** Sagar · supersedes the "must-haves" framing in
[structured-must-haves-plan.md](./structured-must-haves-plan.md) (Phase 1 stays as the plumbing).

## The model, in one paragraph

A recruiter reads the JD and writes down who they are looking for, as filters:
**where** · **years** · **education** · **roles held** · **companies**. That list is L1.
L2, L3… are the same list with one thing loosened — wider companies, then wider titles,
then a wider location. What is sent to the vendor and what a profile is checked against
are the same list. There is no separate "must-have" concept, no yes/no questions, no
brief sitting beside the plan.

For the New York job: *New York · 6–12 yrs · engineering degree · Engineering Manager /
Tech Lead Manager / Head of Engineering · at Series A–C B2B SaaS (Rippling, Ramp, Vanta…)*.
L2 widens companies to growth-stage SaaS; L3 widens titles to Senior/Staff engineers who
lead; L4 widens the location.

## What changes (mostly deletion)

| Today | After |
|---|---|
| The ICP generator writes must-haves as **yes/no questions** ("Is this candidate's primary experience in…?") and is told *not* to gate on location. | The generator writes the **ideal profile** as filters. Questions are no longer produced. |
| The recruiter brief carries band / feeder pools / title families / market **beside** the must-haves; only the brief reaches the vendor. | The brief's facts **become** the ideal profile: market → `location`, band → `years_band`, title families → `title_any`, pool #1 companies → `employer_current`, and a new `education` field → `degree_field`. |
| Ladder levels = a tour of employer tiers (startups → growth → FAANG → titles only). | Ladder levels = **controlled relaxations of L1**: L2 companies (pools 2+), L3 titles (adjacent families), L4 location (radius × 3, or country). Years are never relaxed. |
| ICP page shows "Must-haves (hard gates)" as a list of sentences; the plan page shows the same facts as chips. | ICP page shows **"Ideal profile"** — the five rows as phrases — and points to the plan editor to change them. One object, two views. |
| Fit-Engine asks the judge about gates. | Phase 1 already made gates deterministic; the judge does competencies only. |

## Data

- **New criterion kind `degree_field`** — degree and/or field of study terms ("B.Tech",
  "Engineering", "Computer Science"). Crustdata filters on `education.schools.degree` and
  `education.schools.field_of_study` (word match); the evaluator checks stored education.
- **Brief gains** `education: { fields: string[]; degrees: string[] }` and
  `adjacent_titles: string[]` (the L3 widening). Nothing else new.
- `icp.must_haves` keeps its name in storage (JSONB; no migration) but holds exactly the
  ideal-profile criteria. Existing ICPs are converted on read as in Phase 1; the next
  Regenerate writes the new shape.

## Files

| File | Change |
|---|---|
| `src/lib/types/search-spec.ts` | `degree_field` kind + label |
| `src/modules/pool/vendors/crustdata/compile-spec.ts` | compile `degree_field` (OR of word matches on degree + field_of_study) |
| `src/lib/ai/gate-evaluator.ts` | evaluate `degree_field` against education; `idealProfileFromBrief()` |
| `src/lib/types/icp.ts` | brief: `education`, `adjacent_titles` |
| `src/lib/ai/icp-generator.ts` | prompt asks for `education` + `adjacent_titles`; must-haves := ideal profile from the brief; question gates dropped |
| `src/modules/pool/search/spec-from-brief.ts` | levels := relaxations of L1 (companies → titles → location) |
| `src/components/req-jobs/IcpEditor.tsx` | "Must-haves" section → "Ideal profile" (read-only phrases + link to the plan) |
| `src/components/req-jobs/SearchSpecEditor.tsx` | base line labelled "Ideal profile (L1)"; `degree_field` chip |
| tests | generator builds the NY ideal profile; ladder relaxes in order; `degree_field` compiles and evaluates |

## Verification

1. Unit tests above.
2. `npx tsx scripts/audit-gates.ts` — every approved ICP shows its ideal profile and the
   compiled L1; no `[legacy]` or `(dropped)` rows.
3. Regenerate the New York ICP (draft, not approved): the ideal profile reads as the
   example above and L1–L4 relax in order; compiled L1 contains the degree filter.

## Not in this phase

Screening questions (work authorization, relocation willingness) — Phase 3. Editing the
ideal profile on the ICP page itself — the plan editor is the editor.

## As built — notes

- The ladder needs the never-relaxed rows on the base line (the compiler ANDs the base into
  every level) and the relaxable rows on L1. `relax_at` on a criterion records the level
  it loosens at; `ladderFromIdealProfile()` does the split. A stored (edited) spec keeps
  its levels; its base is replaced by the ICP's never-relaxed rows; an edited plan writes
  base + L1's relaxable rows back (`mustHavesFromSpec`).
- A person bought at level L is expected to miss dimensions with `relax_at ≤ L`; those
  misses show as ✗ but do not rank or fold as failures (`unexpectedGateFailures`). Each
  lane's compiled criterion ids are recorded on the run so L2+ people are vendor-verified
  on exactly what reached them.
- Generation depends on the recruiter corrections the route passes: without "candidates
  should be based out of New York", the model reads RecruiterStack's Indian company
  context and proposes Indian pools for the New York job. The job's location record has
  no state/country, which is why the market has to be inferred at all.
- Verified 2026-09-21 by generating the New York ICP with the new prompt (not saved):
  five rows in the right order; years/education never relaxed; L2 companies → L3 titles
  → L4 location (150 km); Crustdata L1 carries the degree filter and no bare "Senior".
