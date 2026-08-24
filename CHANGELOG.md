# Changelog

A running log of notable changes to RecruiterStack — new features, fixes, schema
changes, UI/visual changes, and anything else worth knowing at a glance. Newest
entries on top.

> **How to use this file:** add an entry under the current date whenever you make a
> meaningful change. Group entries by type — `Added`, `Changed`, `Fixed`,
> `Removed`, `Schema` (migrations), `Docs`. Keep each line short and concrete.
> This file is part of the workflow — see the "Changelog" note in `CLAUDE.md`.

## 2026-08-24 (Lead → active conversion)

### Added
- **New rule action "Move into the interview pipeline" (`promote_lead`)** — the
  conversion trigger that graduates a sourced lead into the active pipeline.
  Recruiters wire it like any rule (e.g. on "Replied": if replied is yes →
  Move into the interview pipeline). The engine moves the candidacy to the job's
  first active stage ("Applied") **and** flips `lifecycle` lead → active, so the
  interview-plan automations (fit gate, scheduling, etc.) take over. Skips
  candidates already active. This completes the sourced → lead → engage →
  convert → interview flow.
- `promoteLeadToActive()` in `applications.ts` (sets stage + lifecycle together).
  The engine's candidate query now also reads `lifecycle` so conversion is
  idempotent. `promote_lead` was a reserved action type in the schema; now wired.

## 2026-08-24 (Lead-zone outreach automation)

### Added
- **Two new automation conditions for the lead funnel: "Added to a sequence" and
  "Replied to outreach."** These let recruiters build the engage-then-convert
  flow with rules on lead stages, e.g. "New lead, if not added to a sequence →
  Add to a sequence," "New lead, if added to a sequence → move to Reached out,"
  and "Reached out, if replied → move to Replied." The rule builder already
  renders on lead stages, so the new fields appear there automatically.
- Engine `buildFacts` now computes `enrolled` / `replied` per candidate from
  `sequence_enrollments` (reply is set externally via SendGrid Inbound Parse;
  the engine only reads `status='replied'`). Surfaced in the automation-debug
  diagnostic too. Unit-tested (rule-fields + rule-eval).

## 2026-08-24 (Sourced candidates enter the lead funnel)

### Changed
- **Sourced prospects now land in "New lead" (lead zone), not "Applied."** The
  lead zone existed in the schema but no code ever routed anyone into it — every
  new candidacy, sourced or applied, went straight to the active interview
  pipeline. Now the candidate's `source` decides the entry: `sourced` →
  first lead stage with `lifecycle='lead'`; applicants → active pipeline
  (unchanged). Applies to the Source tab (add + pool unlock) and the AI Copilot
  "add to pipeline" tool. This restores the Ashby-style flow: engage sourced
  people in the lead funnel first; they convert to the interview pipeline only
  when they reply/apply. (Conversion trigger + lead-zone automation are the next
  pieces.)
- Sourced candidacies now log a `sourced` application event (was `applied`), so
  people who never applied no longer inflate "applied" counts.

### Added
- `getFirstLeadStage()` in `job-pipelines.ts` — resolves a sourced candidacy's
  lead entry stage, falling back to the active entry stage for jobs without a
  lead zone. Unit-tested.

## 2026-08-23 (Automation engine fires again)

### Fixed
- **Pipeline automation engine was silently acting on zero candidates.** Its
  candidate query selected `review_status` by name; on a prod DB missing
  migration 030 that column doesn't exist, so PostgREST hard-errored and the
  query returned no rows — every rule saw an empty pipeline. The engine now
  falls back to a query without `review_status` when that column is absent, so
  all other rules (days-in-stage, AI score, feedback, etc.) fire normally.
- Read-only diagnostic (`GET /api/jobs/:id/automation-debug`) now reports
  `review_status_column_missing` so this class of schema drift is visible.

### Schema
- `133_restore_review_status.sql` — idempotently re-adds `applications.review_status`
  (and its index) on any database that missed migration 030. Restores
  "Recruiter decision" automation rules, ICP learning signals, and Yes/No/Maybe
  triage.

## 2026-08-23 (Pipeline Plan zone headers)

### Changed
- **The four pipeline zone boxes are now headers.** Lead / Active / Offer /
  Completed render as solid coffee `#221b14` cards with cream text and a
  sand-toned icon, and a gold `#ebb137` underline marks any zone currently
  holding candidates (nothing is underlined when the pipeline is empty). Each
  zone's label row below became a full-bleed sand band (`slate-100`) with a 3px
  coffee left rule, so a zone visually owns the stages beneath it.
- **Dropped the stage count from the zone boxes.** The sub-line reads
  "4 candidates" rather than "4 candidates · 5 stages" — the stage list sits
  directly below, so the count was redundant.

## 2026-08-23 (Pipeline Plan polish)

### Changed
- **Pipeline Plan editor now uses the in-app coffee/beige palette.** Dropped the
  Ashby-borrowed indigo/violet from `PipelinePlanEditor` and `StageRules`. The
  funnel-step selects, zone-stepper icons, "Add stage" hover and focus borders use
  the platform primary coffee `#221b14` (hover `#33271b`) — the same value as the
  sidebar and primary buttons — not the marketing site's pine green. Drag-over
  rows highlight in sand (`slate-100/300`) rather than a green wash; the
  promotion-gate badge stays `gold-*`. The "Save plan" and "Save rule" buttons
  drop their colour override and use the standard `Button` primary.
- **Zone stepper spans the full row.** Lead / Active / Offer / Completed cards are
  `flex-1 basis-0`, so they divide the available width evenly with no trailing
  gap, whatever the zone count. Labels truncate instead of forcing overflow.

### Added
- **Drag-and-drop stage reordering** in the Pipeline Plan editor. Each unlocked
  stage row has a grip handle; dragging reorders within its own zone and persists
  via the existing `reorder_stages` action. Locked stages (Lead zone, Hired /
  Rejected / Archived) are neither draggable nor drop targets, and the up/down
  chevrons remain as the keyboard-accessible path.

## 2026-08-23 (later)

### Added
- **Candidate Pool multi-vendor ingestion, Slice S1.** The spine only — no vendor
  spend, no live API. `VendorAdapter` / `MappedRecord` / `Claim` contract
  (`src/modules/pool/vendors/types.ts`): an adapter is PURE, emits *claims* rather
  than facts, and is the only vendor-aware code in the pipeline.
  - `vendors/mock/` — fixture-backed `vendor:mock` adapter shaped like Coresignal's
    multi-source employee record, with fixtures for the cases that matter (a fresh
    duplicate of an existing human, loose dates, LinkedIn-only reachability, and a
    charged-but-worthless record).
  - `vendors/registry.ts` — the only place that knows which adapters exist.
  - `domain/identity.ts` — pure identifier normalization (Gmail dots/`+tags`,
    LinkedIn slug across every URL shape, GitHub login, E.164 phone).
  - `domain/fusion.ts` — pure claim fusion: `score = trust × recency_decay ×
    confidence`, per-field policies (recency-dominant / trust-dominant / union), and
    a dispute rule that only fires when recency did *not* settle the disagreement.
  - `domain/rebuild.ts` — `rebuildProfile()` / `rebuildAllProfiles()`: the pure,
    re-runnable projection from claims to `pool_profiles`, incl. `evidence_as_of`
    and `tenure_verified_months`. Disabled sources are filtered before fusion (the
    kill switch).
  - `domain/vendor-ledger.ts` — `planBuy()` (pre-buy check), `claimVendorIds()`
    (claim-before-fetch via `ON CONFLICT DO NOTHING`), `settleVendorRecord()`,
    `releaseStaleClaims()`, run bookkeeping and the spend ledger.
  - `domain/ingest.ts` — land → map → resolve → persist → rebuild. Deterministic
    identity resolution only; every exit path settles the ledger.
  - `npm run pool:s1-verify` — the S1 gate (`scripts/pool-s1-verify.ts`): rebuilds
    the whole pool twice and asserts the second pass changes nothing; `--fixtures`
    also runs the 5 mock records through the full spine; `--cleanup` removes them.
- 52 new unit tests across identity, fusion and the mock adapter.

### Schema
- **Migration 122 `pool_vendor_ingest.sql`** (not yet applied). `pool_vendor_records`
  — the payment ledger, separate from `pool_identities` because that table's
  `profile_id` is NOT NULL and so cannot record a *charged* fetch that resolved to
  nothing (which would be re-bought forever). Also `pool_ingest_runs`,
  `pool_vendor_calls`, `pool_profile_views`, `pool_source_field_trust`; a unique
  index on `pool_profile_fields (profile_id, field, source_key, observed_at)` for
  re-run idempotency; `pool_documents.profile_id` / `vendor_updated_at` /
  `ingest_run_id` (+ backfill of the 253 existing documents); lookup indexes on
  `pool_contacts (kind, value)` and `pool_experiences (profile_id, source_key)`; and
  `vendor:mock` / `vendor:coresignal` / `vendor:pdl` source rows, seeded **disabled**.

### Fixed
- Mock adapter skill de-duplication kept the *last* spelling (`new Map(pairs)`
  semantics) instead of the first, so `['Go','go']` surfaced as `go`.
- **`rebuildProfile` no longer derives freshness from claim dates.** The original pool
  import stamped every claim's `observed_at` with the *import* time (all 183 github +
  446 web:resume claims say 2026-08-16; all 159 upload:cv claims say 2026-08-20), so
  deriving `evidence_as_of` from claims marked all 145 profiles fresh and collapsed
  `tenure_verified_months` onto `current_tenure_months` (116/117 identical) —
  re-creating the bug migration 117 exists to fix. Evidence now comes from
  `pool_documents.vendor_updated_at`, falling back to claim dates only when those
  actually vary. A source that cannot date itself yields NULL → freshness `unknown`.
- **`rebuildProfile` no longer nulls a field no source has ever claimed.** The import
  wrote `display_name` (145/145) and `headline` (97/145) straight onto `pool_profiles`
  with no backing claims; a strict projection erased them. Claims from a *disabled*
  source still null their field — that is the kill switch and it still works.
- **The S1 gate was blind to the change it was making.** `changed` omitted
  `evidence_as_of` / `evidence_source` / `tenure_verified_months`, so a rebuild that
  rewrote the freshness of the entire pool still reported `changed: 0`. All three are
  now tracked, and the before-snapshot selects them.

### Added
- `npm run pool:backfill-evidence` (`scripts/pool-backfill-evidence.ts`) — recovers
  real source dates from the raw payloads into `pool_documents.vendor_updated_at`.
  Dry run by default; `--apply` writes. Recovered 139/253 documents (github 108/108
  via `payload.updated`, upload:cv 31/37 via `payload.doc_date`). web:resume 0/108 is
  genuinely unrecoverable and is *not* back-computed from
  `payload.movability.current_tenure_months`, which was itself calculated at import
  time. Result: `evidence_as_of` spans 2022–2026 instead of a single import date, and
  `tenure_verified == current_tenure` fell from 116/117 to 35/112, with 76 profiles
  now showing a real tenure overstatement (median 5 months).

## 2026-08-23

### Added
- **Pipeline Plans & Automation Agents — Slice 1a (data foundation).** The
  substrate for an Ashby-style funnel a recruiter sketches once and agents walk
  candidates down. No agents run yet and nothing user-visible changes. New pure
  zone model (`src/lib/pipeline/zones.ts`, tested), types
  (`src/lib/types/pipeline-automations.ts`), Zod schemas
  (`src/lib/validations/pipeline-automations.ts`), and a facade
  (`src/modules/ats/domain/pipeline-automations.ts`: stage playbook + automation
  rules CRUD + run log). Facade is dormant until Slice 1b wires a UI.
- **Pipeline Plans & Automation Agents — Slice 1b (Lead zone + plan editor).**
  Seeds the three Ashby-style lead stages (New lead → Reached out → Replied) per
  job, and adds a **Pipeline Plan** editor in the Interview Plan tab where a
  recruiter writes, per stage, what happens on entry and the rule to advance
  (`PipelinePlanEditor.tsx`; `GET/PUT /api/jobs/[id]/pipeline-plan`). Applicants
  still land in the first active stage ("Applied") — `getFirstJobStage()` is now
  zone-aware — so no candidacy enters the lead zone yet (that's Slice 5). Visible
  effect: boards show three (empty) lead columns.

### Schema
- **Migration 123 (`123_pipeline_automations.sql`).** Adds `pipeline_stages.zone`
  (lead|active|offer|completed, default 'active') + `is_promotion_gate`;
  `applications.lifecycle` (lead|active|completed, default 'active' — no behaviour
  change today); and three tables: `stage_playbook`, `pipeline_automations`
  (generalizes `sequence_enrollment_rules`), `automation_runs` (append-only,
  reversible). Additive + reversible; existing stages backfilled by category.
- **Migration 130 (`130_seed_lead_stages.sql`).** Seeds the 3 lead stages for new
  jobs (updated `create_default_job_pipeline_stages` trigger) and backfills them
  into existing canonical jobs (non-destructive; negative order_index; "Replied"
  is the promotion gate).

### Docs
- **Pool multi-vendor ingestion architecture** (`docs/pool-vendor-ingestion-architecture.md`) —
  design for buying person data from N vendors and standardizing it into one pool. Six-stage
  spine (acquire → land → map → resolve → fuse → materialize) with vendor-specific code
  confined to the adapter; `VendorAdapter`/`MappedRecord`/`Claim` contracts; deterministic +
  probabilistic identity resolution with a review queue; per-field trust and recency-decayed
  fusion; the five standardization dimensions (two of which exist today); and a proposed
  migration 122 (`pool_source_field_trust`, `pool_companies`, `pool_merge_candidates`,
  `pool_ingest_runs`, `pool_vendor_calls`, plus `pool_documents.profile_id`). Design only.
- **Pool acquisition model decided: demand-driven buy, shared retention.** Same doc, §1.
  Buy only when a client searches; everything bought joins the shared pool permanently; never
  pay for the same person twice. Consequences: Coresignal becomes the discovery vendor (free
  `/search/es_dsl` returns IDs + `x-total-results`, so the pre-buy check against
  `pool_identities` is possible) and PDL becomes enrichment-only (charges per record on
  search, so it cannot support check-before-buy); free search funds a pre-flight cost estimate
  in the UI; refresh is lazy-on-read via `pool_sources.retention_days` + a new
  `last_refreshed_at`; cache-hit rate / cost-per-net-new / reuse factor become first-class
  metrics (`pool_profile_views`); and the contract ask narrows to perpetual retention +
  multi-tenant serving.
- **Pool §1 rewritten as real-time acquisition mechanics.** Adds the `pool_vendor_records`
  payment ledger — separate from `pool_identities` because that table's `profile_id` is NOT
  NULL and so cannot record a *charged* fetch that produced no resolvable profile (which would
  be re-bought forever); the claim-before-fetch `ON CONFLICT DO NOTHING` lock against
  concurrent orgs double-buying the same id; the owned-vs-known-to-exist result tiering (free
  search returns bare ids, so unbought records can't be ranked); base-vs-multi-source collect
  triage with its 50%-keep-rate break-even; and the decoupling of collect-N (wide, shared,
  permanent) from score-N (narrow, per-org, ephemeral) now that the Fit Engine — not the
  vendor — is the latency bottleneck.

## 2026-08-22

### Docs
- **Market data vendors research** (`docs/market-data-vendors-research.md`) — one-pager on
  buying person data from People Data Labs / Coresignal into the cross-org Candidate Pool.
  Covers vendor mechanics + credit economics (verified Aug 2026), the four missing pieces
  on top of migration 115, the `sourcing_map.requirement_decomposition` → vendor-query
  bridge, five live jobs to test coverage against, the PDL employment-use and resale
  clauses that gate the design, and a V0–V4 build order. Research only — nothing built.

## 2026-08-21

### Added
- **Sourcing comparison matrix — both pockets.** The "From your candidates" (ATS) and
  "From the market" (Candidate Pool) sections now render every candidate as a row in one
  shared **comparison matrix**: the ICP's **must-haves** as pass/fail gate columns (✓ / ✕)
  and its weighted **competencies** as 1–4 rating-bar columns, so ATS and market candidates
  read on the same axes. **Click a name** to expand inline evidence (rationale, red flags,
  per-must-have status, per-competency rating + quote, and skills). New shared component
  `SourcingMatrix.tsx` (`src/components/req-jobs/`). The ATS pocket keeps selection, 👍/👎
  calibration decisions, and the "Missing must-have" / "Background unverified" / stale-ICP
  states; the market pocket hides 👍/👎 (calibration is ATS-only), shows a **no-contact**
  flag, and keeps unlock-&-add.
- **`/sourcing-preview`** — a public, sample-data harness that renders the real
  `SourcingMatrix` (both pockets) for local eyeballing without a live ICP + sourcing run.

### Changed
- **Sourcing GET routes** (`/api/jobs/[id]/source` and `.../source/pool`) now return the
  approved ICP's `must_haves` and `competencies` (labels/names/weights) so the client can
  build the matrix columns.
- **`getSourcingMatches`** now also selects the candidate's `current_company` (shown on
  each matrix row beside location); the client `Match` type now carries the stored
  per-competency breakdown (which the API already returned).
- **Pool matches** (`PoolMatch`) now persist the Fit Engine's per-competency ratings +
  `red_flags` (previously computed then discarded). Stored as JSONB — no migration; older
  cached matches simply lack them until re-sourced.
- **Normalized education level on every parsed qualification.** Enrichment now tags each
  education entry with an ISCED-aligned **level** — `secondary` (10th/SSC) · `senior_secondary`
  (12th/HSC/A-levels) · `diploma` · `undergraduate` · `postgraduate` · `doctorate` ·
  `professional_cert` — mapping Indian and international vocabulary onto one ladder, plus a
  `status` (completed/ongoing). The level is shown to the recruiter-brain as **evidence it
  reasons over** (never a rigid filter — a Civil B.Tech + SDE role still reads as an engineer).
  Levels are also **inferred at read time from the degree** for candidates enriched before this,
  so no re-enrich is needed. `normalizeEducationLevel` + `highestEducationLevel` (pure, tested).
  Education is JSONB — no migration.

### Changed
- **The Fit Engine judge now reasons like a recruiter in market context — not a keyword
  filter.** It's told to read the candidate's whole trajectory (what they studied, the
  calibre of their institutions, the roles + companies they've actually worked in) in the
  hiring norms of their market. For a professional-background gate, the **degree field is
  a weak proxy, never a filter**: e.g. an IIT civil-engineering grad who then worked as a
  Software Development Engineer genuinely has a software-engineering background (common in
  India) → not disqualified on the degree label; institution pedigree + actual roles
  outweigh titles/labels. Fails only when the whole picture shows the wrong kind of
  professional; absent data still defaults to pass. `buildJudgePrompt`; no migration.

### Added
- **Missing-data policy for background gates (Part B).** When a candidate has **no
  education AND no work history** on file, a background/identity deal-breaker ("is this a
  genuine engineer?") can't be verified — so:
  - **Internal / applied candidates** are **flagged, not rejected**: an amber *"Background
    unverified — no education or work history on file"* marker on the sourcing card and the
    candidate's AI Assessment, so you can enrich or eyeball them (their CV was likely thin).
  - **Market / sourced candidates** are **rejected** — vendor data is assumed complete, so
    missing means genuinely absent. `scoreAgainstIcp` gains an `absentPolicy` (`flag` |
    `reject`) + a `data_incomplete` flag on the result.
  - **Schema:** migration **120** — `sourcing_matches.data_incomplete` +
    `applications.ai_data_incomplete`. **⚠️ Apply migration 120; re-source / re-score to
    populate the flag.**

### Fixed
- **The Fit Engine now judges background deal-breakers on education + work history — not
  the current title.** A "genuine engineering background" gate was passing non-engineers
  (e.g. a "Strategy & Ops Manager" with a few adjacent skills like Python/SQL) because the
  judge prompt only ever received the candidate's **current title, a years number, a flat
  skills list, and location** — never their **education or dated work history**, the exact
  evidence that determines it. Now the judge gets both (fetched per candidate), and is
  told to judge a professional-background/identity gate ONLY from what they studied and
  the roles they actually held — a title in another function or adjacent skills is not
  evidence, and a full non-engineering history is grounds to **fail**. Wired into internal
  sourcing, the market (Pool B), and single + bulk applicant scoring. New
  `getCandidatesHistory` batch fetch; `CandidateHistory` on `scoreAgainstIcp`. No migration
  — **re-source / re-score to apply** (cached rows keep their old verdict until then).

### Changed
- **Sourcing tab sections are now collapsible.** The four sections — *From your candidates*
  (internal), *From the market*, *Shortlist brief*, and *What the pipeline is teaching you* —
  each fold from their header (chevron + a count badge). The internal section is open by
  default; the rest start collapsed, so the page fits close to one screen regardless of how
  many candidates each holds. Interim tidy-up; a fuller redesign comes later.

## 2026-08-20

### Added
- **ICP learning engine — Stages 2–3 complete (backend; no frontend yet).** The full
  learner that turns the decision log into a proposed ICP refinement, activating as
  calibrations accumulate:
  - **Pooled weight learning:** the weight suggestion now **borrows strength from
    similar jobs** — cosine similarity over the persisted per-version ICP embeddings
    finds the role's "family"; their decisions are pooled in at a fractional
    (similarity-scaled) weight, so a role with few decisions of its own still learns.
  - **Structural learning:** when the recruiter **systematically rejects candidates the
    ICP rates a fit** (and who passed every gate), reweighting can't explain it — a
    factor is missing. The engine detects this and asks Gemini to **name a new
    competency** to add (and flags "too strict" the other way).
  - **Proposal, not mutation:** `POST /api/jobs/[id]/icp/learn` drafts a **new ICP
    version** (recalibrated weights + any new competency) with a plain-English change
    summary; it's approved via the normal flow — **live scoring never changes without a
    human.** `GET /api/jobs/[id]/icp/learning` shows readiness + the pooled weight
    signal + the structural diagnosis. New `icp-learning.ts` facade + `weight-learning.ts`
    extensions (weighted pooling, `detectStructuralGaps`), unit-tested. No migration.
- **"Refine ICP from feedback" now reads the frozen decision log.** Instead of
  reconstructing labels from the live tables (which lose history on re-score), it reads
  `scoring_feedback` — point-in-time correct — falling back to the live tables only for
  jobs whose decisions predate the log. New `getFeedbackLabels` facade.
- **ICP learning loop — Stage 2 (v1, advisory): a data-driven weight signal.** For each
  competency it measures how well its 1–4 ratings **separated the recruiter's Yeses from
  their Nos**, and proposes a reweighting **blended toward the current weights by a
  confidence that grows with the number of decisions** — so it barely moves on thin data
  and firms up as evidence accumulates. Interpretable, deterministic, and **read-only /
  advisory** (a human still approves any change via Refine). Returns `sufficient:false`
  until ~5+ decisions exist. New pure `weight-learning.ts` (`computeWeightSignal`, 4
  tests) + `getWeightSignal` facade + `GET /api/jobs/[id]/icp/weight-signal`. Graduates
  to pooled logistic regression once there's volume. No migration.
- **ICP learning loop — Stage 1: the data foundation (no ML yet, just clean data).**
  Every recruiter decision (Yes/No/Maybe, from the pipeline *or* on a sourced candidate)
  now freezes a **point-in-time training row** in a new `scoring_feedback` table — the
  candidate's features, the ICP's prediction (score + per-competency ratings + gates),
  and the human verdict, exactly as they were at decision time (the live `ai_*` columns
  get overwritten on re-score, so this is the only place that truth survives). Written
  best-effort from the review + sourcing-decide routes; never blocks the user. New
  `scoring-feedback.ts` facade (`logDecision`, pure `buildFeedbackRow`/`resolveCompetencyIds`).
- **ICP evolution timeline + convergence signal.** The `icps` table was already fully
  versioned; now every version records its **lineage** (`supersedes_id` set on *all*
  versions, not just refinements) and **why it exists** (`derived_from`: generation /
  regeneration / feedback / manual / template), and persists a per-version **embedding**
  (for future job-to-job similarity + meaning-drift). New `getIcpEvolution` (weight/gate/
  competency diffs across versions) + `getIcpConvergence` (did each newer version predict
  your decisions better?) → `GET /api/jobs/[id]/icp/evolution`. Pure diff/agreement logic
  unit-tested (8 tests).
- **Schema:** migration **119** — `scoring_feedback` table (+ indexes, RLS), and
  `icps.embedding vector(768)` + `icps.derived_from jsonb`. Additive/safe. **⚠️ Apply
  migration 119 to prod; existing ICP embeddings backfill as ICPs are regenerated.**

### Changed
- **Regenerate ICP now always re-reasons the weights — it no longer inherits the same
  4 buckets / same split every time.** Root cause: approving an ICP syncs its
  competencies into the job's scoring rubric, and the generator then treated that synced
  rubric as "human-curated" and took an enrichment path that PRESERVED the weights — so
  every regenerate re-used the first version's 4 buckets at (e.g.) 35/30/20/15, only
  refreshing the wording. Now "Regenerate" always runs the reasoning-first pass and
  re-derives both the weights AND the number of competencies from the role. The prompt
  also allows the granularity the role needs (~4–7) and is told not to default to a tidy
  35/30/20/15 split, so two different roles almost never produce the same weight column.
  `generateIcpWithReasoning`; no migration.
- **ICP generation is now reasoning-first — the reasoning derives the weights, not the
  other way round.** Previously the AI locked the weighted competencies first, then a
  second call wrote "How this ICP was reasoned" to *justify* the numbers already set
  (the tail explaining the dog). Now a single elaborate "recruiter's brain" pass reasons
  about the role first — what it really is, what predicts success, unwritten filters,
  candidate archetypes — and the **weighted competency column falls out of that
  reasoning** (highest weight on what the reasoning says matters most), along with the
  deal-breaker questions. It's also **one Gemini Pro call instead of two**. Jobs with a
  human-curated rubric still keep their weights (enrich + reason). New
  `generateIcpWithReasoning`; `GET/POST …/icp/generate`. No migration; regenerate an ICP
  to see it.
- **ICP editor: a must-have is just its plain-English question.** Removed the leftover
  attribute/operator/value dropdowns (which mis-rendered new AI tags like "background"
  as "location" and could silently turn a real gate into an ignored location gate). The
  Fit Engine judges each deal-breaker from the question text. `IcpEditor.tsx`.
- **Fit Engine now screens like a recruiter — deal-breakers can reject, and location
  never does.** Previously the only enforced hard gates were location/years/exact-skill,
  a gate failure merely capped a candidate to "Okay fit" (so non-engineers looked
  acceptable for engineering roles), and location was auto-forced as a gate that
  silently sank strong out-of-city people. Now: (1) the ICP generator is prompted to
  separate genuine **deal-breakers** (incl. "is this the right *kind* of professional?"
  — e.g. a real engineering background) from **weighted signals**, and is told never to
  gate on location or pedigree; (2) the AI judge — which already reads the full CV,
  education and work history — **rules pass/fail on each deal-breaker with evidence**
  (`gate_results`), replacing the rigid location/years/skill checker; (3) **failing any
  deal-breaker REJECTS**: the score is floored into the reject band and the bucket
  becomes "Weak fit / no", instead of capping at "Okay"; (4) **location & seniority can
  never reject** — enforced in the engine (`gatingMustHaves`), which also neutralises
  old auto-seeded gates on existing ICPs. Deal-breakers live on the versioned ICP, so
  they still evolve via the feedback/refine loop. No migration.
  *(Existing approved ICPs keep their old gates until you **Regenerate + re-approve** them.)*
  `fit-engine.ts`, `fit-bucket.ts`, `icp-generator.ts`, `icp-seed.ts`, `schemas.ts`.

### Fixed
- **ICP approve/save no longer fails with "Validation failed."** After must-haves became
  plain-English questions (label only), the draft validation schema still *required* the
  legacy `attribute`/`operator` fields to be non-empty — so saving or approving any ICP
  with a label-only gate (i.e. every reasoning-first ICP) was rejected. Made those legacy
  fields optional/empty-allowed (the Fit Engine judges a must-have from its label).
  Regression-tested. `src/lib/validations/icp.ts`.
- **No more fake `pool-…@unlocked.recruiterstack.in` email on unlocked market
  candidates.** When a Candidate-Pool profile had *no* email (only LinkedIn/phone),
  unlocking it minted a fake-looking placeholder address that showed on the candidate
  and could be sequenced to. Now: (1) profiles with **no contact channel at all** are
  **skipped without spending a credit** (`no_contact`); (2) contactable-but-no-email
  profiles get a **clearly non-deliverable placeholder** (reserved `.invalid` domain,
  RFC 2606) instead of a real-looking one; (3) the candidate profile shows **"No email
  on file"** rather than the placeholder; (4) sequences **stop instead of emailing** a
  placeholder address; (5) the unlock toast reports how many were skipped or unlocked
  without an email. New `src/lib/pool-email.ts` helper; no migration.

## 2026-08-16

### Added
- **Location + company normalization for the pool (`modules/pool/domain/normalize.ts`).**
  Pure, unit-tested (13 cases), and the step that decides whether the city filter works
  at all — 1,500 GitHub profiles produced **91 distinct spellings of one city**, and an
  uploaded CV set added misspellings on top (`Banglore, India`). `normalizeCity` handles
  exact aliases, fuzzy misspellings within an edit budget scaled to name length, metro
  satellites (Gurugram/Noida → Delhi NCR), and multi-city strings: a movement marker
  means the last city wins (`Kolkata ✈ Bangalore` → Bengaluru), otherwise the first does,
  since "City, State, Country" is the common shape. Returns **null rather than guessing** —
  18 of 145 profiles are genuinely unrecognised tier-2 cities (Alwar, Cuttack, Roorkee)
  and a wrong city is worse than none. `normalizeCompany` strips the GitHub `@handle`
  convention, legal suffixes and appended job titles. Backfilled across the pool.
- **Source filter + "CV" badge on `/pool`.** The pool now spans four sources, so search
  can be scoped to one (GitHub profile / personal website / crawled résumé / uploaded CV /
  self-declared link), and rows sourced from an uploaded CV are badged.

### Changed
- **Pool grew to 145 profiles / 422 dated roles** with a new `upload:cv` source
  (trust weight 88 — above a crawled résumé at 85, below a self-declared link at 90;
  a CV handed over directly is better evidence than one found on a website). 37 licensed
  sample CVs enriched through the existing `generateFromPdf` path: 37/37 parsed, 28 with
  dated history, 93 roles, **$0.07**. Notably these are *not* engineers — analysts, sales,
  consulting, a founder — so they cover ground a GitHub-sourced pipeline structurally
  cannot reach, which makes them useful for testing whether the Fit Engine correctly
  *rejects* an off-profile candidate rather than only ranking similar ones.


### Added
- **Pool usage view (`/pool/usage`).** Every org can now see their Candidate Pool
  consumption: plan/tier, unlocks **used vs quota** (with a progress bar), remaining,
  how many unlocked people made it **into the ATS**, and the full **unlock history**
  (candidate, date, status → links to the candidate). Data already captured in
  `pool_access_grants` + `pool_unlocks`; new `getPoolUsage` facade + `GET /api/pool/usage`
  + page, linked from the Source tab's "From the market" section. No migration.

### Fixed
- **The shortlist brief now survives a hard refresh — and matches the market section.**
  The brief was in-memory only, and it re-scored the market on each build (a fresh,
  non-deterministic run), so a refresh wiped it and its market ranking could disagree
  with "Source the market." It now **assembles from the caches** (own-pool
  `sourcing_matches` + the market `pool_sourcing_matches`) with no scoring — so it loads
  on mount (survives refresh) and uses the **exact same cached market run** as the market
  section. Shows a "re-search the market" hint if the ICP moved on. `GET /api/jobs/[id]/brief`.
- **A low fit score no longer reads as "Okay fit" — new "Weak fit" band.** The Fit
  Engine had only three buckets (great / good / okay), so *any* score under 60 — including
  0, 10, 17 — showed as **"Okay fit,"** making obviously-wrong matches (e.g. a non-engineer
  for an engineering role) look acceptable. Added a fourth band: **score < 40 → "Weak fit"**
  (rose), so 0–39 reads honestly. (Scores 40–59 stay "Okay" = marginal.) A gate failure
  still caps optimism to "okay" but a genuinely weak score stays weak; weak → recommendation
  "no". Surfaced across sourcing, the market, the brief, screening, the candidate assessment,
  and the extension. `combineFit` + `FitBucket`; no migration.
- **Market sourcing (Pool B) now survives a refresh.** "Source the market" results were
  component-local, so a hard refresh wiped them and forced a re-search (and re-scoring).
  They're now cached server-side per job and reloaded on mount — the same way your own-pool
  sourcing already persists. Re-searching replaces the cache; if the ICP has moved on since
  the cached search, a "re-search for fresh matches" hint shows. New `pool_sourcing_matches`
  table (migration 118); `GET /api/jobs/[id]/source/pool` returns the cache.
- **ICP generation now weights what recruiters screen on first + intake notes work on
  regenerate + template ICPs get their own reasoning.** Three ICP improvements: (1) the
  generation prompt now explicitly gives **dedicated, weighted competencies to company
  pedigree / feeder (target) companies, scale &amp; complexity, and span of management
  (team size managed)** — the signals a recruiter screens on first — instead of burying
  them (pedigree stays a weighted signal, never a hard gate — bias). (2) The **"paste
  intake call notes"** box is now available after an ICP exists (a **+ intake notes**
  toggle by Regenerate), so you can fold verbatim manager phrasing into a regeneration,
  not just the first draft. (3) Starting a job's ICP **from a saved role template** now
  **generates the reasoning fresh for that job** — the "How this ICP was reasoned" panel
  was blank on template-derived ICPs because reasoning is job-specific and wasn't being
  produced on the from-template path. No migration.
- **Pool tenure was inflating itself, and the movability filter ranked the stalest
  records highest (migration 117).** `current_tenure_months` runs role-start → *now*,
  but the evidence stops whenever the source was written. A résumé last edited in 2018
  saying "current role since 2015" therefore read as "11 years in seat" in 2026. Because
  a record nobody refreshes keeps accruing imaginary tenure, "in role ≥ 3 yrs" — the
  pool's main sourcing signal — preferentially surfaced the *worst* data: 52 of 108
  profiles claimed 3+ years while their newest evidence was 2+ years old.
  New `evidence_as_of` / `evidence_source` / `tenure_verified_months` /
  `employer_disputed` columns separate *when the role started* (a fact) from *how long a
  source actually attests to it*. Freshness is derived at read time, never stored — a
  staleness number written today is wrong tomorrow. Résumé document dates come from PDF
  `/ModDate` metadata, because the latest date *printed* on a résumé is usually the
  current role's start and would make verified tenure zero by construction. UI now shows
  a freshness pill with the real evidence date, an "Employer disputed" badge (38 of 108 —
  GitHub and the résumé name different employers), an evidence-age filter, and both
  tenure figures side by side.
  **The finding worth keeping:** median *verified* tenure is 6 months and only 2 of 108
  clear three years — a résumé is written while its author is job-hunting, so its date
  sits at the start of the role they are now in. No first-party source observes the
  present. Continuous observation is the one capability this pool structurally cannot
  build, and precisely what a data vendor sells.
- **`pool` module no longer imports `ats`.** `unlockPoolProfile` took
  `findOrCreateCandidateProfile` directly, breaking the boundary rule; the projection is
  now injected by the API route (the composition layer, which may import both). Logic
  unchanged. `npm run check:boundaries` passes again.
- **Embeddings were silently broken in production — semantic sourcing never worked.**
  `EMBEDDING_MODEL` was `text-embedding-004`, which Google has since retired; the
  endpoint now returns 404, so every `embedText`/`embedTexts` call failed and
  `candidates.embedding` stayed null. Sourcing therefore fell back to keyword
  overlap on every job, with no error surfaced. Switched to `gemini-embedding-001`
  (the live model) and pinned `outputDimensionality: 768`, since it returns 3072 by
  default — this keeps the existing `vector(768)` columns and `match_candidates()`
  working with **no migration**. Truncated vectors aren't unit-length, which is fine:
  every index here uses cosine (`vector_cosine_ops`), and cosine is scale-invariant.
  Backfilled all 8 affected candidates; 0 remain null. File: `src/lib/ai/llm.ts`.

### Added
- **Richer market candidate cards (SeekOut-style) + fit band derived from the score.**
  The "From the market" list now shows an enriched card per candidate — avatar, current
  title, **current company · total years of experience · time in role · location** pills,
  a fit **meter**, top skills, and the rationale (Variant C). And the fit band is now
  **derived from the score at display time** (`fitBucketFor`, a dependency-free helper)
  everywhere it's shown — sourcing, the market, the brief — so a match cached with an old
  label can no longer render a **0** as "Okay fit"; it re-reads as **Weak** from the score.
  `PoolMatch` gains experience/tenure/skills.
- **The learning loop — separate fit / reachability / movability (Sourcing Brain,
  Slice 3).** Before refining the ICP, the pipeline now diagnoses **why** candidates
  fall out: a rejection at review is a **fit** miss (refine the ICP), a candidate who
  never replies is a **reachability** miss (fix outreach/targeting, not the ICP), a
  declined offer is a **movability/comp** miss. A "What the pipeline is teaching you"
  panel on the Source tab shows the three-way breakdown, names the dominant issue, and
  only offers **Refine ICP from fit feedback** when fit is actually the problem — so
  the loop fixes the right thing. `src/modules/ats/domain/learning-signals.ts` (pure
  `classifyOutcome` + `diagnoseFailureModes` joining review status + sequence replies +
  offer outcomes, unit-tested); `GET /api/jobs/[id]/learning`; `LearningPanel`. No
  migration. Pool-B unlocks flow in automatically (they become candidates).
- **Candidate archetypes — 2–4 distinct "bets" per role (Sourcing Brain, Slice 2).**
  ICP generation's reasoning pass now also produces **candidate archetypes**: instead
  of one "ideal," 2–4 distinct hypotheses that could each succeed — each with a thesis,
  where they come from (career path), the pitch, the friction, and the hire risk —
  including at least one **non-obvious / adjacent** archetype (the pool the manager
  hasn't thought of). Shown in the ICP editor's "How this ICP was reasoned" panel and
  as "the bets" in the recruiter brief (+ its hiring-manager export). Extends
  `sourcing_map.archetypes` (no migration — it's JSONB); `analyzeRole` prompt + schema.
- **The recruiter brief — one ranked shortlist across your pool + the market (Sourcing
  Brain, Slice 1b).** A **Build shortlist** action on the Source tab assembles the
  hiring-manager brief: the ICP **reasoning** ("what we're looking for") + a single
  shortlist **ranked across your own candidates (already scored) and the market (Pool
  B, scored on demand)** — each with source (your pool / market), bucket, score, the
  "why", and missing must-haves — plus **Copy for hiring manager** (a clean text
  export to paste into email/Slack). `src/modules/ats/domain/shortlist-brief.ts`
  (pure `buildShortlist` merge/rank, unit-tested) + `POST /api/jobs/[id]/brief` +
  `ShortlistBrief`. No migration.
- **Source the market — ICP-ranked sourcing over the Candidate Pool (Sourcing Brain
  + Pool B).** The Source tab now has a **"From the market"** section: it runs the job's
  approved ICP against the cross-org **Candidate Pool** (semantic recall +
  `match_pool_profiles` → Fit Engine — the same brain as your own pool), and ranks the
  matches (bucket, score, why, missing must-haves). **Unlock & add to pipeline**
  projects a chosen pool profile into a per-org candidate — copying its dated history
  into `candidate_experiences` — spends an unlock, and drops them into the job's
  pipeline. Gated on a pool subscription (self-serve 25-unlock trial). New
  `src/modules/pool/domain/pool-sourcing.ts` + `pool-unlock.ts`;
  `POST /api/jobs/[id]/source/pool` + `/source/pool/add`; `PoolSourcingSection`. No
  migration (reuses the pool tables + Slice 0's `candidate_experiences`). This is the
  consumption layer over the pool the other track is filling.
- **ICP reasoning — "how this ICP was reasoned" (Sourcing Brain, Slice 1a).** ICP
  generation now also produces a **reasoning layer** a recruiter/HM can read and argue
  with: a plain-English *why-this-ICP* narrative (what the role really is + why the
  competencies are weighted that way), the **requirement decomposition** (each
  requirement bucketed **hard-filter / ranking-signal / screen-later** with the
  findable proxy), and the **unwritten filters** it inferred (with the cost of applying
  each). Shown as a "How this ICP was reasoned" panel in the ICP editor. Stored on the
  ICP (`sourcing_map`, migration 116); `src/lib/ai/sourcing-strategist.ts` (pure prompt
  builder, unit-tested; a second Gemini pass that explains — never rewrites — the
  drafted ICP). Answers "where's the reasoning behind the first ICP."
- **Candidate Pool UI — the Resdex-style surface (`/pool`).** Search the cross-org
  pool by name/title/company, location, skill, minimum experience and **time in
  current role** (the movability signal — three years in a seat reads very
  differently from three months). New `src/modules/pool/domain/pool.ts` facade is the
  security boundary, not the query: because pool tables carry no `org_id`, nothing
  returns a row without first checking the org holds an active grant, and **contact
  details stay hidden until the profile is unlocked**. Orgs with no subscription get a
  self-serve trial (25 unlocks) rather than an empty page. Profile drawer shows the
  dated career arc, education, skills, and a **"Where this came from" provenance
  table** — every field with its source and trust score, conflicting values kept side
  by side rather than silently resolved. `GET/POST /api/pool`, `GET /api/pool/[id]`;
  nav entry under Recruiting.

### Schema
- **Candidate Pool — first-party sourcing pool (Component 05, Slice 5e; migration 115).**
  Nine tables for a cross-org pool of people who have *not* applied anywhere — a
  database an org subscribes to, alongside the ATS rather than inside it. Layered
  raw → resolved → curated → projection: `pool_documents` (append-only bronze, so a
  changed extraction rule re-derives without re-fetching), `pool_profiles` +
  `pool_identities` (resolved human vs per-platform account, so a merge stays
  reversible), `pool_profile_fields` (field-level provenance — conflicting values are
  kept, not silently resolved), `pool_experiences` (same shape as
  `candidate_experiences`, so promotion copies across untranslated), `pool_contacts`
  (isolated, own retention clock), and `pool_sources` (a registry, not an enum —
  trust weights drive fusion; `enabled=false` is a kill switch that drops a source's
  contributions from the resolved view without touching raw). `match_pool_profiles()`
  mirrors `match_candidates()` on an HNSW index. **Deliberate exception:** pool tables
  carry no `org_id` — the first cross-org store in a codebase where `requireOrg()`
  scoping is otherwise universal. `pool_access_grants` and `pool_unlocks` are the only
  org-scoped tables and form that boundary (grants = entitlement, unlocks = billing +
  audit + the record of who has seen whom).

### Added
- **Candidate Enrichment — structured, dated career history (Sourcing Brain, Slice 0).**
  Every incoming résumé is now broken into canonical structured fields — most
  importantly a **dated work history** (per-role title/employer/start–end), which
  nothing captured before (parsers flattened it to one current title + a single
  years-of-experience number). This is the substrate the reasoning brain needs for
  the movability/trajectory read, and the source-agnostic shape bought vendor data
  will conform to later. New `candidate_experiences` table + `education`/`enriched_at`
  on candidates (migration 114); `src/lib/ai/candidate-enrichment.ts` (pure date
  normalization + movability math + prompt, unit-tested) extracts via the existing
  PDF reader; runs automatically after any candidate with a résumé is created (queued
  `enrich_candidate` job, from the one canonical creation path → every ingestion flow
  benefits), refreshes the semantic embedding in the same pass, and backfills via
  `POST /api/candidates/enrich-backfill`. A **Career history** panel on the candidate
  (dated timeline + tenure/total-experience signals + education); `GET/POST
  /api/candidates/[id]/enrich`.

### Fixed
- **First-time ICP now derives competencies from the job, not the default four.**
  Two-part fix. (1) When a job has no genuinely-curated rubric, the generator now
  DESIGNS the competencies (role-specific names, weights summing to 100, behaviours,
  anchors, gates) from the role — JD, key requirements, nice-to-haves, target
  companies, level — instead of decorating the generic default set. (2) The detection
  itself was the real bug: a job's `custom_fields.scoring_criteria` is often populated
  with the **default four** (technical/experience/communication/culture) even when the
  recruiter never set a rubric, so the first attempt still enriched the defaults.
  `isDefaultRubric` now treats a rubric whose competencies are the default set — even
  reweighted — as "not custom", so generation kicks in. Only a genuinely curated
  rubric (different competencies) still enriches-in-place. All pure + unit-tested.
- **LinkedIn extension profile capture hardened.** `readName` now reads the `<main>`
  h1 first (a stray page-level/hidden h1 could win before); headline/location have
  extra fallback selectors; the panel now shows a "Read from page →" readout (and
  logs the captured profile) so a bad scrape is visible at a glance.

### Added
- **Intake-call capture for ICP (Component 04).** The ICP generator can now take the
  hiring-manager **intake call notes/transcript** (optional textarea on "Generate
  ICP") and lift their verbatim phrasing + hard must-haves straight from the
  conversation — closing the "form-only intake, no verbatim" gap. Additive to
  `generateIcp` / the generate route; no migration.
- **Conversation analytics via Copilot (Component 12).** New `get_interview_notes`
  Copilot tool queries the interview corpus (AI summaries + competency-mapped notes,
  concerns, follow-ups) for a candidate or application — so you can ask "what did the
  interviews say about X" or build an evidence view across rounds.
- **Interview Notetaker + scorecard auto-fill (Components 10 & 11).** Bring-your-own
  transcript: on any interview (candidate → Interviews), paste the transcript and
  **Generate notes** → a TLDR summary + notes mapped to the ICP competencies
  (strong/mixed/weak signal + evidence) + highlights, concerns, follow-ups. Then
  **Draft scorecard** turns it into objective 1–4 ratings per competency (no overall
  recommendation — the interviewer decides), to review and fill their scorecard.
  `src/lib/ai/notetaker.ts` (pure builders, tested); `POST/GET /api/interviews/[id]/notes`,
  `POST /api/interviews/[id]/scorecard-draft`; `InterviewNotesPanel`. Migration 113
  adds transcript/ai_summary/ai_notes to `interviews`. (Auto-join/transcription bot is
  a later integration; this is the AI core.)
- **AI Screening — async, ICP-scored (Component 07).** From a candidate's AI
  Assessment, **Start screen** generates ~5 ICP-targeted questions and a private link
  (`/screen/[token]`, no login). The candidate answers async; the AI scores the
  answers against the job's ICP competencies (reusing the Fit Engine's deterministic
  combine) and the result — bucket, score, per-competency evidence, summary — shows
  back on the candidate. Recruiter shares the link (not auto-sent). New
  `screening_sessions` table (migration 112), `src/lib/ai/screening.ts` (pure prompt
  builders, tested), `POST/GET /api/applications/[id]/screen`, public
  `GET/POST /api/screen/[token]`, `AiScreenPanel`.
- **Copilot can now source & read ICPs (Component 14).** Two new Copilot tools:
  `source_candidates` (runs ICP-driven sourcing for a job via the Fit Engine and
  returns ranked matches with bucket/score/why + candidate ids to feed
  `bulk_add_to_pipeline`) and `get_icp` (reads a job's current gates + weighted
  competencies so the agent can explain what "good" looks like). Wired into
  `executeTool` + the capability map (`source_candidates` → recruiting:edit,
  `get_icp` → recruiting:view). Closes the deferred autonomous-sourcing gap.
- **AI job-post review (Component 13).** A one-click QA pass over a job's post —
  scores **clarity / inclusivity / engagement / completeness** (1–5), lists concrete
  issues (severity + the exact quote + a suggested fix), and offers a tightened
  opening paragraph. Read-only — it suggests, the recruiter edits. Appears under the
  job description on the job's details view. `src/lib/ai/job-post-review.ts` (pure
  prompt builder + HTML→text, unit-tested); `POST /api/jobs/[id]/post-review`.
- **Reusable role templates — "calibrate once, reuse" (Component 02, Recruiting
  Knowledge).** Save any job's ICP (its hard gates + weighted competencies) as a
  named **role template**, then start a new job's ICP from it instead of a cold,
  JD-derived seed. On the ICP editor: **Save as template** (footer) and, when a job
  has no ICP yet, **Start from a saved role…** alongside Generate. New `role_templates`
  table (migration 111), `src/modules/ats/domain/role-templates.ts` facade (pure
  `templateToDraftInput`, unit-tested), `GET/POST /api/role-templates`,
  `DELETE /api/role-templates/[id]`, `POST /api/jobs/[id]/icp/from-template`. Added a
  `'template'` ICP source.
- **LinkedIn extension is now fit-aware (Component 08, Slice 8c-3).** The on-profile
  panel now reads more of the viewed profile (headline, location, About, a little
  experience — still button-first, only what's on screen), lets you pick one of your
  jobs and **Evaluate fit** (shows the Great/Good/Okay bucket, score, why, and any
  missing must-haves), then **Add to sequence** with the first message personalized
  from that fit — and an optional "Review first message before it sends" checkbox.
  With no job picked it behaves exactly as before. `background.js` gains `getJobs` /
  `score` calls; no new permissions (same domain, same page).
- **Personalized enrollment from the LinkedIn extension (Component 08, Slice 8c-2).**
  `POST /api/ext/enroll` now optionally takes the `job_id` the profile was scored
  against plus the computed `fit` — and enrolls with a **personalized first message**
  drafted from that fit (reusing 8b-1), ties the enrollment to the job, and supports
  `review` (hold for approval, 8b-2). Fully backward compatible: without `job_id`/`fit`
  it behaves exactly as before (plain template). Also stores the scraped headline as
  the candidate's title.
- **Fit scoring for the LinkedIn extension — backend (Component 08, Slice 8c-1).**
  Groundwork to make the "add from LinkedIn" extension as smart as in-app sourcing:
  `POST /api/ext/score` scores a viewed LinkedIn profile against a chosen job's
  **approved ICP** with the Fit Engine (read-only, scores nothing to the DB), and
  `GET /api/ext/jobs` lists the jobs that have an approved ICP (for a picker). The
  Fit Engine's judge now accepts an optional free-text profile blurb (the About +
  experience narrative the structured fields miss) — additive, existing callers
  unchanged. Pure `buildFitCandidate` / `buildProfileText` normalizers in
  `src/lib/ai/ext-profile.ts` (unit-tested). Both routes are API-key authenticated.
  (Personalized enrollment + the extension UI are the next slices, 8c-2 / 8c-3.)
- **Review-before-send for sourced outreach (Component 08, Slice 8b-2).** When
  enrolling matches from the Source tab you can now tick **"Review before sending"** —
  each enrollment is *held* (no send scheduled) and its personalized first message
  appears in an **"Awaiting your review"** panel with **Approve** (schedules the send)
  or **Reject** (cancels, nothing goes out). Delivers the recruiter's "see the message
  before it goes" mode without touching the auto-send path (8b-1). New: held-enrollment
  flag on `enrollCandidate` + reusable `enqueueFirstStage`; `GET
  /api/jobs/[id]/source/pending-review`; `POST /api/sequences/enrollments/[id]/review`
  (approve/reject, with optional edits to the message). Reviews the AI-personalized
  first message; follow-up template steps still auto-send.
- **Personalized outreach sequences from sourcing (Component 08, Slice 8b-1).** The
  Source tab can now enroll selected matches into a sequence — with each candidate's
  **first message personalized from their Fit-Engine evidence** ("here's specifically
  why we're reaching out"). `src/lib/ai/outreach-draft.ts` drafts the intro from the
  sourcing match's rationale + per-competency evidence; `enrollCandidate` stores it as
  a per-enrollment override; the `sequence_email` handler prefers it for stage 0 (later
  steps use the shared template). The sequence then sends per its own schedule. Endpoint
  `POST /api/jobs/[id]/source/enroll`; pure prompt builder unit-tested. (Review-before-send
  mode is the next slice, 8b-2.)
- **Semantic sourcing with embeddings (Component 05, Slice 5c).** Sourcing shortlists
  by *meaning*, not just keywords: it embeds the ICP and the candidate pool (Gemini
  `text-embedding-004`, 768-dim) and finds nearest candidates via a pgvector
  `match_candidates` RPC before the Fit Engine — falling back to the 5a keyword overlap
  when a candidate has no embedding or pgvector is unavailable (fully additive).
  `embedText`/`embedTexts` in `llm.ts`; pure text builders in `src/lib/ai/embeddings.ts`
  (tested). Backfill via `POST /api/candidates/embed` + an "Embed pool" button on the Source tab.
- **Cold-start calibration (Component 05, Slice 5b).** The Source tab now lets you
  mark 👍/👎 on sourced candidates; a **Calibrate** toggle surfaces a *diverse* ~15
  (`src/lib/ai/calibration.ts` — even spread across the score range so it spans
  clear-yes, clear-no, and the borderline middle, where a decision carries the most
  signal). Once ≥5 decisions are in, **Refine ICP** feeds them into the 6c feedback
  loop — and the loop now folds in these sourcing decisions (the "no"s that never
  became applications) alongside pipeline decisions. Endpoint
  `POST /api/jobs/[id]/source/decide`; pure sampler unit-tested.
- **Sourcing — rank your candidate pool by the ICP (Component 05, Slice 5a).** A new
  **Source** tab on the job (`SourcingTab.tsx`) ranks the org's existing candidates
  against the job's approved ICP: a cheap deterministic pre-filter
  (`src/lib/ai/sourcing-rank.ts` — keyword overlap + location/experience) shortlists,
  then the Fit Engine scores the top ~20, and the matches (score, fit bucket, gate
  failures, rationale) are cached. Recruiters select and **Add to pipeline** as
  `applications(source:'sourced')`. Endpoints: `GET`/`POST /api/jobs/[id]/source` and
  `POST /api/jobs/[id]/source/add`. Never runs the LLM over the whole DB — two-pass by
  design; embeddings (5c) will replace the overlap step at scale. Pure ranking unit-tested.

### Schema
- **`111_role_templates.sql`** — new `role_templates` table (org-scoped reusable role
  calibrations: gates + competencies snapshot, `source_job_id`). (Component 02)
- **`110_sequence_enrollment_review.sql`** — adds `awaiting_review` (held-for-review
  flag) and `job_id` (ties a held enrollment back to its Source tab) to
  `sequence_enrollments`, plus a partial index for the review queue. (8b-2)
- **`109_sequence_enrollment_intro.sql`** — adds `intro_subject` / `intro_body` to
  `sequence_enrollments` (per-enrollment personalized first message; used for stage 0).
- **`108_candidate_embeddings.sql`** — enables pgvector, adds `candidates.embedding
  vector(768)` + an ivfflat index + the `match_candidates(query, org, count, exclude)`
  nearest-neighbour function. (Enabling the `vector` extension may need the Supabase dashboard.)
- **`107_sourcing_decision.sql`** — adds `decision` / `decided_at` / `decided_by` to
  `sourcing_matches` so calibration yes/no on sourced candidates can feed the ICP loop.
- **`106_sourcing_matches.sql`** — per-job cache of ICP-driven candidate matches
  ({score, fit_bucket, gate_failures, red_flags, rationale, competencies, icp_version};
  unique on job_id+candidate_id; staleness via icp_version). Service-role RLS.

## 2026-08-15

### Added
- **ICP feedback loop (Component 06, Slice 6c).** `src/lib/ai/icp-feedback.ts` +
  `POST /api/jobs/[id]/icp/refine-from-feedback` turn accumulated recruiter
  Yes/Maybe/No decisions on scored candidates into a proposed ICP refinement — a new
  DRAFT version to review and approve (the living-spec loop). `summarizeFeedback`
  categorises where the ICP was too harsh (recruiter Yes ↔ ICP "okay") or too generous
  (recruiter No ↔ ICP "good/great"); Gemini proposes targeted edits (weight nudges,
  behaviours, gate add/remove); `applyRefinement` merges them deterministically and
  re-normalises weights to 100. Gated on ≥5 decisions. Pure summarise/apply logic
  unit-tested. **UI (6c-b):** a "Refine from feedback" button on the approved ICP in
  `IcpEditor` runs it, loads the proposed draft for review, and shows the change
  summary (or "N/5 decisions so far" when there isn't enough feedback yet).
- **Fit Engine results in the UI (Component 06, Slice 6b).** The candidate AI
  Assessment card (`SummaryTab.tsx`) now surfaces the Fit Engine output: the
  Great/Good/Okay **fit bucket** beside the recommendation, a red **"Missing
  must-have"** banner listing failed gates, **per-competency evidence** under each
  rating bar, the **rationale**, and a **Red flags** list. The candidate drawer
  (`CandidateDrawer.tsx`) gets a compact "Missing must-have" pill. All read the new
  `applications` fields via a loose view (not yet in generated types).
- **Fit Engine — ICP-driven scoring (Component 06, Slice 6a).** When a job has an
  approved ICP, the bulk scorer (`/api/jobs/[id]/score`) now runs a two-stage
  evaluation via `src/lib/ai/fit-engine.ts`: (1) deterministic hard **gates** from
  the ICP must-haves (`evaluateGates`), (2) a Gemini judge rating each competency
  1–4 against its behaviours/anchors with evidence, red flags, strengths, gaps and a
  rationale. The 0–100 score + Great/Good/Okay bucket are computed **deterministically**
  from the ICP weights (`combineFit`) — the model never sets the number. A gate
  failure caps the bucket and sets `knockout_failed` but never auto-rejects; a human
  decides. Jobs without an approved ICP keep using the flat-rubric Sifter unchanged.
  Pure gate/combine logic is unit-tested.

### Schema
- **ICP (Ideal Candidate Profile) object — migration `104_icp.sql`.** New `icps`
  table: versioned per job, keyed to canonical `jobs.id`, with must-haves +
  competencies + changelog as JSONB and a partial unique index enforcing one
  approved version per job. Slice 1a of the Metaview-style ICP work. Embedding
  deferred to the Fit Engine (no pgvector). Not yet in generated Supabase types.

### Changed
- **"Team on this job": the hiring manager is now tagged by the round they run**
  (e.g. "Round 2"), like every other interviewer, instead of a redundant "hiring
  manager" tag — the HM is already identified on the Overview. A HM who runs no
  round keeps the "hiring manager" tag. File: `src/components/req-jobs/JobTeamRoster.tsx`.

- **Job Overview: Linked requisitions moved into the right sidebar** (under "Team on
  this job"), and a new **Scoring rubric** summary card added below it — each
  criterion with its weight and a proportional bar, an Edit link to the Scoring tab,
  and a "set one up" empty state. Files: `src/components/req-jobs/JobDetail.tsx`,
  `src/components/req-jobs/ScoringRubricSummary.tsx`.

### Added
- **ICP object: types, facade & API (Slice 1a).** `src/lib/types/icp.ts` (an
  `IcpCompetency` is a superset of `ScoringCriterion`), a `src/modules/ats/domain/icp.ts`
  facade (get current / versions / create-draft / update-draft / approve / refine),
  and `/api/jobs/[id]/icp` routes (GET current, POST draft, PUT draft, POST approve,
  GET versions). Approving an ICP down-projects (`icpToScoringCriteria` in
  `src/lib/scoring.ts`) back to `jobs.custom_fields.scoring_criteria`, so the board
  and the Sifter keep working unchanged. No AI/UI yet (Slices 1b/1c).
- **ICP seeding & editor (Slice 1b).** `deriveIcpSeed()` (`src/lib/ai/icp-seed.ts`,
  LLM-free) maps a job's existing rubric + location + level into a draft ICP, exposed
  via `POST /api/jobs/[id]/icp/generate`. A new **ICP editor** on the job's Scoring tab
  (`src/components/req-jobs/IcpEditor.tsx`) generates a draft, edits hard must-haves +
  weighted competencies with observable behaviours, and approves it — approving syncs
  the flat rubric back so the Scoring rubric card stays in step.
- **ICP LLM enrichment (Slice 1c).** `generateIcp()` (`src/lib/ai/icp-generator.ts`)
  layers Gemini 2.5 Pro on top of the deterministic seed — drafting observable
  behaviours + 1–4 anchors + verbatim per competency and pulling hard must-have
  gates from the requirements. Competency ids/names/weights are preserved (the
  rubric always sums to 100), and any AI failure falls back to the plain seed, so
  "Generate ICP" always returns something usable. `POST /api/jobs/[id]/icp/generate`
  now uses it.
- **Scoring rubric is now a first-class job-setup step.** A new **Scoring** tab on
  the job page (`/req-jobs/[id]`, between Application form and Interview plan) lets
  you define the weighted criteria the AI scores candidates against — add/remove
  criteria, adjust weights, must total 100%. Editable any time. The Publish action
  now runs a soft, non-blocking **pre-publish nudge**: if a job is missing screening
  questions and/or a scoring rubric, it prompts you to set them up (jump to the tab)
  or "Publish anyway" — the same pattern the screening-questions nudge already used.
  No blanket default is ever auto-applied; a rubric-less job scores holistically
  until you set one. Files: `src/components/req-jobs/ScoringTab.tsx`,
  `src/components/req-jobs/JobDetail.tsx`, `src/lib/scoring.ts`.

## 2026-08-14

### Added
- **Candidate Summary tab now shows the candidate's form answers.** A new
  "Application Answers" card surfaces the screening responses (question bold, answer
  beneath) right on the Summary tab, so a recruiter sees them without opening the
  Forms tab. File: `src/components/candidates/center/SummaryTab.tsx`.

### Changed
- **AI summary prompt tightened.** Now asks for ~2 short paragraphs and explicitly
  forbids restating logistics the recruiter already sees (which job, pipeline stage,
  application dates, acknowledgement emails) — so the summary focuses on who the
  candidate is + a recommendation, and the AI Assessment box is shorter. Updated in
  all three copies: Django `candidates/views.py`, `src/lib/api/job-handlers.ts`,
  `src/app/api/candidates/[id]/ai-summary/route.ts`. Affects newly-generated
  summaries (hit Regenerate to refresh an existing one).
- **AI Assessment card polished.** Score sits in a light neutral panel; the summary
  gets a clear bold "Summary" heading with an underline rule; criterion/strength/gap
  text darkened for readability.
- **"Regenerate" now (re)scores AND re-summarizes together, and persists.** The
  button scores the selected application then refreshes the summary (previously the
  score and summary were generated in separate flows, so a manually-added
  application showed "Not scored"). New endpoint `POST /api/applications/[id]/score`
  scores one application via the shared scorer. Files:
  `src/app/api/applications/[id]/score/route.ts`, `SummaryTab.tsx`.

## 2026-08-13

### Added
- **Candidate Summary tab: AI Score and AI Summary merged into one "AI Assessment"
  card** (score on the left, summary on the right; single Regenerate in the header).
  File: `src/components/candidates/center/SummaryTab.tsx`.

### Fixed
- **Jobs list now shows the Hiring Manager.** The board column read
  `hiring_manager_name`, but the Django job-list serializer only filled it from
  `custom_fields.hiring_manager_name` — empty for jobs whose HM is an assigned user
  or an intake-form name — so the column was always blank. It now resolves the name
  like the detail endpoint: assigned member's real name, else custom field, else
  intake name. (Django: `hiring/views_hiring_requests.py`, `hiring/models.py`,
  `ai/models.py`.)
- **AI summaries now persist.** They were generated on demand and never stored —
  the Django endpoint only returned a summary (no save, no read), and the Next.js
  code expected a `candidates.ai_summary` column that never existed — so a summary
  vanished on reload and had to be regenerated (extra cost + wait) every view. They
  now live in a dedicated `candidate_ai_summaries` table (one current row per
  candidate): Django saves on generate and serves it via a new GET; the Next.js
  facade/route/job-handler read and write the same table.
  Files: `candidates/models.py` + `candidates/views.py` (Django),
  `src/modules/ats/domain/candidates.ts`, `src/app/api/candidates/[id]/ai-summary/route.ts`,
  `src/lib/api/job-handlers.ts`.

### Schema
- **103_candidate_ai_summaries** — new table storing one AI summary per candidate
  (org_id, candidate_id unique, summary, model, generated_by, generated_at).

### Fixed (RBAC)
- **An assigned hiring manager can now see and approve the interview plan they're
  responsible for.** The "Hiring Manager" role grants `approvals:approve` but not
  `recruiting:view`, yet the Interview-plan read and the hiring-manager read were
  gated on `recruiting:view` — so the HM's Overview showed "— none —" for the HM
  and the Interview-plan tab never rendered the Approve/Reject buttons (they could
  only reach it via the bell notification, whose link was also mis-routed to
  `/jobs/:id`). Reads are now **job-scoped**: allowed for anyone with
  `recruiting:view`, or the assigned hiring manager for *that* job — encoding the
  rule that a permission carries the reads needed to use it, without widening the
  role. New helper `canViewJob`/`assertCanViewJob` + `withScope` wrapper.
  Files: `src/lib/rbac.ts`, `src/lib/api/helpers.ts`,
  `src/app/api/jobs/[id]/interview-plan/route.ts`, `.../hiring-manager/route.ts`.

### Added
- **Interview-plan approvals now appear in the Approvals inbox.** Previously the
  inbox listed only time-off requests, so interview-plan sign-offs were reachable
  only via the bell. They now show under "Pending decisions" (with proposed-round
  count + a Review link to the plan tab) for the assigned approver. New endpoint
  `GET /api/me/interview-plan-approvals`; the submit/decision notifications now
  deep-link correctly to `/req-jobs/:id` (new `req_job` notification resource type).

### Fixed
- **Cancelling an interview now removes its calendar event.** `/api/interviews/:id`
  was proxied to the Django backend (an "afterFiles" rewrite that shadows the
  dynamic Next.js route), and Django's cancel handler only flips the DB status —
  it never calls Google/Teams/Zoom to delete the event. So a cancelled interview
  vanished from the app but lingered on the interviewer's calendar. Removed the
  `/api/interviews` + `/api/interviews/:id` rewrites so the Next.js route handles
  them; it already runs the calendar side effects (`runInterviewCancellationSideEffects`)
  on cancel/delete. Create and cancel are now symmetric (both on Next.js).
  Files: `next.config.mjs`, `src/app/api/interviews/[id]/route.ts`.

### Changed
- **Interview PATCH hardened to match the Django contract** now that Next.js owns it:
  updates are restricted to an allowlist (can't overwrite `org_id`/`candidate_id`/`id`),
  and History events attribute to the acting user (`userId || orgId`) instead of the
  org — so the Feed shows a person, not an org id.

## 2026-08-12

### Added
- **Interview Plans — a per-job hiring plan (Phases A–D).** Every job can define an
  ordered list of interview **rounds** (name, type, interviewer, duration, optional
  pipeline stage) on a new **"Interview plan"** tab. Rounds pick a real **team
  member** as the interviewer, and the job shows an auto-built **"Team on this job"**
  roster (hiring manager + interviewers). The **hiring manager is now a first-class
  team member** (a real user on the job, `jobs.hiring_manager_user_id`), not just an
  intake name. Once a job is **Active** and has a plan, **changes require the hiring
  manager's approval** (parked as a pending change; strict — only the assigned HM
  decides, Owner/admin only as the no-HM fallback), with **email + Slack DM + in-app**
  notifications to the HM on submit and the requester on decision. **Scheduling
  follows the plan**: "Schedule Interview" pre-fills the next round (type, duration,
  interviewer) with a Round dropdown, links the booked interview to its round,
  advances the candidate to the round's stage, and the candidate page shows a
  round-by-round **progress strip**. Files: `src/components/req-jobs/InterviewPlanTab.tsx`,
  `JobTeamRoster.tsx`, `JobHiringManagerPicker.tsx`, `src/components/ScheduleInterviewModal.tsx`,
  `src/app/api/jobs/[id]/interview-plan/**`, `.../hiring-manager/route.ts`,
  `src/lib/interview-plan/notify.ts`, `src/lib/team-members.ts`.

### Fixed
- **Add to Job / Change Status now use the canonical `job_id`** (were on the dropped
  `hiring_request_id` path — "Unknown Role", empty stage list). Tests added.
- **Intermittent candidate-page crash** — `CandidateProfileContent` called `useMemo`
  after an early return; moved above the guards so the hook order is stable.
- **Default candidate view** now opens the application the candidate is furthest
  along in, so adding them to a new job no longer hijacks the view.
- **Duplicate person in the "Team on this job" roster** — a hiring manager who also
  ran a round appeared twice; the roster now dedupes by person.
- **Interviews from another job bled into the candidate view.** The candidate page's
  **Interviews** section loaded by candidate only, so an interview scheduled on one
  job showed while viewing a different job. It now scopes to the selected job
  (`/api/interviews?application_id=…`), matching the Feed and pipeline.
  File: `src/components/candidates/center/InterviewsTab.tsx`.

### Changed
- **Candidate page: job switching moved to the left "Jobs Considered For" list.**
  Removed the center job-picker row; the view shows one job at a time and you switch
  from the left cards (current job highlighted). Header pluralizes by job count.
- Job tabs restyled to match the Summary / Activities & Progress tabs (coffee pill +
  green underline on the selected job); dropped the confusing "· Active" tab label.
- Scheduling availability calendar now uses **30-minute** slots (was 15-minute).

### Schema
- `099` interview_plans + interview_plan_rounds; `100` jobs.hiring_manager_user_id;
  `101` interview_plans.pending_rounds/pending_meta; `102` interviews.plan_round_id.

## 2026-08-11

### Added
- **Collapsible sidebar.** A small round chevron disc on the right edge of the
  desktop nav pane (the coffee-brown `#221b14` rail), aligned with the Dashboard
  row, collapses the pane to zero width so the page gets full room. The disc
  stays as an "expand" handle when collapsed and the chevron flips; the choice is
  remembered per browser via `localStorage` (`rs.sidebarCollapsed`).

## 2026-08-09

### Changed
- **Candidate page declutter.** Collapsed the six top action buttons (Schedule
  Interview, Phone Screen, Add to Sequence, Draft Email, Create Offer, Add
  Scorecard) into a single **Actions** menu. Reduced the four center tabs to two
  — **Summary** and **Activities & Progress** — styled as pills in the sidebar
  "coffee" colour (`#221b14`) with a green underline marking the active tab.
  **Pipeline Activity** is now a Stage/Date table (was a horizontal flow) with the
  current stage highlighted. **Skills** in the left panel replaced its edit pencil
  with a fold chevron that caps long lists at 6 (`+N more`). Files:
  `src/components/candidates/CenterPanel.tsx`, `LeftPanel.tsx`,
  `center/ActivitiesTab.tsx`, `center/InterviewsTab.tsx`, `center/SummaryTab.tsx`.

### Fixed
- **"Add to Job" and "Change Status" now use the canonical `job_id`.** Both were
  built on the legacy `hiring_request_id` path: "Add to Job" wrote the job id into
  the dropped-table column (leaving `job_id` null → "Unknown Role", no stage), and
  "Change Status" loaded pipeline stages by `hiring_request_id` (empty list for
  canonical apps). Add-to-Job now posts `job_id`; the applications POST route,
  insert schema, and dedup guard accept/use it; `/api/pipeline-stages` and the
  Change-Status dropdown load stages by `job_id` (legacy fallback kept). Files:
  `src/lib/hooks/useModals.ts`, `src/app/api/applications/route.ts`,
  `src/lib/validations/applications.ts`,
  `src/components/candidates/AddToJobModal.tsx`,
  `src/app/api/pipeline-stages/route.ts`,
  `src/components/candidates/ChangeStatusDropdown.tsx`.

### Removed
- **Interview Progress table** and the **History** timeline from the candidate's
  Activities & Progress tab (History is covered by the right-side Feed). Deleted
  `center/HistoryTab.tsx` and `InterviewProgressTable.tsx`. Also dropped the
  redundant **Hired** entry from Change Status → "Move to Stage" (it stays under
  "Mark As", where the terminal status carries downstream meaning).

### Added
- Tests locking in canonical application linkage: `createApplication` anchors on
  `job_id` not `hiring_request_id`; the insert schema accepts `job_id` and requires
  an anchor; `/api/pipeline-stages` accepts `job_id`. Files:
  `src/modules/ats/domain/__tests__/create-application-canonical.test.ts`,
  `src/lib/validations/__tests__/applications-canonical.test.ts`,
  `src/app/api/pipeline-stages/__tests__/route.test.ts`.
## 2026-08-05 — Native Slack integration (Slice 4: slash command)

### Added
- **`/recruiterstack search <name or title>` slash command.** Recruiters can search
  candidates from inside Slack and get a rich, ephemeral result list (name, title,
  active jobs, status) with an **Open** link per candidate. Reuses the app's existing
  search (`searchCandidatesForAgent` + `listActiveApplicationsByCandidatesWithJobTitle`).
  The invoking Slack user is resolved to their RecruiterStack account (cached) and gated
  on `recruiting:view`, so results never leak to someone without access. New:
  `src/app/api/slack/commands/route.ts`, `src/lib/slack/handlers/commands.ts`,
  `buildSearchResultsBlocks` in `src/lib/slack/blocks.ts`. Signature-verified via the
  existing generic `verifySlackSignature`.

### Setup (no code)
- Register the slash command in the Slack app dashboard: **Command** `/recruiterstack`,
  **Request URL** `${APP_URL}/api/slack/commands`. The `commands` scope was already
  granted in the Slice 3 reconnect; a one-time reinstall may be needed for the command
  to appear in the workspace.

## 2026-08-05 — Native Slack integration (Slice 3: channel posting)

### Added
- **Native channel posting.** When an admin picks a channel (new picker in Settings →
  Integrations → Slack App), lifecycle alerts post there via bot-token
  `chat.postMessage` as **rich messages with working buttons** (Move-stage / Add-note /
  Open) instead of the plain-text webhook. The existing interaction dispatcher handles
  channel button clicks with no changes. Files: `src/lib/slack/dispatch.ts`,
  `src/lib/slack/client.ts` (`conversationsList`), `src/app/api/slack/channels/route.ts`,
  `src/app/(dashboard)/settings/page.tsx`.
- **Per-candidate threading.** The first channel post for a candidate is remembered
  (`slack_channel_messages`); later events (`stage_moved`, `candidate_hired`) reply
  in-thread so each candidate's updates stay together.
- **Wider OAuth scopes + reconnect prompt.** Install now requests `chat:write.public`,
  `channels:read`, `groups:read`, and `commands` (the last pre-authorises the upcoming
  slash command, so no second reconnect). The Slack App card prompts admins to reconnect
  when channel posting isn't yet enabled. `src/app/api/slack/install/route.ts`.
- **Backward compatible:** orgs with no channel chosen (or not reconnected) keep the
  existing plain-text webhook path.

### Schema
- **Migration `098_slack_channel.sql`** — adds `org_settings.slack_channel_id` /
  `slack_channel_name` and a `slack_channel_messages` thread-anchor table (RLS +
  service-role policy + updated_at trigger). **Apply manually in the Supabase SQL Editor.**

## 2026-08-05 — Native Slack integration (Slices 1–2)

### Added
- **Interactive lifecycle Slack DMs.** The three routed events (`candidate_applied`,
  `stage_moved`, `candidate_hired`) now DM recruiters/hiring managers a rich Block
  Kit message with working buttons: **Move to next stage**, **Add note** (modal),
  and **Open in RecruiterStack**. Buttons reuse the same domain facades as the web
  app (`updateApplicationStage`, `recordApplicationEventSafe`) and are gated on the
  clicker's `recruiting:edit` capability. Channel posts are unchanged (plain-text
  webhook). Files: `src/lib/slack/blocks.ts`, `src/lib/slack/handlers/applications.ts`,
  `src/lib/slack/dispatch.ts`, `src/modules/ats/domain/applications.ts`
  (`getApplicationStageProgression`).
- **Generalized Slack interaction dispatcher.** `/api/slack/interactions` is now a
  thin router that resolves the acting user once and dispatches by `action_id` /
  `callback_id` via a registry (`src/lib/slack/actions.ts`), instead of being
  hard-wired to approvals. Approvals were moved behind the registry with identical
  behavior (`src/lib/slack/handlers/approvals.ts`).
- **Shared Slack Web API client** (`src/lib/slack/client.ts`) — consolidates the
  bot-token/decrypt/fetch boilerplate previously duplicated across notifications,
  the interactions route, and approvals. `notifySlackDM`, approvals, and the route
  now use it.
- **Slack ↔ RecruiterStack identity cache** (`src/lib/slack/identity.ts`) — resolves
  Slack users to RS users (and back) via the new `slack_user_map` table, hitting the
  Slack API only on a cache miss. Makes DMs reliable and fixes repeat live lookups.

### Schema
- **Migration `097_slack_user_map.sql`** — new `slack_user_map(org_id, user_id ↔
  slack_user_id)` cache table (RLS + service-role policy + updated_at trigger).
  **Apply manually in the Supabase SQL Editor.**

## 2026-08-05

### Added
- **Candidate History now captures many previously-invisible actions.** Sequence
  emails, tags added/removed, tasks created/completed, review-triage decisions,
  profile edits, scorecard submissions, and interview reschedules/deletions now
  write to the History timeline. Added a shared, non-throwing logging helper plus
  a candidate→application resolver (History is application-scoped, so candidate-
  level actions attach to the candidate's most-recent application; CRM-only
  contacts with no application are skipped). New `application_events` types:
  `tag_added`, `tag_removed`, `task_created`, `task_completed`, `review_triaged`,
  `candidate_updated`, with icons/labels in the History tab. Files:
  `src/modules/ats/domain/applications.ts` (helpers), `src/lib/api/job-handlers.ts`
  (sequence emails), `src/app/api/candidates/[id]/tags/**`, `.../tasks/**`,
  `src/app/api/scorecards/route.ts`, `src/app/api/applications/[id]/route.ts`
  (review triage), `src/app/api/candidates/[id]/route.ts` (profile edits),
  `src/app/api/interviews/[id]/route.ts` (reschedule + delete),
  `src/components/candidates/center/HistoryTab.tsx`, `src/lib/types/database.ts`.
  Still pending (backend/Django): inbound candidate email replies and AI
  phone-screen started/completed.

### Changed
- **Sequence "Reply-To" address is now masked behind a friendly display name.**
  The per-enrollment `reply+<id>@…` routing address stays intact, but the mail
  client now shows the sender name (e.g. "RecruiterStack Hiring Team") instead of
  the raw token. Files: `src/lib/api/job-handlers.ts`, `src/lib/email/send-reply.ts`.
- **Sequence link tokens hyperlink your selected text.** Select any text in the
  message body and click "+ Phone Screen Slots" or "+ HM Calendar Link" to turn
  that text into the link (the `{{token}}` sits in the href and is rewritten to
  the real URL at send-time, so candidates see friendly wording, never a raw URL).
  With nothing selected, the button drops in an editable default phrase instead.
  Preview now resolves the phone-screen token too. File:
  `src/components/sequences/SequenceStageEditor.tsx`.

## 2026-07-22

### Fixed
- **Candidate detail (and offers / applications / interviews / email drafts / AI
  summary) returned 500s because 6 API routes still embedded the dropped
  `hiring_requests` table.** The canonical migration removed `hiring_requests`, but
  these PostgREST relationship embeds survived — masked until now by a stale schema
  cache, which is why the pages broke seemingly out of nowhere. Repointed each at the
  canonical `jobs`/`openings` (title, department, hiring-manager email);
  `ticket_number` and job `level` have no canonical field and are now null. Also
  hardened `useCandidate` to stop loading on error responses instead of hanging on
  "Loading…" forever. Files: `src/app/api/candidates/[id]/route.ts`,
  `src/app/api/candidates/[id]/ai-summary/route.ts`,
  `src/app/api/applications/[id]/route.ts`,
  `src/app/api/applications/[id]/email-draft/route.ts`,
  `src/app/api/interviews/[id]/route.ts`, `src/app/api/offers/[id]/route.ts`,
  `src/lib/hooks/useCandidate.ts`.

## 2026-07-25

### Fixed
- **New organizations came up with an empty sidebar (no capabilities).** The
  system RBAC roles (Owner / Recruiter / Hiring Manager) were only ever seeded by
  the one-time migration backfill (`SELECT DISTINCT org_id FROM org_members`), so
  a brand-new org had none — `ensureDefaultMemberRole` then found no role to
  assign and the member landed with zero capabilities, hiding the whole left nav.
  Added `ensureSystemRoles(supabase, orgId)` (mirrors migrations 065 + 092) and
  call it inside `ensureDefaultMemberRole` before the role lookup, so every org's
  three system roles are seeded on member setup. Idempotent and self-healing —
  any already-affected org is repaired on next touch. File: `src/lib/rbac.ts`
  (+ `src/lib/__tests__/rbac-seed.test.ts`).

### Changed
- **Word/ODF CVs now render as faithful PDFs, not flattened text.** Replaced the
  mammoth `.docx`→HTML path (which discards direct formatting — most real resumes
  use manual bold/bullets, not Word styles, so they came out as plain paragraphs)
  with true document rendering via headless LibreOffice. New stateless Django
  endpoint `POST /api/office-to-pdf` (bytes in, PDF out; guarded by a shared
  `INTERNAL_API_SECRET`, not Clerk) converts doc/docx/rtf/odt. The Next.js resume
  route calls it for office extensions, streams the PDF inline, and caches the
  render next to the immutable source object so each CV converts once.
  - *Ops:* the Django image now installs `libreoffice-writer` + metric-compatible
    font packs (Liberation/Carlito/Caladea for Arial/Calibri/Cambria, DejaVu, Noto,
    Indic). **Requires a new `INTERNAL_API_SECRET` env var set identically on both
    Vercel and Railway.**
  - *Files:* `Dockerfile`, `core/views_convert.py`, `core/urls.py`,
    `core/middleware.py`, `config/urls.py`, `config/settings/base.py` (Django);
    `src/app/api/candidates/[id]/resume/route.ts`, `src/lib/storage/resume.ts`,
    `src/components/candidates/center/SummaryTab.tsx` (Next.js).

## 2026-07-21

### Fixed
- **CV preview was blocked by `X-Frame-Options: DENY` — the actual cause of the
  blank/"refused to connect" viewer.** The header has applied to `/(.*)` since
  `079c9cb` (2026-03-22), but was harmless while the viewer framed a Supabase URL:
  the header only binds the response that actually loads in the frame. It turned
  fatal on **2026-07-14** in `529c7ca`, when the resume route stopped 302-redirecting
  to a Supabase signed URL and began streaming bytes from our own origin — so the
  framed response started carrying DENY. This broke *all* CV previews, PDFs
  included; the "Word docs can't be previewed" card added later the same day
  (`f1475cd`) misattributed the blank viewer to the file format.
  The catch-all now excludes exactly `/api/candidates/:id/resume`, which
  opts into same-origin framing (`X-Frame-Options: SAMEORIGIN` +
  `Content-Security-Policy: frame-ancestors 'self'`). Verified against a running
  server: the CV route returns a single SAMEORIGIN header while `/`,
  `/candidates`, `/api/interviews`, `/api/candidates/:id` and
  `/api/candidates/:id/resume/extra` all still return DENY. File: `next.config.mjs`.
- **Screening-question answers now show on the candidate profile's Forms panel.**
  Candidates' application answers were saved correctly (`applications.screening_answers`)
  but the Django candidate-detail serializer omitted the field, so the UI always
  said "No screening questions were answered." Django's `Application` model
  (`managed=False`) now declares `screening_answers` / `eeo_answers` /
  `knockout_failed`, and `serialize_application_detail` emits them.
  *(Django repo: `hiring/models.py`, `candidates/views.py`.)*
- **Unbooked interview invites no longer look like confirmed interviews.** When a
  sequence email carries the "book time with hiring manager" link, the system
  mints a placeholder interview whose date is a throwaway (send-time + 7 days).
  The Interviews tab was rendering that placeholder as a real SCHEDULED interview
  with a misleading date. It now shows "Awaiting candidate to pick a time" with an
  "Invite sent" badge and a "Copy booking link" action until the candidate books.
  File: `src/components/candidates/center/InterviewsTab.tsx`.

### Changed
- **Word (.docx) CVs now preview inline on the candidate profile.** The resume
  API converts `.docx` to styled HTML on the fly (via `mammoth`) when previewing,
  so the viewer renders the CV instead of showing the "can't be previewed —
  Download" card. PDFs/text preview as before; legacy `.doc`/`.rtf` still fall
  back to download (mammoth can't read them). `?download=1` still serves the
  original file untouched. Files: `src/app/api/candidates/[id]/resume/route.ts`,
  `src/components/candidates/center/SummaryTab.tsx`.

### Added
- **Two-way AI email conversations with candidates.** When a candidate replies
  to a sequence email, the reply is now captured into a proper conversation
  thread and an AI recruiting-coordinator **auto-sends** a reply on its own (no
  recruiter review) to keep the conversation moving. Threads surface in two
  places: a new **Inbox → Conversations** tab (list of active threads, unread
  badges, AI indicator) and a new **Inbox** tab on the candidate profile's right
  panel (full thread = automated sequence sends + candidate replies + AI/recruiter
  answers, with a reply composer, an AI "Suggest reply" button, and an
  auto-responder on/off toggle). Recruiters can also reply manually.
  - *Next.js:* facade `src/modules/crm/domain/email-inbox.ts` (thread is read by
    unioning `sequence_emails` + `email_messages`, so the send path is untouched),
    outbound sender `src/lib/email/send-reply.ts`, AI helper
    `src/lib/email/compose-reply.ts`, routes `/api/candidates/[id]/email`,
    `/api/email-conversations`, `/api/email-conversations/[id]`,
    `/api/email-conversations/[id]/draft`, component `EmailInboxTab.tsx`.
  - *Django:* unmanaged models `EmailConversation` + `EmailMessage`, auto-responder
    `sequences/auto_reply.py` (Gemini 2.5 Flash), and the SendGrid Inbound Parse
    webhook extended to record the reply + upsert the conversation + fire the
    auto-reply. Guardrails: per-thread on/off, a 6-turn cap (stops bot-vs-bot
    loops), opt-out/unsubscribe detection (closes the thread), automated-sender
    skip, and `Message-Id` idempotency so SendGrid retries don't double-send.

### Schema
- **096_email_conversations.sql** — new `email_conversations` (one thread per
  org+enrollment; tracks status, AI-responder state, unread, `agent_turns`) and
  `email_messages` (inbound/outbound with `provider_message_id` UNIQUE for
  idempotency) tables. RLS + service-role policies, mirroring the WhatsApp
  two-way design (061). **Run this migration on Supabase before the code ships.**

- **Extension icon + Chrome Web Store submission prep.** Added a brand icon
  (white person silhouette on emerald, generated by `extension/icons/generate-icon.mjs`,
  pure Node — 16/32/48/128) wired into the manifest. Added `extension/package.sh`
  (builds a store-ready zip, stripping the dev-only `localhost` host permission),
  plus `extension/STORE-LISTING.md` (ready-to-paste listing copy + permission
  justifications) and `extension/PUBLISH.md` (step-by-step publish guide, incl.
  the live-site login prerequisite). Build artifacts (`extension/build/`, zips)
  gitignored.

## 2026-07-16

### Added
- **LinkedIn "Add to Sequence" Chrome extension (Stage 2).** New `extension/`
  folder — a Manifest V3 extension (no build step, plain files) that injects an
  "Add to sequence" button on LinkedIn `/in/` profile pages. Captures the
  profile's name + URL, takes a typed email, lists the org's active sequences,
  and enrols in one click via the Stage 1 `/api/ext/*` endpoints. Auth is a
  per-org API key pasted into the extension's options; all API calls go through
  the background service worker (bypasses CORS). Includes options/popup pages
  and a README with load-unpacked + connect instructions. Self-contained; does
  not touch the Next.js app.

### Changed
- **Phone-screen picker now lets candidates add any exact time (Option A).** The
  fixed 30-minute time blocks were replaced with a day selector + a free time
  field: the candidate picks a day, types any time (a native time input, any hour
  of the day), and clicks "Add" to build a list of preferred call windows, each
  removable individually. Each picked time still becomes a 30-minute window on
  submit; past times on today are rejected on add
  (`src/app/phone-screen/[token]/page.tsx`).

## 2026-07-15

### Added
- **API keys for external tools (LinkedIn extension groundwork).** New
  Settings → API Keys page (`/settings/api-keys`) to generate/copy-once/revoke
  per-org bearer keys, gated by `settings:edit`. New key-authenticated endpoints
  `GET /api/ext/sequences` (active sequences for the dropdown) and
  `POST /api/ext/enroll` (create-or-find candidate + enrol in one call), reusing
  the existing `findOrCreateCandidateProfile` / `enrollCandidate` domain
  functions. Auth via `withApiKey` (`src/lib/api/api-keys.ts`); keys stored as
  SHA-256 hashes, rate-limited per key. `/api/ext` added to the Clerk-bypass
  list in `middleware.ts` (auth handled in-route, like `/api/sequences/process`).

### Schema
- **`094_api_keys.sql`** — new `api_keys` table (org-scoped, hashed key storage,
  soft-revoke via `revoked_at`).

## 2026-07-14

### Added
- **Slack event routing (hub Phase 1).** Admins can now decide, per lifecycle
  event, where each Slack notification goes: to the shared channel and/or as a
  DM to the recruiter and/or hiring manager. New Settings → Integrations card
  ("Slack Event Routing") with per-event toggles. A single routing gate
  (`src/lib/slack/dispatch.ts` + pure `src/lib/slack/routing.ts`) reads the
  org's config and fans out to channel + role DMs; `candidate_applied`,
  `stage_moved`, and `candidate_hired` now flow through it. Recruiter DMs are a
  new capability (resolved via `resolveApplicationRecruiterEmail`). Defaults
  reproduce the previous hard-coded behaviour, so orgs that never touch the
  screen see no change. Other statuses (e.g. rejected) keep their existing
  channel + hiring-manager DM behaviour.
- **Candidate application answers are now visible to recruiters.** Screening
  answers were captured at apply time but never shown. The candidate profile's
  "Forms" tab now lists each application's screening questions and the candidate's
  answers (with a knockout-question warning badge), so recruiters can assess
  applications without leaving the profile (`FormsTab.tsx`).
- **Submitted phone-screen times now appear on the candidate profile.** Previously
  the windows a candidate picked were only visible inside the phone-call pop-up.
  A "Preferred Call Times" section now renders per application in the Forms tab
  (`PhoneScreenAvailability.tsx`, embedded in `FormsTab.tsx`).

### Schema
- **`095_slack_routing.sql`** — new `org_settings.slack_routing` JSONB column
  (per-event `{ channel, dm_roles }` map; default reproduces prior behaviour).
  Needs to be applied to Supabase.

### Changed
- **Phone-screen scheduling link is now a proper calendar.** The candidate picker
  previously offered fixed 9am–6pm, weekday-only, next-day-onward windows. It now
  shows a day selector starting **today** (14 days ahead, weekends included) and
  30-minute time slots spanning early morning to late evening, with past times on
  today hidden (`src/app/phone-screen/[token]/page.tsx`).

### Fixed
- **Hiring-manager Slack DMs now fire for canonical jobs.** Stage- and status-change
  Slack DMs read the hiring manager's email only from the legacy `hiring_requests`
  table, so canonical jobs (no such row) never notified their hiring manager. The
  route now falls back to `resolveApplicationHiringManager` (job / linked
  requisition) (`src/app/api/applications/[id]/route.ts`).
- **`{{company_name}}` no longer degrades to "our company" for canonical jobs.**
  The canonical branch of `getApplicationJobTokens` hard-coded the company field
  to `null` (only legacy `hiring_requests` carried a company name), so the token
  always fell back. It now resolves the org's onboarding-captured
  `org_settings.company_name` via a new `resolveOrgCompanyName` helper, falling
  back to "our company" only when the org has no company name set
  (`src/modules/ats/domain/job-pipelines.ts`).
- **Phone-screen scheduling link no longer 404s ("Invalid or expired").** The
  `/api/phone-screen/[token]` reader embedded `candidate:candidates(name)`, but
  there is no DB foreign key between `phone_screen_requests` and `candidates`, so
  PostgREST errored and the route returned 404 for every *valid* link. It now
  loads the request row on its own and resolves the candidate name in a separate,
  non-fatal lookup (`src/app/api/phone-screen/[token]/route.ts`).
- **`{{recruiter_name}}` no longer degrades to "the hiring team" for jobs without
  a hiring team.** Recruiter resolution only read the job's hiring-team recruiter;
  a job created straight from a requisition has no hiring team, so the token fell
  back. It now falls back to the recruiter named on the linked requisition
  (`openings.recruiter_id`), matching the recruiter-approver fallback
  (`getApplicationJobTokens` / `resolveOpeningRecruiterName` in
  `src/modules/ats/domain/job-pipelines.ts`).
- **CV preview no longer force-downloads Word documents on every page load/refresh.**
  The candidate resume viewer pointed an `<iframe>` at every CV regardless of type;
  browsers can't preview `.doc/.docx` inline, so they downloaded the file each time.
  Non-PDF CVs now show a "Download CV" card instead of an auto-downloading iframe;
  PDFs still preview inline (`src/components/candidates/center/SummaryTab.tsx`).

### Changed
- **Sequence Enrollments rows show the latest email activity inline.** The per-email
  send/open/click timeline already existed but was hidden behind each row's expand
  chevron; the collapsed row now shows the most recent activity (e.g. "Opened 14
  Jul, 2:07 PM · 1 email") so a timestamp is visible at a glance
  (`src/app/(dashboard)/sequences/[id]/page.tsx`).
- **Sequence Enrollments tab lists the sequence's auto-enroll rules when no one is
  enrolled yet.** Previously a rules-only sequence showed a blank "No candidates
  enrolled yet" card until an event fired, giving no sign of what the sequence was
  set to run on. The empty state now shows each rule in plain language (e.g. "When
  a candidate is tagged 'passive-lead'"), with a filtered/On-Off badge, and each
  row opens the Rules editor. Once real candidates enroll, the normal enrolled
  list is shown unchanged (`src/app/(dashboard)/sequences/[id]/page.tsx`,
  `describeSequenceRule` in `src/lib/sequences/format.ts`).

### Fixed
- **`{{hiring_manager_calendar}}` scheduling link now resolves for jobs created
  via the "Send to HM" intake flow.** The link reader only looked at the job's
  top-level `custom_fields.hiring_manager_email`, but the intake flow writes the
  HM contact one level down under `custom_fields.intake` — so the token silently
  fell back to plain text ("the hiring team will reach out…") instead of a
  clickable link. `resolveApplicationHiringManager` now reads both spots and, as a
  last resort, the linked approved requisition (`openings`)
  (`src/modules/ats/domain/job-pipelines.ts`, regression test in
  `src/modules/ats/domain/__tests__/resolve-application-hiring-manager.test.ts`).

### Added
- **Live character counter on justification / approval-comment fields.** A new
  reusable `CharCounter` shows characters remaining, turns amber below the minimum
  and red over the maximum, so writers can see at a glance when they've met the
  length rule. Wired into the opening-request justification (new + edit) and the
  approval decision comment (`src/components/ui/char-counter.tsx`,
  `NewOpeningForm.tsx`, `OpeningDetail.tsx`, `approvals/DecisionModal.tsx`).
- **Sequence Enrollments now show per-email SendGrid activity.** Each enrolled
  candidate row expands to a timeline of its messages with sent / opened /
  clicked / replied / bounced timestamps, sourced from `sequence_emails`
  (`src/modules/crm/domain/sequences.ts`,
  `src/app/(dashboard)/sequences/[id]/page.tsx`).

### Changed
- **`{{recruiter_name}}` in sequence emails resolves from the job's recruiter.**
  Canonical jobs never populated the recruiter name, so the token always fell back
  to "the hiring team"; it's now resolved live from the job's hiring team
  (`src/modules/ats/domain/job-pipelines.ts`).

### Fixed
- **Merge tokens survive as link URLs in the email editor.** Tiptap's URL
  sanitiser was stripping a `{{token}}` used as a hyperlink target (e.g.
  `{{phone_screen_scheduler}}`), leaving a dead/blank link; the editor now treats
  merge tokens as valid link targets so they're rewritten to a real URL at
  send-time (`src/components/RichTextEditor.tsx`).
- **Slack approval DMs that can't resolve a recipient now log a warning** instead
  of failing silently, making it clear when a hiring manager's email isn't a member
  of the connected Slack workspace (`src/lib/notifications.ts`,
  `src/lib/approvals/notifications.ts`).
- **Candidate CV preview no longer auto-downloads on every render.** The Summary
  tab embedded the CV in an `<iframe>` pointing at `/api/candidates/[id]/resume`,
  which 302-redirected to a Supabase signed URL served as an attachment — so the
  browser force-downloaded the file each time the panel rendered, piling up
  duplicate copies. The route now streams the file back with an explicit
  `Content-Disposition: inline` (and correct MIME type), so it renders in place;
  the explicit Download button uses `?download=1` for a real save
  (`src/app/api/candidates/[id]/resume/route.ts`, `src/lib/storage/resume.ts`,
  `src/components/candidates/center/SummaryTab.tsx`).
- **Candidate names are normalised to title case on creation.** CVs and
  application forms often arrive shouting ("SAGAR") or all-lowercase; the new
  `normalizePersonName` helper fixes those at the single person-creation choke
  point while leaving intentional mixed case (e.g. "McDonald") untouched
  (`src/modules/core/domain/people.ts`, test in
  `src/modules/core/domain/__tests__/normalize-person-name.test.ts`). A one-time
  backfill tidied existing rows — 3 all-caps names fixed
  (`scripts/backfill-person-name-casing.mjs`, dry run by default, `--apply` to
  write; the migration-062 people→candidates trigger syncs the denormalized copy).

## 2026-07-13

### Fixed
- **Stage-based enrollment rules now fire for new applicants, not just manual
  stage moves.** A brand-new application is recorded as an `applied` event (entry
  into the first stage), but the auto-enrollment scanner only matched `stage_moved`
  rules against `stage_moved` events — so a rule like "when moved to Applied" never
  fired for people who actually applied. The stage-entry scan now reads `applied`
  events too (`STAGE_ENTRY_EVENT_TYPES` in `src/modules/crm/domain/automations.ts`),
  so those rules behave as expected. Later stage moves were already handled.
- **Rich-text paragraph breaks now render identically on candidate-facing pages.**
  A line break at the end of a paragraph (which the editor shows as a blank line)
  was being collapsed by the browser on the apply/careers/detail views, gluing
  paragraphs together. `RichText` now preserves those trailing breaks with a
  zero-width space so the read-only view matches the editor exactly
  (`src/components/RichText.tsx`, test in `src/components/__tests__/RichText.test.tsx`).
- **"Hiring team member → recruiter" approval steps no longer resolve to zero
  approvers before a job exists.** When a requisition has no linked job yet, that
  approver type now falls back to the requisition's own `recruiter_id`, mirroring
  the existing `hiring_manager` fallback to `openings.hiring_manager_id`
  (`src/lib/approvals/approver-resolver.ts`). Previously such a step activated
  empty and the approval stalled.

### Added
- **Offers can now go through the approval engine.** New `POST /api/offers/[id]/submit`
  moves a draft offer to `pending_approval` against the org's "Offer" approval chain
  (configurable in Settings → Approval chains, which already listed Offer as a target).
  Approvers decide from the inbox or an email link; the engine keeps the offer's status
  in sync (approved on sign-off, back to draft on reject/cancel). Offers were previously
  never connected to the engine.
- **Per-pane Filter button on the Requisitions, Jobs, and Candidates lists.** Each
  Active/Past pane now has a funnel button (next to Search/Time/Download) that opens
  a popover of "field is value" conditions covering every column — shown or not.
  Conditions on the same field are OR'd, across fields AND'd. New shared pieces in
  `src/components/panes/pane-controls.tsx`: `PaneFilterControl`, `rowMatchesFilters`,
  `FilterFieldDef`, `FilterCondition`.
- **Invite-on-assignment for hiring managers.** Naming a hiring manager by email on a
  new requisition now provisions a free hiring-manager seat on the spot (reusing an
  existing member/user if there is one) and fires a best-effort Clerk invite, so the
  picked approver has a real account by the time the requisition goes for approval.
  When they later sign in, their pending record is claimed in place
  (`syncUserFromClerk`) rather than duplicated, so their approval history stays intact.

### Changed
- **Hiring managers are scoped to their own requisitions and approvals.** A hiring
  manager now sees only requisitions they own (hiring manager or recruiter on) in the
  `/openings` list and detail; opening someone else's returns 404. The approvals inbox,
  history, and detail already filter to their own approvals. They're blocked from the
  org-wide dashboard, candidate/job lists, settings, and analytics by capability. Nav:
  Requisitions is reachable via `openings:view`; Dashboard is hidden from them.
- **Filtering consolidated into the per-pane Filter button.** Requisitions' page-level
  Department/Location dropdowns and Candidates' page-level Status dropdown were folded
  into their panes' Filter popover (Requisitions filters on Title/Status/Department/
  Location; Candidates on Name/Title/Status/Location/Email). Jobs' click-the-column-
  header filters and filter-chip bar were replaced by the same Filter button on each
  pane, reusing the existing filtering engine under the hood; the column customiser
  and drag-to-reorder are unchanged.

### Schema
- **`offers.approval_id` (migration `093`).** Nullable FK to `approvals`, letting a
  submitted offer link to its in-flight approval (mirrors `openings`/`jobs`). Cleared
  back to NULL when the offer is rejected, cancelled, or still a draft.
- **"Hiring Manager" system role (migration `092`).** Seeds a minimal, approve-focused
  RBAC role per org (view + approve their own requisitions/jobs/offers; no settings,
  analytics, or edit). Provisioned hiring-manager seats are assigned it automatically
  (`ensureDefaultMemberRole`: admin→Owner, hiring_manager→Hiring Manager, else Recruiter).
- **Approval email-link access tokens (migration `091`).** New
  `approval_step_access_tokens` table — a 256-bit random secret bound to one
  (approval, step, approver) triple, with a 7-day expiry and one-time-use stamp.
  Backs no-login Approve/Reject from an email button.
- **Hiring-manager free seats + pending users (migration `090`).** Groundwork for
  making hiring managers first-class approvers. `users.clerk_user_id` is now
  nullable — a row with it NULL is a "pending" user we provision the moment a
  hiring manager is named as an approver (before they have a login). Adds
  `users.provisioned_via` (`'approver_invite'`) and `org_members.is_free_seat`
  (billing carve-out — HM seats never count against paid recruiter seats), plus a
  partial index for fast pending-user lookup by email.

### Added
- **Approve/Reject an approval straight from the email — no login.** Approval
  request emails now carry **Approve** and **Reject** buttons. Each button opens
  a confirm page (Reject asks for a ≥20-char reason) that records the decision as
  the approver, via a one-time tokenized link (`/api/approvals/act/[token]`).
  Links are single-use, expire after 7 days, and are rate-limited; the login-gated
  approvals inbox still works as before. Groundwork for letting hiring managers
  act on requisitions without a platform seat.
- **`provisionHiringManagerSeat` team facade (`src/modules/core/domain/team.ts`).**
  Idempotently mints a real `users` + free `org_members` seat (role
  `hiring_manager`) for an emailed hiring manager, so the approval engine always
  has a concrete `user_id` to target, and fires a best-effort Clerk invitation so
  they can claim a login later. Reuses an existing member/user when present.
- **Candidate phone-screen self-scheduling (`{{phone_screen_scheduler}}` token).**
  A new sequence-email merge token — insert "Phone Screen Slots" from the stage
  editor — renders a per-candidate link. The candidate opens a public page
  (`/phone-screen/[token]`, no login) and ticks whichever upcoming business-hours
  windows they're comfortable being called in. Unlike the HM calendar link there's
  **no calendar/free-busy check** — an AI places the call, so they just tell us
  when they're free. Their picks are stored against the application, and surface
  inside the existing "AI Phone Screen" modal so the recruiter sees the preferred
  windows (in the candidate's timezone) right where they launch the call.
  Recruiter-triggered for now: seeing the windows, the recruiter clicks to start
  the call. The link is idempotent (re-sends reuse the same request) and expires
  after 30 days.
- **Hiring manager now flows from requisition → job.** A requisition (opening)
  gains a free-typed hiring-manager **name** and **email** (email is mandatory
  before the requisition can be submitted for approval). When a job is created
  from an approved requisition, those values flow down onto the job's
  `custom_fields.hiring_manager_name/email` as the default — pre-filled and
  editable in the New Job drawer, so it's "same HM by default, change if you
  want." The existing hiring-manager *dropdown* is unchanged and still drives
  approval routing; it's now labelled "Hiring manager (approver)" to distinguish
  it from the contact fields. Copilot-created requisitions can set the same two
  fields.
- **"AI usage & cost" admin page** (`/admin/ai-usage`, in the Admin nav section,
  gated by `settings:edit`). Reads the `ai_usage` ledger for the current org and
  shows: KPI tiles (estimated cost, calls, input/output tokens), a daily-cost
  trend chart (Recharts), and cost-by-feature / cost-by-employee / cost-by-model
  breakdowns, with a 7/30/90-day range switch. Strictly org-scoped — admins only
  ever see their own workspace. Backed by `GET /api/ai-usage?days=`, which
  aggregates in JS (paginated, capped) and resolves employee names from `users`.
- **Per-call AI cost logging (`ai_usage`).** Every Gemini call now writes one row
  recording tokens in/out, estimated USD cost, which feature made the call, and
  *who* triggered it (org = client, user = employee, both nullable for public
  token flows and background jobs). Written best-effort and fire-and-forget from
  the central `trackUsage()` funnel, so a logging failure never blocks or breaks a
  user request. Every AI call site now reports usage — previously ~11 of them
  discarded it, and the sub-agent tool loop was untracked entirely. This lets us
  answer "cost per client" and "cost per employee" from real data; a reporting
  view can be built on top later. (Note: production AI traffic is proxied to the
  Django backend, which needs the same change to capture prod usage end-to-end.)

### Schema
- **`086_ai_usage.sql`** — new `ai_usage` ledger table (org_id, user_id, module,
  model, input/output tokens, estimated_cost_usd, created_at) with per-org and
  per-user time indexes. Additive and reversible. **Must be applied to Supabase**
  before rows will persist; until then `trackUsage` logs a warning and continues.

### Changed
- **`{{hiring_manager_calendar}}` now resolves the HM from the job only.** The
  sequence booking-link token used to fall back through three sources (the job's
  `custom_fields`, then the job's hiring team, then the linked requisition's
  approver). Now that the HM flows onto the job at creation time, the resolver
  reads *only* `jobs.custom_fields.hiring_manager_email/name` — a single, editable
  source of truth that matches the Django production sender. No job HM set → the
  token uses its natural-language fallback as before.

### Schema
- **`088_opening_hiring_manager_contact.sql`** — adds `hiring_manager_name` and
  `hiring_manager_email` (both nullable) to `openings`. Additive and reversible;
  the mandatory-email rule is enforced at the UI and the submit gate, not in the
  DB, so existing drafts stay valid. **Must be applied to Supabase.**

### Changed
- **Retired the Claude naming now that the app runs entirely on Gemini.** Call
  sites passed legacy Claude tier names (`claude-sonnet-4-6` etc.) that a wrapper
  translated to Gemini; those are now replaced with the Gemini model ids directly
  (`gemini-2.5-pro` / `gemini-2.5-flash`). Removed the translation map and legacy
  Claude price rows, renamed the `ClaudeTool` type → `ToolSchema` (and
  `claudeToolsToGemini` → `toolsToGemini`), and reworded all Claude comments and
  user-facing error strings to Gemini. Provider still lives behind the one wrapper
  (`src/lib/ai/llm.ts`); an unrecognised model id now falls back to the flash tier.

### Added
- **Name search on the Sequences page.** Each pane (Active and Archived) now has
  its own "Search by name…" box in the header that narrows that pane's list as you
  type. It works alongside the existing metric filter and time window, and
  auto-opens a collapsed pane when you start typing.
- **Eligibility filters on auto-enrollment rules.** A sequence's auto-enroll rules
  (e.g. "when someone applies") used to enroll *everyone* whose event matched. Each
  rule now has an optional "Only enroll candidates matching…" filter — Department,
  Job, Stage, Tag, Application status, plus a skip-do-not-contact toggle — reusing
  the same multi-select builder as Bulk enroll. When left blank, behaviour is
  unchanged (enroll everyone). The scan engine checks each candidate against the
  rule's filter before enrolling, reusing the existing `candidate-filter` resolver.
- **Hiring-manager calendar link in sequence emails (`{{hiring_manager_calendar}}`).**
  A new merge token that resolves, per candidate, to a personal booking link for
  *their* hiring manager. At send-time we look up the HM for the candidate's job
  (job's hiring team → hiring manager, else the linked opening's hiring manager),
  mint a self-schedule link, and drop it into the email. The candidate picks a
  slot on the existing `/schedule/[token]` page, which creates the real interview
  and calendar invite (Google Meet / Teams / Zoom) — no separate booking flow. The
  token only does work when a stage actually uses it, and re-sends reuse the same
  unbooked link rather than piling up interview rows. When the HM (or their
  availability) can't be resolved, the token falls back to a natural sentence
  ("the hiring team will reach out to schedule a time") instead of a dead link.
  The live production sender is the Next.js `job_queue` path (enrollment enqueues
  a `sequence_email` job that the prod pinger drains via `/api/queue/process`),
  so this Next.js code is what mints the links in prod. The Django sender
  (`sequences/tasks.py`) carries a mirrored implementation for parity, but it is
  currently dormant — it only runs if Django is made the active sender (a Celery
  beat + worker with `REDIS_URL`), which prod does not launch today.

### Schema
- **`087_enrollment_rule_filters.sql`** — adds a `filters` JSONB column to
  `sequence_enrollment_rules` (defaults to `{}` = no filter). Additive and
  reversible. **Must be applied to Supabase** for rule filters to persist.

### Changed
- **Sequences now have a type — Drip campaign vs Event notification — chosen at
  creation.** This replaces the per-sequence "send first email immediately"
  toggle, which only ever affected the first email. A **Drip campaign** respects
  the business-hours send window (Mon–Fri, 8am–8pm IST) on *every* stage, for
  outreach and nurture. An **Event notification** bypasses the window on *every*
  stage, so each email fires the moment it's due — off-hours included — built for
  stage-move alerts and confirmations (e.g. application → interview → hired).
  Clicking **New Sequence** now opens a two-card chooser; the type is fixed once
  set. The scheduling engine keys off the type in both places it schedules stages
  (`enroll.ts` for the first stage, `job-handlers.ts` for follow-ups). Detail and
  list pages show an **Event** badge and a read-only explainer instead of the old
  toggle.

### Removed
- **First-email "send instantly" toggle.** Superseded by the sequence type above.
  Behaviour is now driven entirely by whether a sequence is a Drip campaign or an
  Event notification. (The `send_first_immediately` DB column is retained for
  deploy safety but is no longer read; existing sequences that had it on were
  migrated to `kind = 'event'`.)

### Schema
- `085_sequence_kind.sql` — adds `sequences.kind` (`'drip'` default | `'event'`,
  CHECK-constrained). Backfills `kind = 'event'` for any sequence that had
  `send_first_immediately = true`. Additive and reversible; the old column is left
  in place.

### Fixed
- **Intake Slack alert now respects the per-org channel.** The "intake submitted /
  JD ready" alert was the only channel notification still posting to the global
  `SLACK_WEBHOOK_URL` env var instead of the org's configured webhook, so it
  ignored the channel set in Settings. It now routes through `notifySlack(org, …)`
  like every other alert (apply, stage change, hire/reject, interviews).

### Added
- **Per-pane Search + Time + Download toolbars on the Requisitions, Jobs, and
  Candidates lists** — matching the Sequences page. Each Active/Past pane now owns
  its own name search, time-window picker (Last 7/30/90 days · All · custom range,
  on `created_at`), and one-click CSV download of exactly the rows it's showing.
  New shared component `src/components/panes/pane-controls.tsx` (`PaneSearchInput`,
  `TimeRangeControl`, `PaneDownloadButton`, `withinRange`) built from the Sequences
  inline controls, reusing `lib/sequences/range.ts` presets and `lib/api/csv-export`.

### Changed
- **Requisitions / Jobs / Candidates search + time filter moved from the page
  header into each pane.** Previously one page-level toolbar filtered both panes
  together; now the Active and Past panes filter independently (both default to
  All-time, so nothing is hidden by default). Requisitions keeps its department/
  location dropdowns and Jobs keeps its column customiser + column filters at the
  page level; Candidates' Hiring Funnel is now an all-pool overview rather than
  time-scoped. Jobs and Requisitions gained CSV export for the first time;
  Candidates' page-level server-side Export CSV button was replaced by the per-pane
  client-side download (the `/api/export/candidates` route is left in place, now
  unused by the UI).

## 2026-07-12

### Fixed
- **Cancelled interviews no longer linger on the interviewer's calendar.** The
  real Google/Teams/Zoom event is created on one host's calendar, but which host
  wasn't recorded and the resolver's pick can drift over time (e.g. a panelist
  connects their own Google after the org account created the event), so
  cancellation was deleting from the wrong calendar, getting a harmless 404, and
  treating it as success while the event survived. Cancellation now deletes the
  event from *every* calendar we can authenticate as (`resolveAllHosts` +
  shotgun delete in `lib/integrations/cancel-event.ts`), so the calendar that
  actually holds it is always hit. Attendees get the native "meeting cancelled"
  notice and the event is removed from both the interviewer's and candidate's
  calendars — Google via `sendUpdates=all`, Outlook/Teams via the Graph `cancel`
  action (a plain delete could drop the event without notifying). Also wired the
  copilot "mark interview
  cancelled" path (`update_interview_status`) to run the same calendar cleanup +
  notifications — previously it only changed the status. Shared logic extracted
  to `lib/interviews/cancel.ts`.
- **Candidate page no longer shows "Unknown Role" for canonical jobs.** The
  applications query on `/api/candidates/[id]` only joined the legacy
  `hiring_requests` table, so applications created against a canonical `jobs`
  pipeline (`hiring_request_id` null) had no title. It now also embeds `jobs`
  and folds the canonical title/department onto each application; the "View →"
  link falls back to `job_id`.

### Added
- **Per-interviewer daily interview load (min/max per day).** Interviewers set a
  minimum and maximum interviews-per-day on their own no-login availability page
  (`/interviewer/[token]`). The **maximum is enforced**: the self-schedule
  availability engine hides *all* slots on a day once the interviewer already has
  that many scheduled interviews (for a panel, one maxed-out member blocks the
  day). The **minimum is a display-only target** shared with the recruiter —
  hiding slots can't force interviews to exist.

### Schema
- **`084_interviewer_load_limits`** — adds nullable `min_per_day` /
  `max_per_day INTEGER` to `interviewer_preferences`. Additive and reversible;
  NULL means "no limit / not set". **Needs to be applied to the database.**

## 2026-07-10

### Added
- **Sequences: send the first email instantly (bypass send hours).** A new
  per-sequence toggle — "First email sends: Immediately / Within send hours" —
  lets a sequence's *first* email fire the moment a candidate is enrolled, even
  at 3am on a weekend, so time-sensitive messages (e.g. an application
  confirmation) arrive right away. Follow-up emails still respect the business-
  hours window (Mon–Fri, 8am–8pm IST). A "Sends instantly" badge marks flagged
  sequences on both the list and the detail page; the stage editor's schedule
  preview and the auto-enroll ("When someone applies") hint reflect the instant
  first send. Engine change is caller-only: `enroll.ts` passes no send-window for
  the first stage of a flagged sequence (`modules/crm/domain/enroll.ts`,
  `api/sequences/[id]`, `SequenceStageEditor`, `SequenceAutomations`).

### Schema
- **`083_sequence_send_first_immediately`** — adds
  `sequences.send_first_immediately boolean NOT NULL DEFAULT false`. Additive and
  reversible; default false preserves today's always-windowed behaviour.

### Fixed
- **Apply-page resume autofill: recover email/phone the PDF text extractor
  can't see.** Some CVs render the contact header as an image or an undecodable
  font, so `unpdf` extracts the body but no email/phone at all — while the
  Gemini vision model reads them correctly. Grounding the AI's correct values
  against that incomplete text wrongly dropped both, leaving the fields blank
  (and, before that, a stray education line like `8.96 (2014-2018)` slipped
  through as the phone). On the PDF path (where the model reads the file
  directly) a format-valid email/phone is now trusted even when the extracted
  text lacks it; the phone matcher also rejects year ranges and prefers
  `+`-prefixed numbers (`lib/apply/resume-autofill.ts`,
  `app/api/apply/parse-cv/route.ts`). Word-doc grounding (text-only input) is
  unchanged, so hallucination protection is preserved. Verified end-to-end on
  the real failing CV.

### Added
- **Sequences: time filter + separate Download on the list and Analytics.** The
  Sequences list and each sequence's Analytics tab now have a dedicated "Show
  activity in" time filter (Last 7/30/90 days · All time), split out from the
  Download control. The on-screen funnel numbers, the analytics figures, and the
  CSV export all rescope to the chosen window using one shared helper
  (`lib/sequences/range.ts`), so the three always agree.
- **Sequences: real "Paused" status.** Pausing a sequence now sets a genuine
  `paused` status (was silently reusing `draft`) with its own amber badge, so a
  paused-then-resumable sequence reads differently from a never-launched draft.
  Safe with the sender: the send path gates on the enrollment's status, not the
  parent sequence, so `paused` behaves like `draft` for new sends.
- **Sequences: Clone button on the sequence page.** A small clone icon sits next
  to the edit pencil to duplicate a sequence and its stages.
- **Sequences: filter Active/Archived panes.** Each pane has a filter for state
  (active/draft/paused) and for performance (e.g. reply rate ≥ X%, opened ≥ N).
- **Sequences: save & reuse email templates in the stage editor.** "Save" stores
  the current subject/body as a named template; "Templates" loads any saved one.
  Wired to the existing `/api/email-templates` CRUD.
- **Sequences: AI Draft now uses real Gemini.** The five AI Draft styles call a
  new `/api/sequences/ai-draft` endpoint that generates a personalized template
  (with merge tokens left in place) instead of returning hardcoded copy.
- **Sequences: honest "expected landing" preview for every timing config.** The
  stage editor shows the real scheduled send time for minute/hour/day/business-day
  delays (was day-only), computed with the same function the sender uses, and
  warns when the business-hours guardrail (Mon–Fri 8am–8pm IST) pushes a send to
  the next open window.
- **Sequences: clearer Send Preview result + placeholder fallbacks.** Send
  Preview now shows an explicit success or error banner (and calls out a missing
  SendGrid setup by name). Blank merge fields now fall back to natural defaults
  (e.g. "your company") via a shared `lib/sequences/tokens.ts` used on the send
  path, and the editor lists which fallbacks apply to the current draft.
- **Sequences: custom date range in every time filter.** The list panes and each
  sequence's Analytics tab now offer "Custom range…" with two date pickers (From/To),
  alongside the 7/30/90-day and All-time presets. Backed by `resolveWindow`/`inWindow`
  in `lib/sequences/range.ts` and threaded through the sequences/export/analytics APIs.
- **Sequences: per-pane time window + Download, as header icons.** The Time and
  Download controls moved out of the page header and into each pane's header (Active
  and Archived) as compact icon buttons with hover tooltips, right before Filter. Each
  pane now keeps its own window, so you can view Active over the last 30 days while
  browsing Archived all-time. Download exports exactly that pane's rows, already scoped.

### Changed
- **Sequences: stage timing label reflects sub-day delays.** A 2-minute step now
  reads "+2 min" instead of "Immediate" (via `lib/sequences/format.ts`).
- **Sequences: unsubscribe is a soft block.** The suppression tag was renamed to
  `candidate-unsubscribe` and now blocks only cold sequence outreach (inbound 1:1
  replies still allowed); unsubscribed enrollments get their own badge.

### Fixed
- **Sequences: pane filter dropdowns no longer clipped/hidden.** The pane container
  dropped its `overflow-hidden`, so the Time/Download/Filter popovers open fully
  instead of being cut off — and a raised z-index keeps an open popover above the
  Archived pane below it (previously it could be blocked when both panes were folded).
- **Sequences: AI Draft failures are now visible.** A failed or empty AI Draft shows
  an inline red notice right under the AI Draft button (and a green confirmation on
  success), instead of a silent "buffered but nothing rendered" — the old error
  surfaced far down the panel and was easy to miss.

## 2026-07-09

### Added
- **Configurable interview reminder intervals (migration 082).** Recruiters can
  now set which reminders go out (e.g. 1 week / 24h / 4h / 1h / 30 min before)
  in Settings → General → "Interview reminders"; empty = off. Default stays
  24h + 1h. Stored on `org_settings.reminder_lead_minutes`, read by the reminder
  scheduler (`lib/interviews/reminders.ts`), saved via a new `/api/scheduling-settings`
  endpoint (kept out of the Django-proxied org-settings). The Schedule Interview
  modal now shows a "reminders are sent automatically — configure intervals"
  note linking to that setting. Reminder emails/Slack phrase the lead time from
  the interval (e.g. "in about 4 hours"). Back-compat: older queued reminder
  jobs (24h/1h `kind`) still fire.

### Changed
- **Sequences list: row actions always visible + full funnel per row.** The
  Clone / Pause / Archive icons no longer hide until hover — they're always shown
  (their text tooltips still appear only on hover). Each row now shows the full
  funnel Stages → Enrolled → Sent → Opened → Clicked → Replied (was only Stages /
  Enrolled / Replied); `listSequences` rolls the email funnel up per sequence via
  the enrollment→email link, using the same status definitions as the Analytics
  tab so the numbers agree. The strip is hidden on very small screens to avoid
  cramping.
- **Sequences list: bulk select + bulk actions.** Every row now has a checkbox,
  and each pane header has a select-all checkbox (with an indeterminate state for
  partial selections). Once anything is selected, a bulk action bar appears with
  Clone, Activate, Pause and Archive — applied to all selected sequences in
  parallel, then the list refreshes and the selection clears. (Activate/Pause are
  two separate buttons rather than one toggle, since a single toggle is ambiguous
  when the selection mixes active and paused sequences.)
- **Sequences list: CSV download with time window.** A new "Download" menu in the
  header exports one row per sequence (Name, Status, Stages, Enrolled, Sent,
  Opened, Clicked, Replied, Reply rate, Created) as a CSV. The funnel counts are
  scoped to *activity within the chosen window* — Last 7 / 30 / 90 days or All
  time — where a candidate counts if enrolled in the window and an email counts
  if sent in the window (`listSequencesForExport` in the CRM domain, served by
  `/api/sequences/export?range=`). CSV only for now; PDF may follow.

### Fixed
- **Self-schedule availability was serving stale interviewer hours.** The
  candidate self-schedule page read interviewer preferred-hours through Next.js's
  cached data layer, so after a hiring manager changed their hours (e.g. extended
  Thursday from 6 PM to 11 PM) the engine kept using the old window and hid the
  new evening slots. The `/api/schedule/[token]` route is now `force-dynamic` /
  `force-no-store`, so availability always reflects live preferences + calendars.
- **Lowered the self-schedule minimum-notice buffer from 2 hours to 30 minutes**
  so candidates can grab same-day/near-term slots (`minLeadMinutes` default in
  `lib/interviews/availability.ts`).

### Schema
- **`candidates.current_company` added (migration 081).** Nullable text column so
  a candidate's current employer can be used as the `{{candidate_company}}` merge
  field in sequence emails. Additive — existing rows stay NULL and render blank.
  Populated going forward by CSV import, CV parsing, and profile parsing.

### Added
- **Sequence unsubscribe / compliance handling.** Every outbound sequence email
  now carries a one-click unsubscribe footer whose link encodes an encrypted
  `{org, candidate}` token (AES-256-GCM, so it can't be forged). The public
  `/unsubscribe/[token]` page stamps the candidate `do-not-contact` and stops all
  their active enrollments — which the bulk-enrollment filter already excludes, so
  the suppression sticks. A send-time guard also drops any candidate who became
  do-not-contact after enrolling, and SendGrid `unsubscribe`/`spamreport` events
  now suppress the candidate too (previously ignored). New helper
  `src/modules/crm/domain/unsubscribe.ts`.
- **Business-hours send window (guardrail against 3am / weekend sends).** Relative
  sequence steps — including "send immediately" — are now clamped to weekdays
  08:00–20:00 IST; a step that would land outside the window is pushed to the next
  window open. Steps with an explicit clock time (`send_at` / `send_at_time`) are
  left alone. Applied consistently at enroll, at each chained send, and in the
  step-editor preview. `clampToSendWindow` + `DEFAULT_SEND_WINDOW` in
  `lib/sequences/schedule.ts`, covered by unit tests.
- **Sequence analytics CSV export.** The Analytics tab has a "Download CSV" button
  that builds a per-stage + totals spreadsheet client-side from the loaded data.
- **Sequence merge fields wired end-to-end.** The sender
  (`lib/api/job-handlers.ts`) now fills `{{candidate_company}}` from the new
  column, and a safety net blanks any unfilled/unknown `{{placeholder}}` so
  recipients never see raw tokens. Sourcing parsers (CV/profile/CSV) now extract
  the candidate's current company.

### Changed
- **Sequence step editor: clearer channel + token labels.** WhatsApp/SMS/LinkedIn
  channel options now show a "Soon" badge and are disabled (email is the only
  live channel), so no one configures a channel that silently sends email.
  Renamed merge-field chips for clarity: "Current Title", "Current Company"
  (candidate) vs "Hiring Company" (the role's company). Removed the stray
  `{{recruiter_title}}` token from the built-in template (no data source in the
  sequence context).

### Fixed
- **Intake status page progress card now advances.** The hiring-manager status
  page (`/intake/[token]/status`) still keyed its four steps to retired legacy
  `hiring_requests` statuses (`intake_pending`, `jd_generated`, `posted`, …),
  which a canonical intake job never has — so no step ever lit up. Re-keyed the
  steps and the message banners to the canonical job lifecycle
  (`draft` → `approved` → `open`), so the card correctly shows created →
  submitted → with-recruiter → posted.
- **Stale "Claude" labels in the UI now say Gemini.** The JD-generation loader
  ("… is writing the JD…") on both the intake page and the recruiter Jobs page,
  and the "AI Model" card in Settings ("Claude Sonnet 4.6" → "Google Gemini 2.5
  Pro"), were leftover labels — generation already runs on Gemini via the
  central `lib/ai/llm.ts` wrapper. Copy only; no behaviour change.

### Changed
- **Sidebar widened and nav labels enlarged.** The desktop rail was a fixed
  166px, which truncated the "RecruiterStack" wordmark once the bell moved into
  the header. Widened it to 240px so the full logo + bell fit comfortably, and
  bumped the nav items (Dashboard, Requisitions, …) from 14px medium to 16px
  semibold with 20px icons for stronger primary navigation. Also enlarged the
  logo — cream tile 28→34px and wordmark 13→16px — to match the bigger nav; the
  240px width was measured against the actual Plus Jakarta Sans wordmark so the
  enlarged logo can't clip. Applied to both the desktop rail and the mobile
  drawer.
- **Notifications bell moved from the sidebar footer to the top header.** The
  bell (with its unread badge) now sits at the top of the left rail, to the
  right of the RecruiterStack logo, instead of at the bottom next to the org
  name. Its dropdown opens downward via a new `align="top"` prop on
  `NotificationBell`; header spacing tightened so the logo + bell fit the narrow
  rail. Applied to both the desktop rail and the mobile drawer.
- **Intake form text boxes are now the same rich-text editor used elsewhere in
  the app.** The hiring-manager intake page (`/intake/[token]`) replaces its
  plain `<textarea>` fields — Team Context, Key Requirements, Nice to Have,
  Anything else, and the Job Description — with the shared `RichTextEditor`
  (bold, lists, headings, etc.), matching the recruiter-side JobDetail editor.
  Content is stored as HTML (consistent with how JobDetail reads these fields);
  the plain-text AI JD generator still receives stripped text. Pre-filled,
  imported (PDF/TXT), and AI-generated values are converted to editor HTML so
  their structure survives, and validation switched from `.trim()` to
  `isHtmlEmpty()`.

### Added
- **Recruiter UI for the new scheduling features (no copilot needed).** Two
  additions so recruiters can drive availability + manage interviews from the
  dashboard: (1) a **"🕑 Set hours"** button next to each interviewer in the
  Schedule Interview modal that copies a no-login availability link for them
  (new `POST /api/interviewer-links`); (2) an **"Interviews" tab on the candidate
  profile** listing scheduled interviews with status, meeting link, a
  **Cancel** action (triggers the calendar cleanup + notifications) and a
  **Copy reschedule link** for self-schedule interviews. Fills the gap where a
  scheduled interview couldn't be viewed or cancelled from the UI after booking.
- **Candidate self-schedule now honours interviewer hours + real availability
  (Phase 2 of AI self-scheduling).** The self-schedule link (`/schedule/[token]`)
  no longer shows a raw 24×7 week grid. It now offers only slots over the **next
  7 business days** that fall inside every interviewer's **preferred hours**
  (from Phase 1, default Mon–Fri 9–6) **and** are free on their real calendar,
  shown in the candidate's local timezone and grouped by day. New availability
  engine (`lib/interviews/availability.ts` — timezone-aware, panel-aware slot
  computation) + shared calendar busy-aggregation (`lib/interviews/busy.ts`,
  extracted from the route). The copilot's `create_self_schedule_invite` now
  takes `interviewer_email` / `additional_interviewer_emails` and stores the
  panel so availability actually computes. When the org has no calendar
  connected to check against, the candidate page shows a note that the times are
  the interviewer's stated hours, not calendar-verified. 15 unit tests cover the
  tz + interval math. **Also fixed a pre-existing bug:** `/schedule/*` and `/api/schedule/*`
  were never in the public-route list, so logged-out candidates were bounced to
  sign-in — now public (like `/apply` and `/intake`).
- **Interviewer availability preferences (Phase 1 of AI self-scheduling).**
  Hiring managers / interviewers can now set their preferred interview hours —
  which weekdays, what times per day, and their timezone — via a **no-login
  link** (`/interviewer/[token]`), matching the intake-link pattern. Stored in a
  new `interviewer_preferences` table (migration 080) keyed by (org, email),
  defaulting to Mon–Fri 9–6 when unset. New facade
  `modules/ats/domain/interviewer-preferences.ts`, public GET/POST API at
  `/api/interviewer/[token]`, and a copilot tool
  `create_interviewer_availability_link` that generates the link and can email
  it to the interviewer. Made `/interviewer/*` public in middleware. Phase 2
  will make the candidate self-schedule link honour these hours over the next 7
  business days. Facade unit tests included.
- **Outbound webhooks now fire for interviews.** Added three events —
  `interview.scheduled`, `interview.rescheduled`, `interview.cancelled` — to the
  webhook system (previously only `opening.*` / `job.*` / `approval.*` events
  existed). They emit from every place an interview changes state: direct
  booking and the agent endpoint (`scheduled`), candidate self-schedule
  (`scheduled`) and reschedule (`rescheduled`), and coordinator cancel/delete
  (`cancelled`). Each payload carries `interview_id`, `application_id`,
  `candidate_id`, `hiring_request_id`, and `scheduled_at`. No DB migration or
  delivery-code change needed — HMAC signing/retries flow through unchanged;
  subscriptions opt in via their existing `event_types` array. Extended the
  `WebhookEvent` / `WebhookEventType` unions.
- **Automatic interview reminders (24h + 1h before).** When an interview is
  booked at a confirmed time — coordinator direct-booking or candidate
  self-schedule — RecruiterStack now queues two reminders that email the
  candidate + interviewer and Slack-DM the interviewer shortly before the
  interview. Built on the existing `job_queue` (new `interview_reminder` job
  type) drained by the prod pinger, so no cron/migration was needed. Reminders
  re-check the live interview when they fire and silently skip if it was
  cancelled, rescheduled, or moved, so stale reminders never go out.
  Reschedules queue fresh reminders for the new time. New files
  `lib/interviews/reminders.ts` + `notifyInterviewReminder`; wired into
  `/api/interviews` and `/api/schedule/[token]/confirm`, with unit tests.

### Fixed
- **Candidate reschedule now stores the new meeting's id.** The self-schedule
  confirm route created a fresh calendar event on reschedule but discarded its
  id, leaving the interview pointing at the deleted event. It now persists the
  new `calendar_event_id` + `meeting_platform`, so a later cancel targets the
  current event.
- **Cancelling or deleting an interview now cleans up the real calendar event
  and notifies attendees.** Previously the coordinator cancel (`PATCH` status →
  `cancelled`) and delete (`DELETE`) on `/api/interviews/[id]` only touched the
  database — the Google/Teams/Zoom meeting stayed on everyone's calendar and no
  one was told. Both now remove the underlying event and send cancellation
  emails (candidate + interviewer) plus a Slack notice. New shared helper
  `lib/integrations/cancel-event.ts` (`cancelCalendarEvent`) resolves the same
  host chain used at creation and supports Google, Teams, **and Zoom**; the
  candidate self-reschedule path (`/api/schedule/[token]/confirm`) now reuses it,
  which also fixes orphaned Zoom meetings and per-user-hosted events on reschedule.
  Added `notifyInterviewCancelled` and unit tests for the helper.

### Added
- **Intake form pre-fills from the linked requisition.** When the hiring manager
  opens `/intake/[token]`, fields the recruiter already set on the approved
  requisition are filled in as editable defaults: employment type, location,
  work model (from the location's remote type), salary min/max, and target start
  date. Each pre-filled field shows a small pencil icon signalling it can be
  edited. `getCanonicalIntakeJobByToken` now joins the linked opening + location
  and returns a `prefill` bag (custom_fields.intake values win over the
  requisition). Fields never captured upstream (level, headcount) stay blank.

## 2026-07-08

### Fixed
- **Hiring-manager intake links no longer show "Link not valid."** The four
  `/api/intake/*` routes (form load, `generate-jd`, `approve`, `preview-jd`) were
  still proxied to the Django backend, which reads the legacy `hiring_requests`
  table and can't resolve intakes created as canonical `jobs` (Phase 3 / C5.5).
  Removed those rewrites in `next.config.mjs` so the up-to-date Next.js intake
  routes handle them.

### Changed
- **Location settings form simplified.** Country is now a dropdown (full ISO
  3166-1 list, stored as the 2-letter code) instead of a free-text box that
  silently truncated to 2 chars. City stays free-text.
- **Sequence row action tooltips shortened** to single words — `Clone`, `Activate`,
  `Pause`, `Restore`, `Archive` (were long descriptive sentences).

### Removed
- **Location form: dropped `Type` (onsite/remote/hybrid) and `Timezone` fields.**
  Neither was consumed anywhere — `remote_type` describes a job, not an office,
  and the location `timezone` was written and read back into the form but never
  used by any scheduling/send logic. DB columns are left intact for now.

### Fixed
- **Business-day step delays now actually skip weekends.** Previously the
  `delay_business_days` flag was stored and shown, and the old editor preview
  faked weekend-skipping, but the scheduler counted plain calendar days — so the
  real send could land on a weekend. `computeStageDelaySeconds` now advances over
  Sat/Sun for business-day delays (both the "at HH:MM" and relative forms), the
  preview reflects it, and a test locks it in (Thu + 3 business days → the
  following Tue).

### Changed
- **Sequence UI polish.** Descriptive hover tooltips on the list-row actions
  (Duplicate / Activate / Pause / Restore / Archive). Switching the step editor's
  timezone now converts the send time to the same real-world moment (e.g. 9:00 AM
  IST → 10:30 PM CST) instead of keeping the digits and silently changing when it
  sends. Opening "Add Candidates" and then switching to Stages/Analytics now closes
  the Add-candidates panel so it no longer overlays the tab content.

### Added
- **Real sequence engagement analytics (SendGrid Event Webhook).** New endpoint
  `POST /api/webhooks/sendgrid/events` receives delivered/open/click/bounce events
  and writes them to `sequence_emails` (status + `opened_at`/`clicked_at`/
  `bounced_at` + open/click counts). Each send now enables SendGrid open/click
  tracking and stamps custom args (`seq_enrollment_id`, `seq_stage_id`) so events
  map back to the exact enrollment + stage. The Analytics tab's Opened/Clicked/
  Bounced numbers become real once the webhook is configured in SendGrid (needs
  `SENDGRID_WEBHOOK_TOKEN`; see `docs/sequences.md` §9). Webhook bypasses Clerk.

### Changed
- **Send conditions now actually branch.** The `sequence_email` sender evaluates a
  stage's `condition` ("if no reply / no open / no click") against the previous
  stage's engagement; a stage whose condition isn't met is recorded as `skipped`
  and the chain continues to the next stage (previously conditions were stored but
  ignored, so every stage sent). `skipped` rows are excluded from sent/delivered
  analytics counts. (Open/click conditions only have signal once the SendGrid
  event webhook above is live.)

### Added
- **Duplicate a sequence.** Each row on the Sequences list has a "Duplicate"
  action that copies the sequence and all its stages (timing, content,
  conditions) into a fresh **draft** named "… (Copy)". Runtime state
  (enrollments, sent emails, auto-enroll rules) is intentionally not copied.
  New endpoint `POST /api/sequences/[id]/clone`.

### Changed
- **Auto-enrollment rules are now editable in place.** On the sequence
  Automations / "Rules" tab, clicking a rule expands it into an editable panel
  (trigger, value, name) with Save/Cancel — previously rows were display-only
  (toggle + delete). Tag/stage values use a text field with a suggestions list,
  shared with the "New rule" form so both behave identically.
- **"Add Candidates" remembers the last tool used.** The Manual / Bulk filter /
  Rules choice now persists per-browser, so reopening "Add Candidates" returns to
  the same tool instead of always defaulting to Manual.
- **Sequence step scheduling shows an honest send-time preview.** For day-level
  steps the editor now displays the actual first-send moment (e.g. "Tue, Jul 15
  at 9:00 AM IST"), computed with the same function the sender uses, so the
  preview reflects the selected timezone (the old date preview ignored it). New
  day-level steps default their send time to 9:00 AM instead of a blank field.

### Added
- **Two new auto-enrollment triggers: "When someone applies" and "When
  application status changes to …".** Alongside tag-added and stage-moved, rules
  can now fire on the `applied` event (any new application — no value needed) and
  on `status_changed` (matched to the new status: active/rejected/withdrawn/hired),
  so all three application-lifecycle events are covered. The scan cursor now also
  starts at *now*, so a newly created rule only acts on events going forward
  (never a retroactive blast of historical events).
- **Salary range chip on the public job page (toggle-controlled).** The public
  application page can show a salary chip (e.g. `USD 120,000 – 160,000`) read from
  the **linked requisition's** comp range (`openings.comp_min/max/currency`). A new
  per-job **"Show salary range on the public application page"** toggle in the job
  editor controls it (default on); the chip is hidden automatically when no comp
  range is set.
- **Work model (Remote / Hybrid / On-site) replaces the "Remote OK" checkbox.** The
  intake form and the recruiter job editor now use a three-choice dropdown instead
  of a yes/no toggle. Stored as `custom_fields.intake.work_model`; the legacy
  `remote_ok` boolean is kept in sync (remote → true) so nothing old breaks, and
  older jobs without `work_model` derive it from `remote_ok` (true → remote,
  false → on-site).
- **"Send to Hiring Manager" wired end-to-end (Phase 2).** After a recruiter picks
  an approved requisition, the New Job drawer now offers two paths again: **Send to
  Hiring Manager** or **Fill it myself**.
  - **Send to HM** creates a draft job linked to the approved requisition, flags it
    as awaiting the HM's input, and emails the HM a personal intake link (new
    `renderIntakeInvite` email template). The recruiter then sees a confirmation
    screen with a **Copy link** button, so the flow works even when email is off.
    New endpoint: `POST /api/req-jobs/send-intake`.
  - **"Awaiting HM's input" badge** shows on the jobs list for these jobs (driven by
    a new `awaiting_hm` flag surfaced through `/api/jobs`), so they're visually
    distinct from ordinary drafts.
  - **Back to the recruiter, not auto-live.** When the HM submits their intake, the
    job now moves to **To be Published** (`approved`) for the recruiter to review and
    publish — it no longer goes live automatically. The `awaiting_hm` flag clears on
    submit.
  - **Intake form title locked.** The role title flows through from the requisition
    and is now shown read-only on the HM intake form (was editable), keeping the
    requisition as the single source of truth.
  - No database migration needed — reuses the existing `approved` status and the
    job's `custom_fields.intake` JSON bag.
- **Mandatory-field rules across the requisition / job / intake forms (Phase 1).**
  - **Requisition form** (`/openings/new`): **Title** and **Department** are now
    required to save a draft (Department was optional before).
  - **Job form** (New Job drawer) now requires **Location**, **Work model**,
    **Seniority**, and **Employment type** before you can create a job. The old
    "Remote OK" checkbox is replaced by the Remote/Hybrid/On-site dropdown, and a
    new Employment type dropdown was added. Location, work model, and employment
    type now persist to `custom_fields.intake` (so they show on the public apply
    page, which previously they didn't for drawer-created jobs).
  - **Intake form** (`/intake/[token]`) now requires the same four fields
    (Location, Work model, Seniority, Employment type).
  - **Flow-through, locked:** when a job is created from an approved requisition,
    **Title** and **Department** are pre-filled and shown read-only ("· from
    requisition"), keeping the requisition as the single source of truth.
    Location + Employment type also pre-fill from the requisition but stay editable
    (they're optional at the requisition stage). Employment type carries through
    the `/openings/[id]` "Create job" hand-off as well.
- **Bulk-select enrolled candidates + bulk remove.** The Enrollments list has a
  "Select all" checkbox and per-row checkboxes; a "Remove N" action deletes the
  selected enrollments at once.
- **Bulk filter fields are searchable multi-select dropdowns.** Department / Jobs
  / Stages / Tags / Status each fold into a dropdown whose header is a search
  box, with the current selection shown as chips (so you can see what produced a
  preview). Jobs without a title now show "(untitled job)" instead of blank.
- **Remove a candidate from a sequence.** Each enrolled row now has a remove
  (trash) button; `DELETE /api/enrollments/[id]` cancels queued sends, drops the
  email records, and deletes the enrollment (org-scoped).

### Changed
- **Add-candidate tools are now a pop-in panel, hidden by default.** The
  Enrollments tab shows just the enrolled list; "Add Candidates" is a plain
  button (dropdown removed) that slides a panel in from the far right holding the
  three tools (Manual · Bulk filter · Rules). No backdrop, so the left list keeps
  previewing live who'd be enrolled as you work in the panel.
- **Sequence Enrollments is now a two-pane workspace.** Left = who's enrolled (or
  a live preview of a pending selection); right = the three "Add Candidate" tools
  — Manual search · Bulk filter · Auto-enrollment rules — with a switcher. The
  bulk/manual pop-out drawers are gone (inline panels now); as you build a manual
  selection or a filter, the left panel previews exactly who would be enrolled
  (`enroll-by-filter` dryRun now returns candidate names). The automation-rule
  tag/stage value is a real dropdown of existing values (with a "Custom…" escape).
- **Public job page tag row updated.** Work model is its own chip (Remote / Hybrid
  / On-site — shown for every arrangement) alongside a separate location chip
  (city, country). The seniority/level chip ("Staff", etc.) was removed from the
  public page. Slightly larger gap between the job title and the chips.

### Fixed
- **EEO / voluntary screening questions can no longer be required or used to
  disqualify.** In the application-form editor, ticking "EEO / voluntary" now
  forces the question to be optional (the Required box is disabled) and clears any
  auto-disqualify rule. The public form and both the client- and server-side
  submit checks treat EEO questions as never-required — even for older data that
  marked one both required and voluntary (which showed a contradictory
  "* (voluntary)").

## 2026-07-07

### Added
- **Bulk enroll by filter.** A "Bulk enroll" drawer on the sequence page lets you
  build a candidate segment from any combination of **Department / Jobs / Stages /
  Tags / Application status** (multi-select — AND across boxes, OR within), see a
  live match count, and enroll the whole cohort at once. Canonical-model resolver
  (`src/modules/crm/domain/candidate-filter.ts`, `POST /api/sequences/[id]/enroll-by-filter`),
  reuses the idempotent `enrollCandidate` (skips already-enrolled), excludes
  do-not-contact tags by default.
- **Event-driven auto-enrollment rules (Slice 1).** An **Automations tab** on
  each sequence's page defines rules that auto-enroll a candidate into that
  sequence when an event fires: **tag added** (`candidate_tags`) or **application
  moved to a named stage** (`application_events` `stage_moved`). A lightweight poll
  (`scanAutomations`) runs on the queue-processing cron, matches new events since
  a cursor to enabled rules, and enrolls via the shared `enrollCandidate` —
  idempotent (skips anyone already active/paused). Enrollment logic extracted to
  `src/modules/crm/domain/enroll.ts` and reused by the enroll API route. New
  `/api/automations` CRUD; no Django changes.

### Schema
- **079** — `sequence_enrollment_rules` (org rules: trigger_type/value → sequence)
  and `automation_scan_state` (poll cursor). Requires applying migration 079.

### Changed
- **Sequence page: unified how candidates get in.** The header "Add Candidates"
  button is now a dropdown → *Select manually · Bulk enroll by filter ·
  Auto-enrollment rules*. The standalone **Automations tab is gone**; its rules
  now live at the top of the **Enrollments** tab, so you view who's enrolled and
  edit the auto-enroll conditions in one place.
- **Moved Vercel compute region `iad1` (US-East) → `sin1` (Singapore) to co-locate
  with the Supabase database.** Root-caused the ~2.5s TTFB on logged-in pages
  (`/api/jobs` 2457ms, `/api/candidates` 2059ms — measured via `scripts/measure-perf.mjs`)
  to a geography mismatch: functions ran in Washington DC while the DB is in
  Singapore (`ap-southeast-1`), so every per-request DB round-trip (auth scope +
  handler queries) crossed ~220ms each and stacked. Handler code was already clean
  (`listCanonicalJobBoardSummaries` runs its queries in `Promise.all`). Fix is a
  one-line `vercel.json` region change; takes effect on next deploy. Re-run the
  perf script after deploy to confirm the drop.

### Added
- **Backend-consolidation tooling (planning for the Django → Next.js collapse).**
  Two read-only scripts under `scripts/`:
  - `migration-checklist.mjs` — reconciles Django routes (`../recruiterstack-api/*/urls.py`)
    against the `next.config.mjs` proxy rules and `src/app/api` handlers, writing a
    living checklist to `migration/route-status.md`. Current result: 29 READY,
    1 LEGACY (`hiring-requests`), 1 KEEP (`voice`), **zero un-portable gaps**.
  - `measure-perf.mjs` — records TTFB for key pages/APIs and appends timestamped
    runs to `perf/perf-log.json` (before/after baseline). Reads only; pass
    `PERF_COOKIE` to measure logged-in routes.

### Docs
- Architecture memo + decision record (DR-001) produced for the two-backend
  consolidation: keep Next.js as the single app backend, retire the duplicated
  Django REST layer, keep the voice-AI service standalone.
- **Added `docs/backlog.md`** — a central "parking lot" for plans not being worked on
  now. Seeded with the Django consolidation item (+ safety net, reversible plan) and
  lighter noted items from the architecture/perf review.

## 2026-07-07

### Changed
- **Careers benefit images — fixed 4:3 box, stretched to fill.** After trying
  crop (trimmed art) and contain (uneven gaps), benefit images now sit in a
  fixed 4:3 box and fill it exactly (`object-fill`): every card's image is the
  same size with no gaps and no crop. Images that aren't 4:3 are stretched to
  fit. The benefits editor now shows a note recommending ~800×600px (4:3) with a
  background matching the card colour, so compliant artwork stays crisp.

## 2026-07-06

### Fixed
- **Sequences: resuming a paused enrollment now continues sending.** Pausing
  breaks the send chain (the due job runs, sees a non-active enrollment, and
  returns without scheduling the next step), so resume previously did nothing.
  Resuming (`/api/enrollments/[id]` → `active`) now re-enqueues the chain — only
  if nothing is already queued — so the next unsent step goes out and the
  sequence continues forward (no backlog burst). Also scopes the update to the
  caller's org.

### Changed
- **Sequences list now groups into foldable Active / Archived panes.** The flat
  list is split into two collapsible coloured panes (green Active — open by
  default — and tan Archived — collapsed), mirroring the Openings page style,
  each with a count badge. Archived rows gained a Restore action. Colours live
  in one `PANE_TINT` config at the top of the page.

### Added
- **Step delays now support minutes and hours, not just days.** The sequence
  step editor's delay unit dropdown offers minutes / hours / days / business
  days (stored via existing `delay_minutes`/`delay_days`; hours = minutes×60). A
  fixed clock time ("at HH:MM") now shows only for day-level delays, so minute/
  hour steps are cleanly relative to the previous step — no accidental
  next-day rollover. Shared mapping helpers in `src/lib/sequences/schedule.ts`
  with tests.

## 2026-07-05

### Added
- **Careers page — full rich text everywhere + image controls (Phase B
  refinement).** Every copy field on the careers page (hero headline,
  subheadline, tagline, and every content-section heading/body) is now a
  Google-Docs-style rich editor, and the editor gained **text colour** and
  **highlight colour** pickers (full spectrum via a native colour input) on top
  of bold/headings/lists/align/link (`RichTextEditor.tsx`, powered by new
  `@tiptap/extension-text-style` / `-color` / `-highlight`). Content sections
  also gained:
  - **Benefits grid:** an optional image per card, an optional card fill
    colour, and a rich-text card body.
  - **Story / spotlight:** image **placement** (left of text / right of text /
    full width) and a manual **width** (e.g. `60%` or `320px`).
  Stored HTML is sanitized on write (Zod) and at render (DOMPurify keeps colour
  spans and highlight marks; the domain sanitizer validates colours, widths, and
  drops empty/unsafe content). No new migration — sections live in the existing
  `content_sections` JSON and hero copy in existing columns.
- **Careers editor — per-text-box font & font size.** The rich editor now has
  **Font** and **Size** dropdowns; leaving either on its default keeps the exact
  current look (defaults unchanged — the picks are opt-in inline styles). Fonts
  are curated Google/system families (`FontFamily` / `FontSize` from
  `@tiptap/extension-text-style`). The public careers page scans the branding
  HTML and loads every picked Google font in one stylesheet, and the settings
  surface preloads them so editors and the live preview render accurately. No
  migration — picks are stored as inline styles in the existing HTML.
- **Careers content sections — drag-to-reorder, story image sizing, and more
  upload formats.** Sections can now be reordered by dragging the grip handle
  (native HTML5 drag; up/down arrows still work). Story/spotlight images gained
  an **Image height** field and a **Fill vs Fit** toggle on top of width and
  placement, with a hint that only *Full width* placement can span the page.
  Benefit-card images now sit in a **uniform fixed-shape band** and are shown in
  full (`object-contain`, never cropped); any space around an odd-shaped image
  takes the card fill colour so it blends in, so every card's image lines up.
  Image upload now
  accepts **SVG and GIF** too (client picker + server), and re-selecting the
  same file after a failed attempt works. No migration — new fields live in the
  existing `content_sections` JSON.

### Fixed
- **Careers benefit images — uniform bands, no crop, no gaps.** Images now sit
  in a fixed-shape band, centered and shown in full (`object-contain`); leftover
  space takes the card fill colour so mismatched-shape images blend and every
  card's image lines up.
- **Careers content — heading buttons now enlarge text.** In careers body copy,
  H1/H2 rendered *smaller* than body text (RichText's compact defaults), so the
  heading buttons appeared to shrink text. Careers blocks now render H1/H2 as
  proper larger headings; users' own inline font-size picks still win.

### Changed
- **Careers job cards — trimmed top space, readable department pill, bigger
  type.** Reduced the card's top padding and the gap above the Apply button,
  bumped every font except the job title, and fixed the department pill washing
  out on pale brand colours (falls back to dark slate when the brand is light).
- **Sequences now schedule stages dynamically instead of snapshotting at enroll
  time.** Enrollment used to pre-queue a job for every stage that existed at that
  moment, so stages added later never fired for already-enrolled candidates.
  Now enrollment schedules only the first stage; after each send the handler
  reads the LIVE stage list, sends the next *unsent* stage, and schedules the
  one after (`src/lib/sequences/schedule.ts`, `job-handlers.ts`, `enroll/route.ts`).
  Result: stages added mid-sequence are picked up by people still in flight;
  deleted stages are cleanly skipped (no ghost send); finished enrollments are
  left alone; reply/pause stops still honoured. Step delays are now measured from
  the previous step rather than from enrollment.

### Fixed
- **New sequence stages are ordered server-side (append at end).** The add-stage
  API assigned `order_index` from the client, defaulting to `1`, which could
  scramble ordering; the server now sets it to current max + 1
  (`sequences/[id]/stages/route.ts`).

### Added
- **Sequences auto-stop on candidate reply (reply detection).** Sequence
  emails now carry a per-enrollment `Reply-To` token
  (`reply+<enrollmentId>@reply.recruiterstack.in`, override via
  `SEQUENCE_REPLY_DOMAIN`). Candidate replies land in SendGrid Inbound Parse →
  the Django `/api/webhooks/sendgrid/inbound` webhook (updated to match the
  token deterministically, with the old email/recency match kept as fallback)
  marks the enrollment `replied`, and both senders already skip non-active
  enrollments — so remaining stages stop automatically. Requires an MX record
  on the `reply.` subdomain + a SendGrid Inbound Parse host (infra, one-time).
- **Careers page — custom content sections (Phase B).** A section builder in
  Careers settings lets each org add, reorder, and delete content blocks that
  render on the public page below the open roles. Four block types:
  - **Text** — a titled rich-text block (headings, bold, bullets, links).
  - **Benefits grid** — a heading plus a grid of perk cards (title + optional
    blurb), e.g. "Our unique approach to benefits".
  - **Story / spotlight** — an image beside rich text with an optional link,
    e.g. "Meet the team", a founder note, or a documentary link.
  - **Call-to-action banner** — a big headline + optional button, e.g.
    "Ready to do the best work of your career?".
  Blocks reorder with up/down arrows; the settings live preview mirrors them.
  Bodies and links are sanitized on write (Zod) and again at render (the domain
  sanitizer drops empty/unknown blocks and unsafe link schemes). Story images
  upload to the existing company-assets bucket (new `story` upload kind).
- **Careers job cards — larger, more readable type.** Bumped the title, meta
  chips, and Apply button sizes now that cards carry more detail.
- **Careers page polish — richer job cards, logo color match, and a real
  rich-text About (Phase A).** Feedback pass after comparing our page against
  Kula/Multiplier:
  - **Search + filters always show** when a page has any roles (previously
    hidden unless there were several roles across multiple departments), so
    every page reads like a proper careers site from the first role.
  - **Nav links slightly larger** in the top-right so they read as navigation,
    not fine print.
  - **Job-edit form gains employment type, location, and remote/on-site** —
    these already showed as chips on the public cards but couldn't be edited
    per job. Editing them does *not* trigger re-approval (they're descriptive,
    not part of the role's substance).
  - **Match-your-logo accent color** — after uploading a logo, the settings
    page reads its dominant brand color and offers a one-click "Match your
    logo" button next to the Accent color field, so the Apply / View-open-roles
    buttons pick up the logo's color instead of a hand-picked hex.
  - **About is now a Gmail-style rich-text editor** (headings, bold, bullets,
    links) rather than a plain box, and renders as sanitized HTML on the public
    page. Legacy plain-text About values are wrapped into paragraphs on load, so
    nothing is lost.

### Changed
- **Careers page redesign — on par with leading ATS career sites (Phase 1).**
  Reworked the public careers page (`/careers/[slug]`) toward the Kula/Plum-style
  quality bar:
  - **Top nav bar** — logo (or company name) on the left, a brand-accent "View
    open roles" button on the right; sticky on scroll.
  - **Hero** now centers the company name + tagline with an "Explore open roles"
    CTA that jumps to the roles grid.
  - **Job cards** moved from a plain list to a responsive 1/2/3-column grid, each
    card showing a department chip (tinted with the brand color) plus
    location / employment-type / remote-or-onsite / seniority badges — data we
    already collected at intake but never surfaced here.
  - **Color roles clarified**: the *primary* brand color drives the hero block and
    chip tints, while the *accent* color drives every call-to-action (nav button,
    hero button, Apply). CTAs now pick a legible text color automatically, which
    fixes Apply buttons washing out to a greyed, unreadable state on pale brand
    colors. Careers and apply pages now use the accent color for actions
    consistently.
  - The settings **live preview** mirrors all of the above.

### Added
- **Careers page — search, filters, and configurable branding (Phases 2 & 3).**
  Builds on the redesign so each customer's page can look and read like their own:
  - **Search + filters** on the roles grid — a keyword search box plus
    department and location dropdowns, all running instantly in the browser.
    Filters only appear when there's enough to filter, with tidy empty states.
  - **Custom hero copy** — optional hero headline and subheadline fields; when
    left blank they fall back to the company name and tagline.
  - **Top-navigation links** — admins can add up to 6 named links (e.g. "About
    us", "Our vision") shown in the top-right nav.
  - **Configurable nav CTA** — the top-right button's label and destination are
    now editable (defaults to "View open roles" jumping to the roles grid).
  - **"Powered by RecruiterStack" toggle** — can be hidden from the public page.
  - Link inputs are sanitized (block `javascript:`/`data:`/`vbscript:` URLs) in
    validation and again at render as defense-in-depth.
  - Settings form gains controls + live preview for all of the above.

### Schema
- **Migration 078** (`078_careers_content_sections.sql`) adds
  `content_sections` (JSONB, default `[]`) to `org_settings` — an ordered list
  of custom content blocks (text / benefits / story / CTA) for the public
  careers page. Additive and idempotent (`ADD COLUMN IF NOT EXISTS`).
- **Migration 077** (`077_careers_nav_and_hero.sql`) adds to `org_settings`:
  `hero_headline`, `hero_subheadline`, `nav_links` (JSONB), `nav_cta_label`,
  `nav_cta_url`, `show_powered_by`. Additive and idempotent
  (`ADD COLUMN IF NOT EXISTS`).

## 2026-07-04

### Changed
- **Careers hero: hide the company-name heading when a logo is present.** A
  wordmark logo already spells out the company name, so drawing the name again as
  a text heading right beside it showed the brand twice, stacked. Now the name
  heading is hidden visually whenever a logo is uploaded (kept in the page's
  hidden structure for screen readers and search engines); with no logo, the name
  renders as before. Applied to both the public careers hero and the settings
  live preview.

### Fixed
- **Careers hero: unreadable name/tagline on light brand colors.** The hero
  drew the company name and tagline in fixed white text, which assumed a dark
  brand color. Pick a light primary color (e.g. a pale cream) and the name
  washed out to an invisible ghost behind the logo — on the live careers page,
  not just the settings preview. Added a small luminance helper
  (`src/lib/branding/contrast.ts`) that picks dark text on light backgrounds and
  white text on dark ones; applied to both the public careers hero and the
  settings live preview so they match. (When a hero *image* is set, the existing
  dark overlay means white text still reads, so that case is unchanged.)
- **Resume/CV parsing returned 422 for every PDF (autofill never worked).** JSON
  mode in the Gemini wrapper (`lib/ai/llm.ts`) always set `thinkingBudget: 0` to
  stop hidden "thinking" tokens truncating the reply — but **gemini-2.5-pro
  rejects that** ("Budget 0 is invalid — this model only works in thinking
  mode"), so the call threw and the route returned a generic "Could not read
  this resume." This silently broke every pro-based JSON extraction: the public
  apply autofill (`/api/apply/parse-cv`), the recruiter CV parser
  (`/api/candidates/[id]/parse-cv`), and the candidate↔role matcher
  (`lib/ai/matcher.ts`). Fix: only disable thinking for flash-tier models (which
  support it); pro keeps thinking on, and JSON mode still guarantees a parseable
  reply. Also switched the public `/api/apply/parse-cv` to gemini-2.5-flash — it
  is candidate-facing and latency-sensitive, and Flash is fast, cheap, and
  accurate enough for these structured fields. Added `llm.test.ts` locking the
  per-tier thinking behavior so this can't regress. (Flash callers — autopilot,
  job-scorer — were unaffected and are unchanged.)

### Added
- **Logo auto-centering on upload.** When a logo is uploaded on the Careers
  page settings, the browser now tight-crops its artwork and re-pads it evenly
  before saving (`src/lib/branding/normalize-logo.ts`, wired into
  `CareersPageCard`). Logos frequently carry uneven or excessive transparent
  padding, which both made them look off-center on the apply/careers pages and
  opened an oversized gap to the elements below them, even though the layout
  centers the image box correctly. Normalization measures the true rendered
  bounds — `getBBox()` for SVG (so it handles text wordmarks, which need a font
  engine to size) and an alpha-channel scan for PNG/WebP — trims to those
  bounds, then re-pads by an even 5% margin so the logo is centered on both
  axes and fills its display box (no phantom padding inflating the spacing).
  Runs client-side (the only place that can render SVG text) and falls back to
  the original file on any error, so it never blocks an upload. To fix an
  already-uploaded logo, re-upload it via Settings → Careers page.
- **Careers page: live preview in settings.** The Careers-page settings card now
  shows a miniature, live-updating render of the public careers page (hero,
  logo, colors, font, tagline, company name, and a sample role card) that
  updates as fields change — so customers see how their branding lands before
  publishing, instead of only via the open-in-new-tab "Preview page" link. The
  preview loads the chosen Google Font so the type is accurate, and faithfully
  mirrors the real hero markup (including that a wordmark logo plus the company
  name shows the name twice — surfacing that redundancy so it can be caught).
- **Careers page: remove an uploaded logo or hero image.** Both the Logo and
  Hero image slots gain a "Remove" button (previously you could only Replace,
  never clear). Removing the hero falls the banner back to a clean solid
  brand-color band. Clarified the hero-image helper text: it's optional, and the
  logo should not be uploaded there.

### Changed
- **Settings: Careers page moved to its own tab.** The Careers-page card had
  grown into a mini-page (live preview + ~10 fields) and dwarfed everything in
  the Workspace grid. It now has a dedicated "Careers page" sidebar tab where it
  gets full width, with the form on the left and the live preview in a sticky
  panel on the right (stacked, preview-on-top, on narrow screens). Workspace now
  holds only the short org-data cards, which tile cleanly.
- **Settings → Workspace: masonry card layout.** The workspace cards were in a
  2-column grid, where grid rows forced every card to match the tallest one — so
  the short Company-info card stretched to the height of the tall Careers card
  beside it, wasting a large empty block. Switched to a masonry column layout
  (`columns-2` + `break-inside-avoid`) so each card keeps its natural height and
  the short cards pack vertically, filling the space instead of stretching.
- **Apply page: enlarged the section tabs.** "Job details" and "Application
  form" bumped from `text-sm` (14px) to `text-base` (16px) so they read at a
  comfortable size relative to the title and chips.
- **Synced the repo wordmark to the centered version.**
  `public/logo-wordmark-light.svg` now matches the mathematically centered
  artwork (tight-cropped with an even 8px margin, `textLength`-pinned wordmark)
  that is also the live logo in storage.
- **Apply page: evened the header spacing.** The logo's bottom margin was
  reduced (`mb-6` → `mb-4`) so the logo→title gap sits closer to the
  title→chips rhythm instead of looking disproportionately large.
- **Apply page: resume autofill Phase 2 — profile enrichment.** The extra
  fields the CV parser already extracts (current title, location, skills, years
  of experience) are now saved onto the candidate profile when the application
  is submitted, so a new applicant's profile arrives pre-filled instead of
  blank. The apply page stashes the grounded parse result and sends it with the
  submission; `publicApplySchema` gains optional, bounded `current_title`,
  `location`, `skills[]`, `experience_years` (client-relayed, so every field is
  capped to keep a tampered payload harmless). `/api/apply` passes them into
  `findOrCreateCandidateProfile`. Enrichment applies to **new** profiles only —
  a returning candidate keeps their existing details. Mirrored on the Django
  backend (separate repo `recruiterstack-api`): `ApplyView.post` now reads and
  bounds the same fields via a new `_clean_enrichment` helper and passes them
  into the inline `Candidate.objects.create` (no DB migration — the columns
  already exist). Both sides covered by tests.

## 2026-07-03

### Added
- **Apply page: autofill from resume.** Candidates can now upload their CV and
  have the form fill itself in (name, email, phone, LinkedIn), matching the
  pattern used by ATSs like Kula/Multiplier. New public, token-gated,
  rate-limited endpoint `POST /api/apply/parse-cv` reads the resume and returns
  hallucination-checked fields. Guardrail stack (per the resume-parsing research):
  deterministic regex extracts email/phone/LinkedIn straight from the resume
  text (never the AI); Gemini (strict JSON, temperature 0) handles the name and
  richer fields; every AI value is **grounded** — dropped unless it actually
  appears in the resume text; autofill only fills *empty* fields and never
  overwrites what the candidate typed; any failure is silent (manual entry).
  Adds `unpdf` (PDF→text) and `mammoth` (DOCX→text) for server-side extraction.
  Extra fields (title, location, skills, experience) are extracted and grounded
  too, ready for Phase 2 (saving them to the candidate profile, which needs a
  matching Django change). Pure grounding/regex logic in
  `src/lib/apply/resume-autofill.ts` with 13 unit tests.
- **Apply page: employment-type field.** The hiring-manager intake form now has
  an Employment Type dropdown (Full-time, Part-time, Contract, Internship,
  Temporary), stored on `custom_fields.intake.employment_type` and surfaced to
  candidates as a job-meta chip on the apply page.

### Changed
- **Apply page: bigger logo + job-meta chips.** The uploaded org logo is now
  `h-24` (larger than the job title, as intended). Under the title we now show a
  row of pill chips for the details we capture at intake — department, location,
  employment type, work type (Remote / On-site from `remote_ok`), and seniority
  level — instead of the old plain `department · location` line. The apply-
  preview data now carries `location`, `remote_ok`, `level`, and
  `employment_type` from `custom_fields.intake` (location was previously always
  blank).
- **Public logo presentation cleaned up.** On the light apply page (and its
  live preview) the org's uploaded logo now renders directly on the page —
  transparent, no white box — and larger (`h-16`). The white backing chip is
  kept only on the careers-page hero, where the logo sits on a dark photo and
  needs a light backing to read. Added transparent-background guidance under
  the Logo upload (and a size hint under Hero image) in the careers settings
  card.
- **Approvals inbox restyled to match the other list pages.** The Pending
  decisions and History sections are now foldable tinted panes (honey for
  Pending, stone for History) like the Approval chains / Requisitions pages,
  with the History search-and-filter row tucked inside its pane. Added a
  summary stat-card strip on top: Total / Pending / Approved / Rejected.
- **Approval chains page: section icons.** Each foldable section header
  (Requisitions / Pipelines / Offers) now shows a small entity icon right
  before its label, matching the icons used for those entities elsewhere.

### Fixed
- **Public apply links returned "This link is no longer valid."** The Clerk
  middleware's public matcher used `/api/apply/(.*)`, which matches
  `/api/apply/upload` but not the bare `/api/apply` that loads and submits an
  application — so `/api/apply?token=…` was redirected to sign-in, and the apply
  page parsed that HTML as JSON and fell back to the "not valid" screen. Widened
  to `/api/apply(.*)` (and `/api/intake(.*)`) so the bare endpoints are public.

## 2026-07-02

### Changed
- **Public apply page redesigned into a two-tab layout.** Centered company
  logo → job title → `Department · Location`, then **Job details** /
  **Application form** tabs (Job details has an "Apply for this role" button
  that jumps to the form), mirroring the Kula/Multiplier reference.

### Added
- **Phone, LinkedIn, and Resume are now required on every application.** Red
  `*`, inline hints, and a disabled Submit until all are valid (LinkedIn must be
  a valid URL); enforced again on the Django `/api/apply` endpoint.
- **Fixed the CV picker.** "Upload file" now opens the file dialog on click and
  "Google Drive link" reveals/focuses the link field — previously only drag &
  drop worked.
- **Email-format validation on job applications.** The public apply form now
  rejects malformed email addresses — a gentle inline hint under the Email field
  (and a disabled Submit) on the client, plus a hard `EMAIL_REGEX` check on the
  Django `/api/apply` endpoint (previously only presence was checked). Prevents
  storing obviously-broken addresses that bounce on the first recruiter email.
  Note: this is format-only; it does not verify the mailbox exists.

### Removed
- **Temporary `/api/debug/env-check` diagnostic endpoint** (Django + the Vercel
  proxy rewrite) used to debug SendGrid env-var propagation on Railway.

### Changed
- **Jobs / Candidates / Requisitions: foldable Active & Past panes with a
  coloured header bar.** Each pane's header is now a click-to-collapse/expand bar
  (chevron + label + count), matching the fold pattern on the Approvals page. The
  header "fixed block" is tinted with existing page neutrals only — warm **sand**
  for Active, **stone** for Past (no new hues) — with the count badge recoloured
  to sit on it. All three pages share one `PANE_TINT` constant so the colours stay
  in lockstep.
- **Consistent summary cards with a stage icon across all three list pages.**
  Jobs and Requisitions render their top summary tiles through one shared
  `StatCards` component — a compact tile with the stage icon in a tinted chip and
  the count + label beside it, identical type/size/alignment on both. The
  Candidates Hiring Funnel is kept (with its drag-to-reorder "Customise funnel"),
  and its stage cards were restyled to use the exact same icon-chip + count +
  label layout and fonts, so the three pages now read consistently.
- **Approvals: each section gets its own colour.** The Requisitions / Pipelines /
  Offers foldable sections were previously two greens + amber (Requisitions and
  Offers looked identical). Now Requisitions is green, Pipelines amber, Offers
  blue ("Signal" theme, +1 intensity) so the three read as distinct.

## 2026-07-01

### Fixed
- **Candidate resumes wouldn't load in-app, and CV fields weren't pulled through.**
  Two problems, both fixed: (1) the private `resumes` storage bucket was being
  linked with public URLs, so the in-app viewer/download got a "Bucket not found"
  error — resumes now stream through a new `GET /api/candidates/[id]/resume` that
  mints a short-lived signed link and redirects, keeping candidate PII private.
  (2) The public apply flow stores the CV file but never reads it, so profiles came
  up blank (empty skills, no title). A new `POST /api/candidates/[id]/parse-cv`
  extracts title, location, years, skills, LinkedIn and phone from the PDF and fills
  in **only the blank fields** (never overwrites recruiter-entered data). It runs
  automatically the first time a candidate profile is opened when the profile looks
  unparsed, and there's a manual "Re-parse CV" button on the Resume panel.

### Changed
- **Tinted the Approvals section headers with the brand palette.** On Admin →
  Approvals, each foldable section header (Openings / Offers → pine-green, Jobs →
  gold) now carries a soft background, matching chevron/title/count-badge colours,
  so the three groups are easier to tell apart at a glance. Purely cosmetic.

### Added
- **Fallback-sender warning in the email composer.** New `GET /api/org/sender-status`
  reports whether the org has verified its own sending domain (always `false` today,
  since per-org verified sending hasn't shipped yet). The Draft Email drawer now shows
  the real sending address next to the display name, plus an amber "Domain not verified"
  pill and a plain-English notice that emails will go from the shared RecruiterStack
  address. The endpoint is the seam per-org verified sending fills in later — once an
  org verifies a domain the warning auto-hides.

### Fixed
- **AI scoring/matching failed with "AI returned invalid JSON".** After the
  Claude→Gemini switch, Gemini 2.5's hidden "thinking" tokens consumed the
  output-token budget and truncated the JSON reply mid-object. Fixed in
  `generateText`'s `json` mode: it now (a) sets `responseMimeType:
  application/json` so Gemini can't wrap the answer in prose/markdown, (b)
  disables thinking (`thinkingConfig.thinkingBudget = 0`) so the whole budget
  goes to the actual answer, and (c) the callers raised their budgets to 2048.
  Applies to the job scorer, matcher, and autopilot rejection-email draft.

### Added
- **Requisition field manifest — one source of truth for copilot inserts.** New
  `src/modules/ats/domain/opening-fields.ts` defines every agent-settable opening
  field once; the copilot's `create_requisition` tool schema is now generated from
  it and the save path is driven by it, so the tool, the domain create, and the DB
  table can no longer drift apart. A compile-time drift check fails `typecheck` if
  `openings` gains a business column the manifest neither maps nor excludes.

### Fixed
- **Copilot silently dropped requisition location & hiring manager.** The
  `create_requisition` tool never exposed `location` or `hiring_manager`, and the
  handler discarded any field it didn't recognise, so "Bangalore / tech@…" vanished.
  The tool now accepts location (by name) and hiring manager (by email), resolves
  them to ids, and *refuses to silently drop* an unknown field — it errors with a
  clear message (e.g. `No location named "Bangalore"`) instead.

### Fixed
- **Requisition Hiring-manager / Recruiter dropdowns only listed already-assigned
  people.** The opening detail page fetched just the requisition's current HM,
  recruiter, and creator, so no one else on the team (including yourself) appeared
  in the pickers. It now lists all active `org_members`, matching the New Opening
  form.

### Fixed
- **Copilot recruiting analytics returned all zeros.** `get_recruiting_analytics`
  still read the retired `hiring_requests` table (wiped), so every funnel/source/
  velocity figure came back empty. Now reads the canonical `jobs` spine via
  `fetchCanonicalAnalyticsInputs`, and its "active jobs" filter uses canonical
  statuses (`open`/`approved`) instead of legacy ones.
- **Copilot showed "Unknown job" everywhere.** Ten copilot read-tools (inbox,
  candidate view, notes, scorecards, outreach email, WhatsApp, application events,
  stale-check, email drafting) looked up the job title on the retired
  `hiring_requests` table, so any candidate on a canonical job showed no title —
  and AI-drafted emails lost the role/department context. All now read the title
  (and department) from canonical `jobs`, aliased so callers are unchanged.
- **Copilot could not create requisitions or jobs.** Every AI-driven insert into
  `jobs` failed on the `created_by` NOT NULL constraint because the acting user's
  id was never threaded to the copilot's tools. Now passed through the copilot
  chain (route → orchestrator → sub-agent → tools) and stamped as `created_by`,
  matching the website's New Job / New Requisition path.
- **Copilot showed each answer twice.** The delegated sub-agent's reply rendered
  as both a green status chip and the message bubble. The chip is now a neutral
  "… agent responded" so the answer appears once.
- **Copilot created "requisitions" that never appeared on the Requisitions page.**
  The `create_intake_request` tool wrote to the retired intake flow (and the intake
  form no longer exists on the frontend), so the copilot's requisitions vanished.
  Replaced it with three tools that use the canonical spine: `create_requisition`
  (creates a draft `opening` that shows on the Requisitions page),
  `list_requisitions`, and `submit_requisition` (routes a draft for approval via
  the existing approval engine). The ATS system prompt was updated to match.
- **Copilot bulk add-to-pipeline and bulk-score silently did nothing.** Both wrote
  to / queried the retired `hiring_request_id` anchor, so newly added applications
  used the wrong column and the scorer found no candidates to score. Both now use
  the canonical `job_id` anchor, matching how real applications are stored.

### Schema
- **Added the `notifications` table (migration 076).** The app has always created,
  listed, and marked notifications from code, but no migration ever created the
  table — so in production every `GET /api/notifications` returned 500 (PostgREST
  "Could not find the table 'public.notifications'"). Columns mirror the code's
  `Notification` type exactly; org-scoped, RLS with a service-role policy.

### Changed
- **Copilot job creation now enforces the approved-requisition gate.** The
  `create_job_and_pipeline` tool refuses to create a job without an approved
  requisition — it lists the approved ones to pick from, or explains none exist —
  mirroring `POST /api/req-jobs` (the single source of truth for that rule).
- **Sidebar: widened the espresso rail (140px → 166px)** so the full
  "RecruiterStack" logo text fits without truncation.
- **Jobs list: single global search across both panes.** Removed the separate
  search box inside the "Past" block; the header search now filters both the
  Active table and the Past list. First step toward making the Jobs / Openings /
  Candidates list pages consistent (shared header search, time filter, and
  Active/Past two-pane layout).
- **Requisitions (Openings) list: shared header toolbar to match Jobs.** Replaced
  the two per-block search boxes with a single global search in the page header
  that filters both the Active and Past blocks; broadened search from title-only
  to title + department + location; and added the same time filter (Last 7 days /
  30 days / 3 months / All / Custom range on `created_at`) Jobs uses. Department
  and location dropdowns are now one shared filter bar driving both blocks.
- **Candidates list: two-pane Active/Past layout to match Jobs & Requisitions.**
  Split the single candidate table into stacked "Active" (active, on_hold,
  interviewing, offer_extended) and "Past" (hired, rejected, inactive) panes, each
  with its own count badge, sortable columns, and pagination. Moved the search box
  up into the page header (next to the time filter) so it filters both panes; the
  status dropdown remains as a shared refine-filter and the Hiring Funnel stays on
  top as the summary overview. Completes the Jobs / Openings / Candidates
  consistency pass.
- **Jobs & Candidates: always show the Active/Past two-pane view, even when
  empty.** Removed the full-page "No jobs yet" / "No candidates yet" screens that
  replaced the whole layout at zero items. Both pages now always render the two
  panes (matching Openings), with empty panes showing a gentle "No active jobs
  yet" / "No past candidates yet" message. The header Add/New buttons remain the
  entry point for a first record.

## 2026-06-30

### Changed
- **Migrated all AI from Anthropic (Claude) to Google (Gemini).** Every AI call
  now routes through a single swappable wrapper (`src/lib/ai/llm.ts`) that maps
  the old Claude tier names to Gemini — Opus/Sonnet → Gemini 2.5 Pro, Haiku →
  Gemini 2.5 Flash. Covers JD generation, scoring/autopilot, sourcing/CV/PDF
  parsing, email drafting, the WhatsApp responder, the HR-case auto-answer, and
  the streaming copilot orchestrator + sub-agents (which now run a Gemini
  tool-loop instead of the Anthropic SDK). Driven by cost. Call sites are
  unchanged; the `@anthropic-ai/sdk` package is retained (unused) for rollback.
  New required env var: `GEMINI_API_KEY` (replaces `ANTHROPIC_API_KEY`). Privacy
  page now discloses Google's Gemini API as the AI data processor.
- **Sharper text contrast — brighter sidebar, darker body type.** Brightened the
  espresso sidebar's nav text and icons (inactive items + active/brand text toward
  near-white) so they stand out on the dark strip; darkened the platform's
  warm-neutral text ramp (headings → near-black #181310, body text darker) for
  crisper reading on the cream background; and amplified the dashboard
  view-selector labels (Home / Recruiter Dashboard / …) to a larger, semibold,
  darker style.
- **Approval chains page now groups chains by target type into foldable sections.**
  The `/admin/approvals` list was a flat mix of Requisition, Pipeline, and Offer
  chains; it now stacks three collapsible cards in a fixed order — Requisitions,
  then Pipelines (jobs), then Offers — each with a click-to-fold header and a count
  badge. Empty groups still show so the structure stays visible; chain rows keep
  their Edit/Archive actions and Catch-all/Archived tags, and the fallback-gap
  banners are unchanged. (`src/app/(dashboard)/admin/approvals/page.tsx`.)
- **Candidates hiring funnel now matches the Jobs/Requisitions card style.** Flipped
  the funnel cards so the count sits on top and the stage label below (like the
  Jobs and Requisitions summary cards), and re-tinted them by *position* instead
  of by meaning so the first five cards run the same warm sequence those pages use
  (sand → honey → sage → clay → stone); extra stages continue with blue-grey, then
  rose. Trade-off: Hired/Rejected no longer read green/red — colour now follows the
  card's slot for a consistent look. (`src/app/(dashboard)/candidates/page.tsx`.)

### Removed
- **Retired the duplicate "Job pipelines" page (`/req-jobs`).** It listed the same
  `jobs` table as the main Jobs board (`/jobs`), so it was redundant. The
  `/req-jobs` index now redirects to `/jobs` (old links/bookmarks still work), and
  the few in-app links that pointed at it (the job-detail "back" link, the
  post-delete redirect, and the intake confirmation email) now point to `/jobs`.
  The job-management detail view at `/req-jobs/[id]` and the `/api/req-jobs` API
  are unchanged. (`src/app/(dashboard)/req-jobs/page.tsx`,
  `src/components/req-jobs/JobDetail.tsx`, `src/app/api/intake/[token]/route.ts`.)

### Changed
- **A job can only be created from an approved requisition.** Closed the loophole
  that let approved/live jobs exist with no requisition behind them. Now every
  job-creation path requires a link to an **approved** requisition (opening):
  - `POST /api/req-jobs` rejects creation unless `link_opening_id` points to an
    org-owned, approved opening; the old inline "mint a seat per location" path
    is removed (it created unapproved headcount on the fly).
  - **New Job** on `/jobs` no longer opens the JD form directly — it first opens
    a chooser of the org's approved requisitions; picking one carries its
    title/department/location/comp/start-date into the form and links it.
  - **New version** (clone) now reuses the requisition the source job is linked
    to and requires it to have passed approval; `POST /api/req-jobs/:id/clone`
    enforces this server-side.

### Added
- **"No req" warning badge.** Jobs with no linked requisition are flagged — a
  banner on the job detail view and a small amber "No req" badge in the jobs
  list — so older req-less jobs are easy to spot and fix.
  (`src/app/(dashboard)/jobs/page.tsx`, `src/components/req-jobs/JobDetail.tsx`,
  `src/modules/ats/domain/job-pipelines.ts`.)

- **Rich-text fields: saved view now matches the editor (WYSIWYG).** Blank lines
  the author added (empty paragraphs) used to collapse to nothing once saved —
  the read-only renderer now gives them a one-line height so the spacing the
  author saw while typing is preserved. Also brought the saved view's heading
  weight (H1 now bold, not semibold) and paragraph/list spacing into lockstep
  with the editor so what you type is exactly what renders. Affects every place
  rich text is shown (job detail, intake, public apply). (`components/RichText.tsx`.)

## 2026-06-28

### Added
- **Candidates page: time filter + full-width search + responsive funnel.** Added
  a time filter (All time / 7d / 30d / 3m / custom range, by candidate
  created_at) mirroring the Jobs page; the search bar now stretches full-width;
  and the hiring-funnel stage cards flex to fill the available width (no more
  fixed-width cards with horizontal scroll). (`app/(dashboard)/candidates/page.tsx`.)
- **Pause / Resume for live jobs (reversible).** A live (`open`) job can now be
  **Paused** — it stops accepting new applicants (the public apply link freezes)
  and any live job-board postings go dark, but everything is preserved. **Resume**
  flips it back to `open` and revives the *same* apply link. New routes
  `POST /api/req-jobs/[id]/pause` and `/resume`; new `job.paused` / `job.resumed`
  webhook events. Pause/Resume buttons on the job detail page.
- **Edits to an approved job now re-trigger approval (formatting stays free).**
  When a job is approved/live/paused, changing the *wording* of the JD, key
  requirements, nice-to-haves, "what they'll do", or level no longer silently
  ships — it's diffed (formatting-blind) against the content the approval was
  granted on, and re-runs the approval workflow. Sole-approver orgs re-approve
  instantly and the job stays live; where a real approver exists, the job drops
  to `pending_approval` (off the market) until they sign off — and the engine
  notifies them. Pure formatting changes (bold/italic/bullets) pass through. The
  edit form shows an amber heads-up, and the save toast says what happened.
  (`lib/jobs/substance.ts`, `lib/jobs/reapproval.ts`.)
- **"New version" button (clone).** On an approved/live/paused/withdrawn job,
  **New version** spins off a fresh `draft` copy of the JD + intake content for a
  materially different role — re-approved separately, with its own apply link —
  instead of rewriting the approved spec in place. New route
  `POST /api/req-jobs/[id]/clone`.

### Schema
- **Migration 075** adds an `approved_snapshot` jsonb column to `jobs` — the
  formatting-normalized content (JD + key intake fields) the most recent approval
  was granted against. Captured on approval completion / intake approve; compared
  on edit to decide whether a change needs re-approval.
- **Migration 074** adds `paused` to the `jobs` status CHECK constraint and
  documents the new ladder: `open ⇄ paused` (reversible) vs. `open|paused →
  withdrawn` (terminal, link killed). `JobStatus` type + `jobUpdateSchema` enum
  updated to match.

### Changed
- **Candidates page: one set of cards, tinted by meaning; time filter moved to
  the header and now scopes the whole page.** Removed the top row of 4 summary
  stat cards (Total / Active / Interviewing / Hired) that duplicated the hiring
  funnel below it. The funnel cards now carry the warm tinted fill (one fixed,
  distinct colour per stage — sand / honey / clay / sage / blue-grey / stone /
  rose — so any subset you assemble via "Customise funnel" is always all-distinct
  and colour = meaning). The time filter was promoted from the filter row to the
  top-right of the page header and now scopes **both** the funnel and the list
  (via a shared `timeScoped` derivation), so the whole page reflects the chosen
  date range. (`app/(dashboard)/candidates/page.tsx`.)
- **Candidates hiring funnel now shows real data.** The funnel's stages were
  decorative labels (Sourced, Screened, Engaged, Offer Accepted, Offer Rolled
  Out, Onboarded) that mostly mapped to nothing, so most cards were stuck at 0.
  Re-pointed the stages at the real `CandidateStatus` values — default funnel is
  the forward journey **Active → Interviewing → Offer Extended → Hired**, with
  On Hold / Inactive / Rejected available to add via "Customise funnel". Each
  card now tallies straight from `candidate.status`, matching the Pipeline
  (Kanban) view. The per-browser funnel preference key was bumped (`_v2`) so any
  stale, now-invalid saved layout resets cleanly to the new default.
- **"Withdraw" is now terminal (a job killed for good), not a reversible pause.**
  Previously Withdraw took a job off the market but could be re-published — that
  reversible behaviour now lives in **Pause/Resume**. Withdraw now clears the job's
  `apply_token`, so the public application link dies permanently and cannot be
  revived, and it can be triggered from `open` *or* `paused`. The publish route no
  longer accepts `withdrawn → open` (only `approved → open`); the withdraw confirm
  dialog and status badge (now red) reflect the terminal meaning.
- Completes the **job-lifecycle redesign** (Phases 1–4): the Pause/Withdraw state
  model, locking the approved substance on live jobs, the formatting-blind
  word-change diff that re-triggers approval, and the "New version" clone flow.
- **List & data pages now fill the full page width.** Candidates, Settings, the
  approvals inbox & approval chains, permissions, the sequences list, sourcing,
  and the req-jobs list dropped their `max-w-*` width caps so they stretch across
  the whole content pane like Jobs & Requisitions. Previously several (candidates
  especially) were pinned to a narrow left column with wasted space on the right
  and a horizontal scroll. Forms, single-record detail, and document pages keep
  their readable capped width on purpose.
- **Lighter, distinct summary-card colours on the list pages.** The Jobs /
  Candidates / Requisitions summary tiles used "medium" warm tints that read
  heavy, and two hues repeated (sand on Total + Closed, near-identical
  amber/gold on Awaiting + Active). Softened every tint one notch and gave each
  card its own hue — sand · honey · sage · clay · stone — by lightening the four
  existing tones in `src/lib/ui/stat-tones.ts` and adding a new `stone` tone for
  the Closed card (Jobs + Openings now use it). No layout changes.
- **Discard is now reachable without scrolling when editing a job.** While the
  job edit form is open, "Save changes" and a "Discard" button appear in the top
  action bar (where "Edit" was), so you can back out instantly instead of
  scrolling to the bottom of the long form. The bottom Save/Discard buttons
  remain too.
- **Job description is now a rich-text field.** On the job detail edit form, "Job
  description" uses the same formatting editor (bold, lists, headings, links) as
  What they'll do / Key requirements / Nice to have, instead of a plain text box.
  Existing plain-text descriptions are converted to paragraphs on first edit so
  their structure is preserved, and the read view renders the formatting via
  `RichText`. The candidate apply page already rendered it richly, so formatting
  now flows end-to-end.
- **Summary stat cards now use a warm tinted treatment.** The cards atop Jobs,
  Candidates, and Requisitions moved from flat white tiles to soft, on-brand
  tints matched to each status (sand/neutral · amber waiting · pine ready · gold
  live/milestone), via a shared `lib/ui/stat-tones` helper. The selected filter
  (Candidates) keeps an espresso ring. Tints tuned ("Medium" strength) for clear
  contrast against the cream page background.

### Fixed
- **Customise-funnel "Save changes?" buttons stretched full-width.** The confirm
  dialog's three buttons used `flex-1` inside a full-width card, elongating them
  across the whole row. Capped the dialog width and let the buttons size to their
  text so it reads as a compact prompt.
- **Couldn't save JD edits on non-draft jobs ("Cannot edit a job with status
  '…'").** The job update validation schema (`jobUpdateSchema`) inherited
  `.default()` values from the create schema, so a PATCH that only sent
  `description` + `custom_fields` was silently re-injected with
  `department_id`/`confidentiality`/`hiring_team_id`. The route then saw those as
  edits to locked identity fields and rejected the whole save with a 409 — on
  approved, open, *and* withdrawn jobs. Rebuilt `jobUpdateSchema` as a plain
  partial with no defaults so omitted fields stay absent. Also stops draft edits
  from clobbering `hiring_team_id` to null.
- **Stat-card tints weren't rendering (Tailwind wasn't scanning `src/lib`).** The
  Tailwind `content` globs listed `src/pages`, `src/components`, and `src/app` but
  not `src/lib`, so arbitrary color classes defined in `lib/ui/stat-tones` were
  never generated — leaving most cards uncolored. Broadened the glob to
  `./src/**/*` so helper-defined classes are picked up.
- **Req-job status badge updates without a page refresh.** On the job detail page the
  status pill next to the title (and the status-driven action buttons) now re-read the
  job from the server right after an approval/submit/publish/withdraw, and again when
  you return to the tab — so it no longer lags behind the audit log showing the same
  change. The job is held in local state and refreshed via `GET /api/req-jobs/[id]`
  instead of relying on `router.refresh()` alone (which could leave the badge stale).

### Added
- **Preview the candidate application form.** The Application form tab has a new
  **Preview** button (next to Save form) that opens a full, on-brand preview of the
  apply page exactly as a candidate sees it — your company logo/colour/font, the JD
  sections, the always-collected built-in fields, and your custom questions. It uses
  your current unsaved edits and runs the conditional show/hide logic live (answer a
  controlling question and dependent questions appear). Nothing is submitted. The
  question renderer is now shared with the live apply page (`components/apply/
  screening-fields.tsx`) so the preview can never drift from the real form.
- **Copy an application form from another job.** The Application form tab now has a
  **"Copy from another job"** button (next to Add question / Add from library) that
  lists your other jobs and drops the chosen job's custom questions onto this form.
  Field ids are regenerated and conditional show/hide rules (`visible_when`) are
  re-pointed at the new ids so copied logic keeps working. Review and Save as usual.
- **Soft nudge before publishing a bare form.** Publishing a job whose application
  form has no custom questions now shows a confirmation — **"Add screening
  questions"** (jumps to the form tab) or **"Publish anyway"**. It guides without
  blocking; built-in fields (name, email, phone, LinkedIn, résumé, cover letter)
  are always collected regardless.
- **Set scoring criteria at the job level.** The weighted rubric the AI uses to
  judge candidates was only reachable inside a candidate's Scorecards tab — so on
  a job with no candidates yet there was no way to see or edit it. Added a
  **"Scoring criteria"** button in the job detail header next to **Autopilot**
  (and in the ⋯ More menu on narrow screens) that opens the same editor in a
  no-candidate mode, with a green dot when custom criteria are set. Saves through
  the existing `PATCH /api/req-jobs/[id]` (`custom_fields.scoring_criteria`); no
  backend change.
- **Edit the full job description from the job detail page.** The Overview edit
  form previously only exposed Title / Department / Confidentiality / a single
  "Internal context" box. It now lets you edit the complete JD — Level, Job
  description, "What they'll do", Key requirements, Nice to have (rich-text with
  bullets/bold), plus Target start date and Notes. Requirements/nice-to-have/JD
  are editable at any status, so the old jobs that lost their bullets can be fixed
  by re-pasting.

### Changed
- **Identity fields lock once a requisition is approved.** Title, Department,
  Confidentiality, Hiring manager and Location become read-only after a job leaves
  Draft (shown but not editable); the JD body and requirements/nice-to-have/level
  content stay editable. Editing is now available in `approved`/`open`/`withdrawn`
  states, not just `draft`. The `PATCH /api/req-jobs/[id]` route now treats the JD
  body (`description`) as editable at any status while keeping the other structural
  identity fields draft-only.
- Renamed the detail page's "Internal context" field to "Job description" (it was
  always the candidate-facing JD body, not internal notes).

### Fixed
- **Sidebar no longer "cuts off" on long pages.** The dashboard now uses an
  app-shell layout (Gmail/Linear/Notion pattern): the outer frame is fixed to one
  screen, the brown sidebar is a full-height fixed panel, and only the `<main>`
  content pane scrolls. Previously the sidebar was `h-screen` inside a
  `min-h-screen` flow, so on tall pages it ended after one viewport and showed bare
  background below. Changed the shell to `h-screen overflow-hidden` with the
  sidebar at `h-full`.

## 2026-06-26

### Fixed
- **Dashboard "Add widget" silently did nothing on a custom view.** Views and the
  "last active view" are stored under separate preference keys and could drift
  apart (e.g. an orphaned active-view id left over after a data wipe). The render
  layer tolerated the mismatch by falling back to the first view, but the
  add/remove/reorder handlers looked up the raw `activeViewId`, found nothing, and
  no-op'd — so the customizer looked editable but clicks did nothing. Handlers now
  target the resolved on-screen view, and a stale `activeViewId` is snapped back to
  the first view after hydration.

### Added
- **Job descriptions keep their formatting (bullets, bold) end-to-end.** The
  Team context / Key requirements / Nice-to-have fields were being flattened to
  plain text on save (via `stripHtml`), so pasted bullet lists rendered as
  spaced-out paragraphs and stray `&nbsp;` leaked through. They now store the
  editor's rich HTML and render it as formatted text — with real bullet markers
  — on both the internal job detail page and the public application page. New
  reusable `RichText` renderer sanitizes the HTML with DOMPurify before display
  (the apply page is public), and falls back to plain-text rendering for older
  records. The AI JD preview still receives stripped plain text, and the scorer
  is unaffected (it reads these fields as null for canonical jobs).

## 2026-06-25

### Added
- **Withdraw a posted job.** A live (Open) job can now be **Withdrawn** from its
  detail page — a new paused-but-revivable stage distinct from the terminal
  **Archive**. Withdrawing immediately makes every corresponding public
  application link defunct (the apply route and apply preview gate on
  `status = 'open'`) and switches off any live job-board postings. A withdrawn
  job can be **Re-published** (withdrawn → open), which reuses the original
  apply token so previously-shared links revive. Withdrawn jobs show under the
  **Past** block on the Jobs list. New endpoint `POST /api/req-jobs/[id]/withdraw`;
  publish endpoint now accepts re-publish from `withdrawn`. Emits a new
  `job.withdrawn` webhook.

### Schema
- **Migration 073** widens the `jobs.status` CHECK constraint to include
  `'withdrawn'`. Additive/idempotent; ladder is now
  draft → pending_approval → approved → open → (withdrawn ⇄ open) → closed/archived.

### Changed
- **Requisitions and Jobs pages now split into "Active" and "Past" blocks.** Each
  page previously had a single table filtered by clickable stat cards. Both now
  show two clearly separated, self-contained blocks — each with **its own search
  bar** — an **Active** block (in-flight work) on top and a **Past** block
  (terminal records) below, with accentuated borders. On Requisitions, Active =
  Draft/Pending/Approved/Open and Past = Filled/Closed/Archived; both blocks share
  the same simple table. On Jobs, Active keeps the full-featured table
  (drag-reorder, customizable columns, time + per-column filters, search) while
  Past is a simple closed/archived list with its own search. Stat cards on both
  pages are now a static at-a-glance overview (no longer click-to-filter); in-table
  status filtering on Jobs remains via the column-header filter.
  (`app/(dashboard)/openings/page.tsx`, `app/(dashboard)/jobs/page.tsx`.)
- **Rebrand polish — new logo mark + on-brand onboarding banner.** New
  RecruiterStack mark (`BrandMark`): a layered "stack" glyph in a warm cream tile,
  replacing the green lightning bolt in the sidebar (desktop + mobile); wordmark
  now emphasises "Stack". The "Finish setting up RecruiterStack" banner is
  re-skinned off green — espresso rocket tile + progress bar, a purpose-built icon
  per setup task (departments → building, locations → pin, approvals → shield/
  branch, requisition → clipboard, job → briefcase, teammate → person, calendar),
  and an espresso "done" tick instead of the green checkbox. Removed the throwaway
  `/brand-lab` and `/logo-lab` preview routes.
- **Platform rebrand — Stage 2: card consolidation.** Unified every "card"
  surface onto one shared system to remove the scattered, inconsistent-card look.
  The `Card` component gained variants (flat default / elevated / interactive /
  ghost) plus `Panel` (boxed surface + header bar) and `Section` (headed region,
  no box). Reusable `StatsCard` and `MatchCard` now route through it; the list
  pages (Requisitions, Jobs, Candidates) got uniform flat stat tiles (pine ring
  for the active filter) and flattened table surfaces; candidate detail tabs
  (Activities, History, Funnel, Emails, Forms, Referrals) and `WhatsAppCard`
  moved off inline `rounded-* border bg-white` wrappers onto `<Card>`/`<Panel>`
  (shadows dropped for a flat look); and the dashboard's category accents and
  overview cards were neutralized to a calm, uniform look. Surface-only — inner
  content, colors, and behavior unchanged.
### Fixed
- **Dashboard "Active Jobs" widget counted archived/closed jobs.** The
  `top_jobs` list in `/api/dashboard` sliced the first 6 jobs with no status
  filter, so archived and closed roles still showed as active. Now excludes
  `archived` and `closed` before building the list.
- **Stop stranding members on "Set up your workspace."** When a signed-in user's
  Clerk session had no *active* organization selected (e.g. after a token
  refresh, a new device, or a transient Clerk blip), `OrgGate` redirected them to
  `/org-setup` even though they were a member of an org with all their data
  intact. It now checks the user's memberships first and silently re-activates
  their workspace (`setActive`), only redirecting when they genuinely belong to
  zero orgs. Also, the server fallback `lookupOrgId` (`lib/auth.ts`) no longer
  treats a *failed* Clerk API call as "no membership" — it logs the failure so a
  transient outage is diagnosable rather than silently looking like an absence.
  (`components/OrgGate.tsx`, `lib/auth.ts`.)

### Added
- **Publish JD — Phase 3e: EEO / voluntary compliance reporting.** A new
  **EEO report** page (`/analytics/eeo`) shows anonymous, aggregate counts of the
  voluntary disclosures candidates give on the apply form — response rate plus a
  bar breakdown per question. The figures are **counts only, with no link to any
  candidate, application, or job**, so demographic data can never be tied back to
  a person or sway a hiring decision. It sits behind a brand-new **Compliance ·
  View** permission (`compliance:view`) — separate from the recruiting and
  analytics permissions, so the hiring team can't see it; workspace owners get it
  by default, and it shows up automatically as a new row in the Team & Permissions
  grid. Reached via a permission-gated "EEO report" link on the Analytics page.
  (`lib/permissions.ts`, `modules/ats/domain/reporting.ts`,
  `app/api/analytics/eeo/route.ts`, `app/(dashboard)/analytics/eeo/page.tsx`,
  `app/(dashboard)/analytics/page.tsx`.)
- **Publish JD — Phase 3d: conditional questions (show/hide based on an earlier
  answer).** In the **Application form** builder, any question can now be set to
  appear only when an earlier yes-no / choice question was answered a certain way
  (a new "Only show this question based on an earlier answer" rule:
  controlling question → *is / is not* → value). On the public apply page,
  conditional questions stay hidden until their controlling answer matches, and
  hidden questions are skipped for required-answer and knockout checks — both in
  the browser and re-checked server-side, so a candidate can't be blocked or
  knocked out by a question they never saw. The apply preview now returns each
  field's visibility rule (knockout rules still stay server-only).
  (`components/req-jobs/ScreeningTab.tsx`, `app/apply/[token]/page.tsx`,
  `app/api/apply/route.ts`, `modules/ats/domain/screening.ts`,
  `modules/ats/domain/job-pipelines.ts`.)
- **Publish JD — Phase 3c: candidates can answer screening questions, and
  knockout rules fire.** The public apply page (`/apply/[token]`) now renders a
  job's custom questions under an **"Additional questions"** section, with the
  right input for each field type (short/long text, yes-no, single/multiple
  choice, number, date, URL; file-type asks for a link for now) and a
  **"voluntary"** tag on EEO questions. Required questions are enforced before
  submit. When a candidate gives a **disqualifying answer**, the application is
  silently saved as **rejected** and skipped by AI scoring — the candidate still
  sees the normal success screen. **EEO answers** are stored in a separate hidden
  bucket, and knockout/conditional rules are never exposed to the candidate (the
  apply preview returns a public-safe field shape). The apply API re-loads the
  form server-side to attach labels, evaluate knockouts, and split EEO answers.
  (`app/apply/[token]/page.tsx`, `app/api/apply/route.ts`,
  `modules/ats/domain/job-pipelines.ts`, `modules/ats/domain/applications.ts`,
  `modules/ats/domain/screening.ts`, `lib/validations/applications.ts`.)

### Changed
- **Platform rebrand — "Warm Confident" (Direction D), Stage 1: foundations.** A
  brand overhaul of the in-app platform (not the marketing site). Redefined the
  Tailwind `emerald` scale as a pine green (brand accent → `#15604a`) and the
  `slate` scale as a warm sand→bark neutral ramp, so the whole app re-skins from
  `tailwind.config.ts` without per-file edits. Page background is now warm cream
  (`#faf7f2`); headings use a new display font (Plus Jakarta Sans, loaded as
  `--font-display` and applied to h1–h4); body stays Inter. The sidebar (desktop
  rail + mobile drawer) is now espresso (`#221b14`) with light-on-dark nav. A
  throwaway preview of all directions lives at `/brand-lab`.
  (`tailwind.config.ts`, `globals.css`, `layout.tsx`,
  `components/layout/Sidebar.tsx`.) Stage 2 (card consolidation) is next.
- **Platform rebrand — Stage 1b: single-accent palette.** Followed the
  foundations by collapsing the app's competing accent colors onto one brand
  color. Stray non-token greens (`green-*`/`teal-*` + hardcoded `#10b981` etc.)
  and cool grays (`gray-*`/`zinc-*`) were folded into pine/warm-slate; then the
  whole "rainbow" of decorative accents (`blue` — 400+ uses — plus `indigo`,
  `sky`, `violet`, `purple`, `cyan`, `pink`) was demoted to warm neutral across
  64 in-platform files. Pine is now the sole accent (primary actions, active
  states, positive statuses); only amber (warning) and red (danger) remain as
  semantic colors. Avatars and the score scale keep their colors on purpose.
  Public/marketing pages, emails, and `/brand-lab` were left out of scope.
- **Platform rebrand — Stage 1c: espresso action buttons.** Recolored the solid
  pine buttons to the sidebar's espresso brown (`#221b14`, hover `#33271b`) so
  the platform reads as a two-tone system: espresso = primary action, pine =
  accent / positive state. Only genuine buttons changed (filtered on the
  interactive hover state), so checkmarks, step indicators, status dots, the
  sidebar logo, and outline/text accents stay pine. Shared `Button` primary
  variant + ~40 in-platform files; marketing pages left out of scope.

## 2026-06-24

### Added
- **Publish JD — Phase 3b: recruiter application-form builder.** Job detail pages
  now have an **"Application form"** tab where recruiters build the questions a
  candidate answers when applying. Add, reorder, and delete questions; choose a
  field type (short/long text, yes-no, single/multi choice, number, date, file,
  URL); edit choices; mark a question required or EEO/voluntary (hidden from the
  hiring team); and set a knockout rule that will auto-disqualify on a given
  answer. "Add from library" reuses saved questions and the bookmark icon saves a
  question back to the org's library for reuse. New API routes
  (`/api/screening/questions`, `/api/screening/questions/[id]`,
  `/api/jobs/[id]/screening`) guarded by `recruiting:view`/`recruiting:edit`; the
  per-job form is stored on `jobs.custom_fields.screening`. Candidates don't see
  the form yet — rendering + knockout evaluation on the apply page land in 3c.
  (`components/req-jobs/ScreeningTab.tsx`, `components/req-jobs/JobDetail.tsx`.)
- **Publish JD — Phase 3a: screening-questions foundations (Ashby parity).**
  Backend groundwork for a real application-form builder: a reusable, org-scoped
  question library, an org default form template that new jobs inherit (with
  per-job overrides stored on `jobs.custom_fields.screening`), and answer storage
  on `applications`. Includes shared types (`database.ts`), Zod schemas
  (`lib/validations/screening.ts`), and a domain facade
  (`modules/ats/domain/screening.ts`) with library CRUD, template/per-job
  get-save (inherit-then-override), knockout evaluation, and EEO-answer
  partitioning. No UI wired yet — recruiter builder and candidate apply land in
  3b/3c.
- **Publish JD — Phase 2c: the apply page now inherits the company's branding.**
  The public application page (`/apply/[token]`) renders on-brand — the company's
  logo and name in the header (falling back to the RecruiterStack mark when unset),
  the brand color on the Submit button, and the chosen font across the page — so a
  candidate arriving from the careers page stays in one consistent look. Branding
  is independent of the careers-page public toggle (that gates only the listing
  page). The apply preview API now returns a `branding` object alongside the job
  (`getCanonicalApplyJobPreview` reads `org_settings`). (`app/apply/[token]/page.tsx`,
  `modules/ats/domain/job-pipelines.ts`.)
- **Publish JD — Phase 2b: the public branded careers page.** Each org with a
  public careers page now has a live page at `recruiterstack.in/careers/<slug>`
  that resolves the org by its slug, renders the saved branding (logo, hero image,
  brand color, font, tagline, About) and lists every open job with department and
  location, each linking straight to its existing apply page. Hidden unless the
  admin has switched the page on (`careers_public = true`); a toggled-off or
  unknown slug returns a 404. The route is public (added to the Clerk matchers in
  `middleware.ts`) and reads through a new `getCareersPageBySlug` domain function.
  (`app/careers/[slug]/page.tsx`, `modules/ats/domain/job-pipelines.ts`,
  `middleware.ts`.)
- **Publish JD — Phase 2a: "Careers page" branding settings.** Admins can now set
  up a branded public careers page from **Settings → Workspace → Careers page**: a
  unique page address (slug at `recruiterstack.in/careers/<slug>`, auto-suggested
  from the company name, validated for format/reserved words/uniqueness), logo and
  hero-image uploads, primary + accent colors, a font choice, a tagline, an About
  blurb, and a public on/off toggle with a preview link. This is the admin/config
  half — the public page itself and apply-page branding land in Phases 2b/2c.
  Branding image uploads go through a new admin-only route
  (`/api/org-settings/branding-upload`) into a public `company-assets` storage
  bucket. (`components/settings/CareersPageCard.tsx`,
  `app/api/org-settings/branding-upload/route.ts`, `app/api/org-settings/route.ts`,
  `app/api/org-settings/company/route.ts`, `lib/validations/org-settings.ts`.)
- **Cross-link the job's Kanban and detail views.** Once a job is published it
  routes to the Kanban (`/jobs/[id]`), which previously stranded the detail view
  (`/req-jobs/[id]`) — JD, approvals, audit log. The Kanban top bar now has a
  **Details** button (next to "Jobs") that opens that view, and the detail view
  shows a **View pipeline** button once the job is live, so you can move between
  working candidates and the requisition record either way. Routing itself is
  unchanged (`app/(dashboard)/jobs/[id]/page.tsx`, `components/req-jobs/JobDetail.tsx`).

- **Publish JD — Phase 1: the JD details you fill in at job creation now actually
  show up.** Fields like "What they'll do" (team context), "Key requirements" and
  "Nice to have" were collected at creation but stashed in
  `custom_fields.intake` and never rendered anywhere. They are now displayed as
  proper sections on **both** surfaces: the public **apply page**
  (`/apply/[token]` — About the role / What you'll do / What we're looking for /
  Nice to have, with the old truncating scroll box removed) and the internal
  **job detail Overview** (`/req-jobs/[id]` — same sections plus Level, Target
  companies and Notes, which stay internal-only). Display-only; no schema change.
  Sensitive intake (hiring-manager contact, budget) is never shown publicly.
  (`modules/ats/domain/job-pipelines.ts`, `app/apply/[token]/page.tsx`,
  `components/req-jobs/JobDetail.tsx`.) Plan + market research in
  `docs/strategy/06-publish-jd-plan.md`; Phases 2 (branded career page) and 3
  (screening questions) are scoped there for later sessions.
- **Approvals page now has a Pending pane + a History pane.** The page previously
  showed only your pending decisions and was empty once you'd cleared them. It now
  has two stacked sections: a **collapsible "Pending decisions"** pane (your
  personal to-dos, each with the Decide button — unchanged behaviour, just
  foldable with a count) and a static **"History"** table below it listing every
  approval **you've acted on**, newest first, with columns for Type, Title,
  Status, Your decision, Requested by, and Decided date — plus **search + Status +
  Type filters**. New endpoint `GET /api/approvals/history` returns the current
  user's decided approvals (`app/(dashboard)/approvals/inbox/page.tsx`,
  `app/api/approvals/history/route.ts`). An org-wide admin view of *all*
  approvals is intentionally deferred.

### Changed
- **Job Audit Log now includes the linked requisition's full history.** A job's
  audit log (`/req-jobs/[id]`) only showed events from after the requisition was
  approved (the job entity doesn't exist before that), hiding who requested and
  approved the requisition. `GET /api/audit-log` now, for a job target, also
  folds in its linked requisition(s)' `approval_audit_log` rows (found via
  `job_openings`) and synthesizes the **"created"** events (creator/requester)
  that aren't written to the audit table — for both the requisition and the job.
  Rows are merged chronologically and tagged with their entity; `AuditLogTab.tsx`
  shows a coloured **Requisition / Job** badge per row (only when the timeline
  spans both) and now renders the decision on a step. So the log reads end-to-end:
  requisition created → submitted → approved → job created → submitted → opened,
  with requester and approver names throughout.

### Fixed
- **Approvals inbox showed the bare word "job" instead of the job's name.** The
  inbox API (`/api/approvals/inbox`) only ever looked up titles for requisitions
  (`openings`); for a job target it fell back to printing the literal target type,
  and the "title" link always pointed at `/openings/[id]` (a broken link for a
  job). The inbox now hydrates **job** titles from the `jobs` table too, links each
  card to the correct detail page (`/req-jobs/[id]` for jobs, `/openings/[id]` for
  requisitions), and shows a type label ("Job posting" / "Requisition") plus
  **who requested** the approval (`app/api/approvals/inbox/route.ts`,
  `app/(dashboard)/approvals/inbox/page.tsx`). Email/Slack/bell notifications were
  already detailed and are unchanged.

## 2026-06-23

### Added
- **Edit a job after it's created (Draft only).** The job detail page
  (`/req-jobs/[id]`) now has an **Edit** button next to Submit/Archive that shows
  only while the job is a Draft. Clicking it flips the Overview card into an inline
  edit form for Title, Department, Internal context, and Confidentiality; Save
  PATCHes `/api/req-jobs/[id]` and refreshes. The draft-only lock matches the
  backend, which rejects structural edits once a job leaves Draft
  (`components/req-jobs/JobDetail.tsx`; the page now also fetches the full
  department list for the picker in `app/(dashboard)/req-jobs/[id]/page.tsx`).
- **Target Start Date in the New Job drawer now has a calendar picker.** The
  field stays free-text (so "ASAP" / "Q2 2026" still work), but a calendar icon
  on the right opens the browser's native date picker for users who'd rather
  click a date than type it; picking one fills the field with the date
  (`app/(dashboard)/jobs/page.tsx`). Implemented as a transparent `input[type=date]`
  overlaid on the icon — no new dependency.

### Changed
- **New Job drawer: Team & Requirements fields are now rich-text (Gmail-style).**
  "What does this person do on the team?", "Key Requirements" and "Nice to Have"
  were plain textareas; they now use the shared `RichTextEditor` (Tiptap) with a
  bold/italic/underline/lists/headings/align/link toolbar
  (`app/(dashboard)/jobs/page.tsx`). The HTML is stripped back to clean text
  before it's sent to the AI JD generator and before it's stored in the job's
  `custom_fields.intake`, so nothing downstream (the AI prompt, the hiring-manager
  intake form) ever sees raw tags. "Import from PDF/TXT" now inserts the extracted
  text into the live editor. The JD box and Additional notes stay plain text (the
  JD is AI-generated markdown rendered as plain text on the job page).

### Fixed
- **Target start date now carries from an approved requisition into Create JD.**
  The "Create job & write JD" handoff prefilled title/department/location/comp/HM
  but silently dropped the requisition's `target_start_date`, so the JD drawer's
  start-date field (and the generated JD) always came up blank. The date is now
  threaded end-to-end: added to the handoff URL in
  `components/openings/OpeningDetail.tsx`, to the `FromOpening` type + URL parse +
  `startDate` initial state in `app/(dashboard)/jobs/page.tsx`. The JD-generation
  payload, API route, and generator already accepted it — only the client handoff
  was missing.

### Added
- **Push an approved requisition straight into JD creation.** An approved
  requisition (`/openings/[id]`) now shows a "Create job & write JD" button that
  opens the New Job drawer pre-filled from the requisition (title, department,
  location, comp, hiring manager) in "fill everything myself" mode, so the user
  lands directly on the JD-writing step. On save the new job is **linked to the
  existing approved requisition** (via a new `link_opening_id` on
  `POST /api/req-jobs`) instead of minting duplicate headcount — keeping seat
  counts accurate. Touches `components/openings/OpeningDetail.tsx`,
  `app/(dashboard)/jobs/page.tsx` (New Job drawer `fromOpening` prefill + linked
  note in place of the seats editor), `lib/validations/jobs.ts`, and
  `app/api/req-jobs/route.ts`.

### Added
- **Decide on an approval straight from the requisition/job detail page.**
  Previously the only place to approve/reject was the Approvals inbox; the
  detail page's Approval card just showed read-only progress. The card
  (`components/approvals/ApprovalProgress.tsx`) now also checks the current
  user's inbox and, when they're the pending approver for this approval, shows
  an "Approve / Reject" button that opens the existing `DecisionModal`. On a
  decision it refreshes the card and the page (status badge, Cancel button). Used
  by both `OpeningDetail` and `JobDetail`, so it works for requisitions and jobs.

### Added
- **Approval requests now ring the in-app bell + show a sidebar count.** Approval
  steps already emailed/Slacked the approver, but never created an in-app
  notification, so a pending decision was easy to miss. `notifyStepActivated`
  now also creates an `approval_requested` bell notification for each approver
  (links to `/approvals/inbox`), and the requester gets `approval_decided` /
  `approval_completed` notifications when steps are decided/finished
  (`lib/approvals/notifications.ts`, new types in `lib/api/notify.ts`, icons +
  routing in `components/notifications/NotificationBell.tsx`). The sidebar
  **Approvals** item now shows a red count badge of decisions waiting on you
  (polled from `/api/approvals/inbox` every 60s), plus a small dot on the Admin
  bucket when the flyout is collapsed (`components/layout/Sidebar.tsx`).

### Added
- **First-run "Getting started" checklist on the dashboard.** A self-hiding
  banner (`components/onboarding/GettingStartedBanner.tsx`) guides the
  operational setup the signup wizard skips — and whose gaps stop a job from
  going live: create departments, add locations, approval chains for
  requisitions *and* jobs, first requisition, first published job, invite a
  teammate (org-wide, admins only), and connect your calendar (personal). Steps
  **auto-tick** from live data — no manual check-off — via a new
  `GET /api/onboarding/checklist` that reads real signals (departments,
  locations, `approval_chains` per target, `openings`, open `jobs`,
  `org_members`, `user_integrations`). Each still-open step also raises one
  notification nudge (`?sync=1`), routed to the right audience, deduped, and
  auto-cleared once done; the bell links each nudge to the right setup screen.
  Detection logic split into a client-safe `lib/onboarding/checklist-steps.ts`
  (with unit tests) and a server-only `lib/onboarding/checklist.ts`. Settings now
  honours `?tab=` so each step deep-links to the correct tab. (Note: "connect
  email" was dropped — the app sends candidate email via SendGrid and only
  connects calendars per user, so it could never tick.)

### Changed
- **Requisitions list now matches the Jobs page visually.** The Requisitions
  list (`(dashboard)/openings/page.tsx`) was restyled to be consistent with the
  Jobs list: the status-count chip strip was replaced with the same five colored
  stat-cards (Total / Awaiting Approval / Approved / Open / Closed) that filter
  the table on click, status pills now use the Jobs-style icon + colored badge
  via a shared `STATUS_CONFIG`, the header/"New requisition" button adopt the
  Jobs styling, and the table gained matching row hover, a dashed empty state,
  and a "Showing N of M" footer. Cards bucket all seven statuses so each stays
  reachable; the seven-status filter is preserved.

### Added
- **Requisitions has its own sidebar nav home + a status summary.** Requisitions
  were only reachable via a button in the Jobs header, which made them feel
  second-class and confused users about Jobs vs Requisitions. Added a
  **Requisitions** item to the Recruiting nav flyout (above Jobs, since a
  requisition is upstream of a job pipeline; `components/layout/Sidebar.tsx`).
  The list page (`(dashboard)/openings/page.tsx`) now shows a clickable
  status-count strip ("All · N", "open · 3", …) that doubles as the status
  filter; status filtering moved client-side so the counts stay stable.

### Changed
- **Settings → Departments list is now collapsible.** The flat stack of every
  department made the Workspace settings page long. Active departments are now
  folded into a collapsible "Active departments (N)" group with a click-to-
  expand header, and any archived departments sit in their own "Archived (M)"
  group; both default to collapsed (`components/settings/DepartmentsCard.tsx`).

### Added
- **Department field on the New Requisition form is now an autocomplete.**
  Replaced the static department dropdown with a typeahead combobox
  (`components/openings/DepartmentCombobox.tsx`): type to filter the org's
  departments, and if the typed name doesn't exist an "Add '<name>'" row creates
  it inline (`POST /api/departments`, admin-only) and selects it. Wired into
  `NewOpeningForm.tsx` (the now-unused `depts` fetch/state removed). Supports
  keyboard nav (↑/↓/Enter/Esc) and a clear button.

### Fixed
- **Approval chains list now reads "Requisition", not "Opening."** A leftover
  from the 2026-06-22 rename: each chain row printed the raw `target_type`
  (`opening`) instead of the display label, so the list still showed "Opening".
  It now uses the `TARGET_LABEL` map like the rest of the page
  (`admin/approvals/page.tsx`).

### Added
- **Visible "Edit" button on each approval-chain row.** The chain editor already
  existed (`/admin/approvals/[id]`) and the whole card was a link to it, but with
  no obvious affordance it looked un-editable. Added an explicit Edit button per
  row; it bubbles the click up to the existing row link, so it opens the same
  editor (`admin/approvals/page.tsx`).

## 2026-06-22

### Changed
- **Renamed "Openings" to "Requisitions" across the UI.** The recruiting object
  was labelled "Openings" in some places and conceptually overlapped with "Jobs"
  in users' minds. All user-facing display text now reads "Requisitions" — the
  Jobs-board header button, the requisitions list/new/detail pages
  (`(dashboard)/openings/*`), the linked-requisitions panel and link dialog on
  the pipeline detail (`req-jobs/JobDetail.tsx`, `req-jobs/LinkOpeningDialog.tsx`),
  the job-pipelines list copy (`req-jobs/page.tsx`), the approval-chain target
  label and builder (`admin/approvals/page.tsx`, `approvals/ChainBuilder.tsx`),
  and the Settings cards (Locations, Comp bands, Departments, Custom fields).
  URLs (`/openings`), routes, API endpoints, database tables, and code
  identifiers are unchanged — this is a display-text-only rename. The public
  hiring-manager intake form's "Number of Openings" field was intentionally left
  as-is (it reads as plain-English headcount, not the product object).
- **Pre-open jobs open in the management view, not the Kanban.** Clicking a job
  on the board now routes draft / pending-approval / approved jobs to the
  requisition management view (`/req-jobs/[id]`) and only sends open / posted /
  closed jobs to the Kanban pipeline (`/jobs/[id]`), so you manage a job before
  it goes live and work candidates once it's open.

### Schema
- **072_screening_questions.sql** — screening / application-form builder
  foundations. Adds `screening_questions` (org-scoped reusable question library:
  field type, choices, `is_eeo`, archive) and `screening_form_templates` (one row
  per org — the default form new jobs inherit), plus three additive columns on
  `applications`: `screening_answers`, `eeo_answers` (hidden compliance bucket),
  and `knockout_failed`. Per-job forms live on `jobs.custom_fields.screening`. RLS
  on with the service-role policy; additive, idempotent, reversible.
- **071_careers_branding.sql** — adds branded-careers-page columns to
  `org_settings` (`careers_slug`, `careers_public`, `logo_url`, `hero_image_url`,
  `brand_color`, `accent_color`, `brand_font`, `tagline`, `about`), a partial
  unique index on `lower(careers_slug)` so slugs are unique and case-insensitive,
  and a public `company-assets` storage bucket for logo/hero images. Additive,
  idempotent, reversible.

## 2026-06-21

### Changed
- **Public apply link now exists only when a job is open.** Previously every
  canonical job got an `apply_token` at creation (migration 068), so a
  draft/pending/approved job had a shareable apply URL that looked valid but
  accepted no applicants (the apply POST already gated on `status = 'open'`).
  Now the token is minted only when the job reaches `open`, the "Copy Apply
  Link" button is hidden until then (`jobs/[id]/page.tsx`), the job-detail API
  no longer returns the token for non-open jobs, and the public apply preview
  treats any non-open job as "not found" instead of showing a fillable form
  (`modules/ats/domain/job-pipelines.ts`).

### Schema
- **070_apply_token_only_when_open.sql** — `jobs.apply_token` trigger now mints
  the token only when `status = 'open'` (fires on INSERT *and* UPDATE so it's
  generated at the moment a job opens). Backfill nulls tokens for pre-open jobs
  (draft/pending_approval/approved) and ensures open jobs have one.

## 2026-06-20

### Fixed
- **Jobs board — a job deleted in the DB could linger on the board.** The list
  response (`GET /api/jobs`) set no cache header, so a stale cached copy could
  survive a refresh and keep showing a row that no longer exists in `jobs`
  (clicking it then 404s, since the detail read is live). The list response now
  sends `Cache-Control: no-store` and the board's client fetch uses
  `cache: 'no-store'`, mirroring the detail route — every board load is fresh.
- **Job detail — server errors no longer masquerade as "Job not found."**
  `GET /api/jobs/[id]` caught *every* failure from the board-detail read and
  returned a 404, so a real query error (e.g. a missing `jobs.apply_token` column
  when migration 068 hasn't been applied to the database) showed up as a deleted /
  nonexistent job. Genuine query failures now surface as a 500 with the error
  message; only an actually-missing row returns 404. This is why a job could show
  on the board list (whose SELECT omits `apply_token`) yet 404 on its detail page
  (whose SELECT includes it).

## 2026-06-19

### Added
- **New Job form now persists everything — incl. multi-location openings.** The
  "Fill Everything Myself" flow previously discarded every field except the title
  on create. It now posts the full payload to `/api/req-jobs`: the JD
  (`description`), department (find-or-create by name), comp range, and a
  per-location **openings repeater** ("Add another location", seats per location).
  The backend find-or-creates departments + locations by name, creates one opening
  per seat, and links them to the job via `job_openings`. Remaining intake fields
  (level, HM details, requirements, target companies) are stashed in the job's
  `custom_fields.intake` so nothing typed is lost.

### Fixed
- **Apply link — "Copy apply link" silently did nothing.** After the canonical
  cutover the board mapper hard-coded `apply_link_token: null`, so the copy button
  bailed. The real `jobs.apply_token` is now threaded through the board SELECTs and
  mapper.
- **JD generation — manual fallback.** When AI JD generation fails (or after a
  successful generate), a "Write manually instead" button now lets the user drop
  into the editable JD textarea instead of being stuck.

### Changed
- **Single job-creation front door.** There were two divergent "new job" forms:
  the rich drawer on `/jobs` and a bare-bones `/req-jobs/new` "New pipeline" form.
  `/req-jobs/new` now redirects to `/jobs?new` (which auto-opens the rich
  drawer), the `/req-jobs` list "New pipeline" links point there too, and the
  unused `NewJobForm` component was removed.
- **Archived jobs no longer linger on the board.** DELETE is a soft-archive
  (`status='archived'`); the board list now filters those out, so a deleted job
  disappears from `/jobs` instead of showing as a ghost row that 404s on click.
- **Nav — Openings folded into Jobs (single recruiting-pipeline entry).** Dropped
  the standalone "Openings" sidebar item; the Recruiting bucket is now Jobs ·
  Candidates · Sourcing · Sequences · Inbox. Openings (requisitions) stay fully
  available via an "Openings" link in the Jobs page header. Completes the nav
  roadmap's Phase-3 target (Greenhouse-style single Jobs object) now that jobs are
  canonical and candidate-bearing.

### Removed
- **Legacy `hiring_requests` cutover (Phase 3 / C6).** Deleted the legacy CRUD
  routes (`/api/hiring-requests`, `.../[id]`) and the legacy UI
  (`/hiring-requests` list, `new`, `[id]`). Removed the now-dead legacy domain
  functions from `src/modules/ats/domain/`: in `job-pipelines.ts` —
  `createLegacyJobAndPipeline`, `createLegacyIntakeRequest`,
  `listLegacyJobPipelineSummaries`, `getLegacyJobPipelineDetail`,
  `getLegacyJobScoringContext`, `getLegacyCandidateJobContext`,
  `getLegacyApplyJobByToken`, `getLegacyApplyJobPreview`, `activateLegacyApplyJob`,
  `getLegacyJobById`, `updateLegacyJob`, `getFirstLegacyPipelineStage`,
  `listLegacyJobsForAgent`, `findLegacyJobsForAgent`, `countLegacyJobs`,
  `listLegacyPipelineStagesForJob`, the `listCanonicalJobPipelines` /
  `getCanonicalJobPipeline` union helpers, and the now-unused Legacy* types; in
  `reporting.ts` — `fetchLegacyDashboardInputs` / `fetchLegacyPipelineExportInputs`;
  in `applications.ts` — `getApplicationHiringRequestId`. Kept `getLegacyJobTokens`
  (still called by `getApplicationJobTokens`) and `fetchLegacyAnalyticsInputs`
  (still called by the copilot analytics tool).

### Changed
- **"New job" flow → canonical create (Phase 3 / C6).** The Jobs page "new job"
  drawer now POSTs to canonical `/api/req-jobs` (`{ title }`) and navigates to
  `/req-jobs/:id` on success, replacing the legacy `/api/hiring-requests` intake
  POST and the dead ticket-number/intake-URL success UI. The intake submit
  notification's "View in Dashboard" link now points to `/req-jobs`.
- **Drift-guard allowlist emptied (Phase 3 / C6).** Removed the 2 hiring-requests
  + 3 intake entries from `LEGACY_ALLOWLIST` in `scripts/audit-canonical-model.mjs`;
  the audit now reports 0 legacy / 0 mixed / 0 adapter files.
- **HM intake flow → canonical jobs (Phase 3 / C5.5).** The hiring-manager intake
  routes now operate on canonical `jobs` keyed by `jobs.intake_token` instead of
  legacy `hiring_requests`: `GET/POST /api/intake/[token]`, `.../generate-jd`, and
  `.../approve`. An intake is a canonical job — intake-pending = `draft`, the
  AI-generated JD lands in `jobs.description`, structured intake fields + HM
  name/email live in `jobs.custom_fields.intake`, and submit/approve flips the job
  to `open` (apply-ready via the migration-068 apply_token). New domain helpers in
  `src/modules/ats/domain/job-pipelines.ts`:
  `getCanonicalIntakeJobByToken` / `getCanonicalIntakeJobFull` /
  `submitCanonicalIntakeJob` / `setCanonicalIntakeJobJd` /
  `approveCanonicalIntakeJob`. AI JD generation, validation, notifications, and
  response shapes are preserved. Legacy intake code is untouched (cutover is C6).

### Schema
- **069_jobs_intake_token.sql.** Adds `jobs.intake_token TEXT UNIQUE` + a
  `BEFORE INSERT` trigger `set_job_intake_token` (auto-generates when null) +
  backfill, mirroring the migration-068 apply_token. Additive, idempotent,
  reversible.

### Changed
- **Copilot job tools → canonical jobs (Phase 3 / C5).** The agent job tools in
  `src/lib/copilot-tools.ts` now read the canonical `jobs` spine instead of
  legacy `hiring_requests`: `list_jobs` uses `listCanonicalJobBoardSummaries`,
  `get_job_pipeline` resolves via the new `findCanonicalJobsForAgent` then reads
  `getCanonicalJobBoardDetail`, and `get_dashboard_stats` job count uses the new
  `countCanonicalJobs`. Agent-facing return-string formats are unchanged. New
  canonical lookup helpers `findCanonicalJobsForAgent` / `countCanonicalJobs`
  added to `job-pipelines.ts`; legacy reads left intact (cutover is C6).

## 2026-06-18

### Added
- **Public apply → canonical jobs (Phase 3 / C3).** The public `/api/apply`
  route (GET preview + POST submit) now resolves the apply token against
  canonical `jobs` via `jobs.apply_token`, gates on `status = 'open'`, seeds the
  candidacy at the job's first canonical pipeline stage (`getFirstJobStage`), and
  creates the application anchored on `job_id` (no `hiring_request_id`). New
  domain helpers `getCanonicalApplyJobByToken` / `getCanonicalApplyJobPreview` in
  `job-pipelines.ts`. Legacy paths left intact (cutover is C6).

### Schema
- **Migration 068 — `jobs.apply_token`.** Adds a unique public apply token to
  canonical `jobs` with a `BEFORE INSERT` trigger that auto-generates it when
  null (mirrors `hiring_requests.apply_link_token`); backfills existing rows.
  Idempotent.

### Security
- **RBAC API guard gaps — closed.** Several recruiting endpoints enforced only
  org-membership (or, for `/api/email/send`, nothing at all in the handler) and
  ignored per-member capabilities. Added capability gates: `recruiting:view` on
  `GET` of `/api/hiring-requests` (+`[id]`), `/api/email-templates`,
  `/api/pipeline-stages`, `/api/roles` (+`[id]`), and `/api/export/{candidates,
  applications,pipeline}`; `recruiting:edit` on their writes and on
  `/api/email/send`; `analytics:view` on `/api/analytics`. A member without the
  capability now gets a 403 instead of the nav merely being hidden.

### Fixed
- **Invite flow — stale-role leak on re-invite.** Re-inviting an email now revokes
  any prior **pending** Clerk invitation first (`revokePendingInvitations`), so a
  superseded invite can't win the join-time role lookup. The join-time lookups
  (`getInvitePreferredRole` / `getInviteRbacRole`) now only fall back to **pending**
  invitations — never `revoked`/`expired` — so a revoked invite's frozen metadata
  (e.g. a since-deleted role) can no longer leak onto a new membership.
- **Onboarding "Your role" step — showed coarse legacy label.** The locked-role
  message now shows the actual invited **RBAC role name** (e.g. "Talent Acquisition")
  instead of the back-compat legacy label (always just admin/recruiter).
- **Onboarding "Your role" step — wrong role highlighted in the picker.** When the
  invite carries an RBAC role, the step now renders a single locked card with that
  role's real **name + description** (read from `rbac_roles`) instead of the legacy
  4-role radio list, which highlighted the coarse mapping (e.g. "Recruiter") and
  contradicted the banner above it. Uninvited/legacy-only joins still get the
  static 4-role list.
- **Team & Permissions — misleading base-role badge.** The per-member legacy
  base-role chip is now only shown for `admin`; the generic
  recruiter/hiring_manager/interviewer base roles (superseded by the RBAC role
  chips) are suppressed.

### Changed
- **Org setup — clearer guidance for invitees.** Copy now points invited users to
  the pending-invitation card (already rendered by Clerk's `OrganizationList`), so
  an existing user who lands here after signing in has an unmistakable accept path.
- **Settings/Sidebar — removed capability-gated nav flicker.** A new shared
  `CapabilitiesProvider` fetches `/api/me` once for the whole dashboard; Sidebar and
  Settings now read from it instead of each firing their own request. The Settings
  nav renders a skeleton while capabilities load, so admin tabs ("Workspace",
  "Teams & Agents") appear together with the rest instead of popping in ~100–300ms
  later.

## 2026-06-14

### Changed
- **RBAC — invite flow wired to RBAC roles + remaining gates migrated.** The
  Settings → "Invite teammate" dropdown now lists the org's **RBAC roles**
  (including custom ones) instead of the legacy 4-role enum. New `teamInviteSchema`
  (email + `roleId`); `/api/team/invite` resolves the role, maps Owner → Clerk
  `org:admin` (else `org:member`), and stamps `rbac_role_id` on the invitation;
  new `getInviteRbacRole` + `ensureDefaultMemberRole` **assign that exact role on
  join** (org-verified). The team member row's legacy role dropdown is replaced by
  a "Manage access" link to `/admin/permissions` (one source of truth). Also
  migrated `/api/org-settings` PATCH admin-field gate and the `/settings` page's
  client `is_admin` gating to the `settings:edit` capability. Onboarding bootstrap
  + last-admin guard intentionally left on the legacy path.

### Added
- **Per-member RBAC — Slice 5 (cleanup).** Remaining coarse admin gates
  (`requireAdmin()` on departments / locations / compensation-bands) migrated to
  `requireCapability('settings:edit')`; added resolver-precedence and tool-gate
  tests. `requireAdmin`/`is_admin` retained as deprecated back-compat (admin↔Owner
  still holds). Onboarding-invite + field-level org-settings gates intentionally
  left as-is. **All RBAC slices 0–5 complete.**
- **Per-member RBAC — Slice 3 (agent enforcement).** `executeTool` capability-gates
  each tool (75-tool `TOOL_CAPABILITIES` map) when given a capability set; the
  user copilot threads the caller's caps (orchestrator → sub-agent → executeTool),
  while background jobs (WhatsApp responder, HR-case auto-answer) omit them and run
  unrestricted. Closes the hole where the agent bypassed the route-level gates.
- **Per-member RBAC — Slice 2 (capability-driven nav).** `/api/me` returns the
  viewer's `capabilities`; the sidebar shows only items whose capability is held
  (sections hide when empty), replacing the coarse `adminOnly` flag. `AdminOnlyGuard`
  admits the `/hris` area on any People-area capability so granular grants reach
  their pages.
- **Per-member RBAC — Slice 4 (admin UI).** New "Team & Permissions" page at
  `/admin/permissions` (Owner-only). Roles section lists system roles (badged,
  read-only) and custom roles (editable/deletable) with a capability grid
  (rows = modules, columns = view/edit/approve, built from `CAPABILITIES`) plus
  create/edit forms. Members section lists active org members with role chips
  (add via a role picker, remove via the chip's ✕) and surfaces per-member
  override counts. Added a "Permissions" entry to the sidebar Admin section
  (`settings:edit`-gated).
- **Per-member RBAC — Slice 1 (API enforcement).** Capability gates now enforced
  across guarded API routes (130 route-methods, via a multi-agent workflow + a
  reviewed pass over 35 flagged routes). Foundation: `getViewerScope` resolves
  effective capabilities; `assertCapability(scope, cap)`; a `withCapability(cap,
  handler)` route wrapper and `requireCapability(cap)` helper; `ensureDefaultMemberRole`
  assigns new members their default role (admin→Owner, else Recruiter) so nobody
  is locked out. Behavior-preserving for the two current populations (Owner = all
  caps; Recruiter = recruiting/openings/analytics): admin-only surfaces map to
  Owner-only capabilities, recruiting surfaces to caps every member already holds.
  Relationship gates (canViewEmployee/Sensitive), `/me/**`, public, webhook, and
  copilot routes untouched. Open recruiter-UX reference reads (departments/
  locations lists, dropdowns) deliberately left open.
- **Per-member RBAC — Slice 0 (model & resolver).** Hybrid model: named roles
  (capability bundles) + per-member allow/deny overrides; capability =
  `<module>:<action>`. New `src/lib/permissions.ts` (capability registry + pure
  `resolveCapabilities`, precedence deny > allow > role, Owner → all). `rbac.ts`
  gains `getPermissionSet`/`can`/`assertCan` — **standalone and dormant** (not
  wired into `getViewerScope` or any route yet; Slice 1 turns on enforcement).
  Plan in `docs/rbac-plan.md`. **No enforcement; behavior unchanged.**

### Schema
- **Migration 065 — RBAC tables (Slice 0).** `rbac_roles`,
  `rbac_role_capabilities`, `rbac_member_roles`, `rbac_member_overrides`
  (prefixed `rbac_` to avoid the legacy ATS `roles` table). Seeds Owner +
  Recruiter system roles per org and backfills assignments behavior-preservingly
  (admins → Owner/all-caps, everyone else → Recruiter/recruiting+openings+analytics).
- **Migration 064 — Canonical Slice 3: link applications to canonical jobs.**
  Adds nullable `applications.job_id` (→`jobs`) and `opening_id` (→`openings`)
  plus indexes. Forward-only dual-write: `createApplication` now accepts optional
  `jobId`/`openingId` and only references those columns when set, so the legacy
  apply/intake flow is untouched and deploys stay safe even if the migration
  lags. `hiring_request_id` stays NOT NULL for now. This is the link that lets
  canonical `jobs` pipelines hold candidates for new data.

### Added
- **Canonical Slice 5 — drift guard.** `scripts/audit-canonical-model.mjs --check`
  (npm `audit:canonical:check`) exits non-zero when a caller file
  (`src/app`/`src/lib`/`src/components`) accesses a legacy table directly outside
  an explicit `LEGACY_ALLOWLIST` (the 5 frozen intake/`hiring_requests` routes).
  Wired into CI via `.github/workflows/canonical-guard.yml` (dependency-free).
  New core work that bypasses canonical services / domain facades now fails the
  build.

### Changed
- **Canonical Slice 2 — copilot + job-queue storage access moved behind domain
  facades.** `src/lib/copilot-tools.ts` and `src/lib/api/job-handlers.ts` no
  longer touch `candidates` / `applications` / `pipeline_stages` / `roles` /
  `interviews` / `offers` / `hiring_requests` directly. All raw `supabase.from(...)`
  reads/writes on those tables now route through `@/modules/ats/domain/*` facades
  (`candidates`, `applications`, `job-pipelines`, `role-profiles`, `interviews`,
  `offers`). Behavior is byte-identical — every agent-facing return string, error
  message, ordering, limit, and filter is preserved. Both files are now off the
  canonical audit's `legacy` list (legacy 7 → 5; the remaining 5 are the
  intake/`hiring_requests` routes frozen by decision).
- **Sidebar IA — TA-professional-only restructure (Phase 1).** The product is the
  cockpit for a centralized TA team (recruiting + HR-ops, access-gated); employee
  self-service ships as a separate variant. So `Sidebar.tsx` `NAV_SECTIONS` now:
  removes the entire `Me` self-service bucket (all `/me/*`); drops the duplicate
  `Pipelines` (`/req-jobs`) entry so legacy `/jobs` is the single "Jobs" surface
  (Option A — it's the only board with candidates until canonical Slice 3);
  renames `HRIS` → `People`. HR-ops modules (OKRs, Documents, HR cases, Leave
  policies, Payroll) stay as admin/org views. Per-module RBAC (vs the current
  coarse `adminOnly`) is a noted follow-up. See `docs/nav-consolidation-roadmap.md`.

### Removed
- Orphaned `Me`-only icon imports (`UserCircle`, `Calendar`, `Clock`) from `Sidebar.tsx`.

### Docs
- **Navigation consolidation roadmap.** New `docs/nav-consolidation-roadmap.md`
  ties the sidebar IA cleanup to the canonical migration. Establishes the
  TA-professional-only product principle (employee HRIS/Payroll self-service is a
  separate variant → the `Me` bucket leaves this nav), documents the
  Openings/Jobs/Pipelines overlap as "2 real concepts + 1 legacy duplicate"
  (legacy `hiring_requests` still holds all candidates because `applications` has
  no `job_id`), explains the canonical Job-vs-Opening distinction, and sequences
  the work: nav now → canonical Slices 0–3 → final nav collapse once candidates
  are re-anchored onto canonical `jobs`.

## 2026-06-10

### Added
- **WhatsApp provider adapter — Vobiz support.** The org's Meta business
  account is blocked from claiming apps, so WhatsApp now routes through a
  provider layer: Meta Cloud API (direct) or Vobiz (BSP, whose telephony we
  already use). New `lib/whatsapp/vobiz.ts` client
  (`api.vobiz.ai/v1/messaging/messages`, X-Auth-ID/X-Auth-Token), Vobiz
  callback signature verification (HMAC-SHA256 base64 over callbackUrl+nonce,
  X-Vobiz-Signature-V2/V3), webhook handles both payload shapes on the same
  endpoint, and the settings card gets a provider toggle with conditional
  fields. Vobiz's inbound `data` schema isn't published — the parser is
  tolerant and logs unparseable payloads verbatim for correction from the
  first live event.

### Schema
- **Migration 063 — WhatsApp providers.** `whatsapp_accounts.provider`
  ('meta'|'vobiz'), `auth_id` (Vobiz X-Auth-ID); `waba_id` now nullable.
  For Vobiz rows, `phone_number_id` holds the channel_id and `access_token`
  holds the auth token (also the callback HMAC key).

### Added
- **WhatsApp messaging (Meta Cloud API) — two-way conversational.** Agents can
  now talk to candidates on WhatsApp:
  - New copilot tool `send_whatsapp_message` (Scout outreach, mirrors
    `send_outreach_email`); orchestrator approval gates now cover WhatsApp.
  - Inbound webhook `/api/webhooks/whatsapp` (Meta handshake + HMAC-verified
    POSTs); replies are answered by an AI responder agent (Haiku, bounded
    toolset) via the job queue, with guardrails: STOP opt-out, unknown-sender
    escalation, 10-turn cap, per-conversation mute, recruiter notifications.
  - 24-hour customer-service window handled automatically: free-form text in
    window, the org's pre-approved outreach template outside it.
  - Settings → Integrations → WhatsApp card (per-org credentials, encrypted at
    rest; webhook URL + test send) backed by `/api/org-settings/whatsapp`.
  - Candidate profile right panel gets a WhatsApp thread tab (bubbles, delivery
    ticks, AI-responder toggle) via `/api/candidates/[id]/whatsapp`; timeline
    renders `whatsapp_sent` / `whatsapp_received` / `whatsapp_opt_out` events.
  - New env vars (optional, feature degrades gracefully):
    `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`,
    `WHATSAPP_DEFAULT_COUNTRY`.

### Schema
- **Migration 061 — WhatsApp tables.** `whatsapp_accounts` (per-org Meta
  credentials, tokens AES-encrypted), `whatsapp_conversations` (one per
  org+phone, tracks 24h window + responder state), `whatsapp_messages`
  (idempotent on Meta `wamid`), plus `digits_only()` helper + expression index
  on `people` for inbound phone → person matching.
- **Migration 062 — Party Model enforcement on `candidates`.** `people` is now
  the DB-enforced canonical source of identity (name / email / phone /
  linkedin_url). On the `candidates` table:
  - Dropped `NOT NULL` on `name` + `email` so writers can stop passing them.
  - Added `BEFORE INSERT/UPDATE` trigger that fills any NULL identity field
    from the linked `people` row.
  - Added `AFTER UPDATE` trigger on `people` that propagates identity edits
    to every linked `candidates` row.
  - Backfilled candidates with null `person_id` by linking to (or creating) a
    matching `people` row.

### Added
- **Party Model rule documented** in `docs/canonical-data-model.md`. Identity
  on `people`; role tables (candidates, employee_profiles, future leads /
  alumni) carry only role-specific facts + non-null `person_id`. New person-
  role tables MUST follow this rule.
- **`docs/data-inventory.md`** — full schema inventory (67 tables, 8
  categories, 7 overlap zones), cross-module spine diagram, homepage-pillar
  guidance. The motivating context for the Party Model rule above.

### Changed
- **Canonical write path for candidates.** `findOrCreateCandidateProfile`
  creates the `people` row first and inserts the candidate with only
  `person_id` + role-specific attrs. Trigger fills identity. Existing
  reads keep working (denormalized columns still present, kept in sync).
- **`POST /api/candidates`**, **`PATCH /api/candidates/[id]`**,
  **`/api/sourcing/confirm`** all route through the canonical write path.
  PATCH splits identity edits into a `people` update; role edits stay on
  `candidates`. Sourcing CSV import loses chunked batching in favour of
  per-row canonical writes — sourcing is admin-triggered, throughput
  isn't critical, the architectural consistency is.
- **`/api/candidates` search** queries `people` for name/email/phone
  matches first, then ORs with candidate-side fields (current_title /
  location). Replaces the previous all-on-candidates search.

### Fixed
- **Sidebar flyouts were invisible / buckets felt dead on click.** Two
  bugs in the new buckets-only rail:
  - The rail's `<nav>` had `overflow-y-auto`, which clipped the absolutely-
    positioned flyout panels — they rendered but were hidden behind the
    overflow boundary. Switched to `overflow-visible` (7 buckets fit
    without scrolling).
  - Bucket buttons with no direct route (Me, Recruiting, HRIS, Payroll,
    Insights, Admin) had no `onClick` handler — they only opened on
    hover. Click now toggles the flyout immediately (bypassing the
    150ms open delay), giving a deterministic fallback for trackpads
    where hover is finicky. Hover still works as before.

### Added
- **Payroll: Singapore tax engine (second country).** Validates the
  pluggable `TaxEngine` interface with a structurally different
  implementation. Effective Jan 2026 CPF rates (employee 20%, employer
  17%, OW ceiling S$8,000/month) and IRAS YA2026 resident slabs.
  - Singapore has no monthly TDS — employees file annually with IRAS.
    The engine deducts CPF only and emits a projected annual income
    tax as an *informational* line that doesn't reduce net.
  - Settings: country picker on `/settings/payroll`; India-only fields
    (state / regime / metro / PF / ESI / decomposition) hidden when
    Singapore is selected. Country-aware disclaimer banner.
  - 12 unit tests pin CPF math at / below / above the OW ceiling, LWP
    integration, and honest-scope guards (no-monthly-TDS note, AW note
    above the annual ceiling, hourly throws).
  - Schema: migration 060 widens `payroll_org_settings.country_code`
    CHECK to allow 'SG'.
  - Honest scope NOT shipped: CPF age tiers above 55, Additional Wages
    (bonus / 13th-month) CPF math, non-resident rates, SDL employer
    deduction, personal reliefs in the tax projection.
  - Sub-agent prompt updated to describe both engines + per-country
    limits.

### Added
- **Department + manager filters on `/analytics/people`.** Two dropdowns
  next to the window picker. Filters narrow the cohort cards
  (cost-per-hire, tenure, comp drift) which are employee-side. Amber
  banner appears when filters are active explaining that app-side cards
  (funnel, time-to-hire, source, trends) stay org-wide because
  applications don't carry department/manager directly yet — filter-
  aware app-side metrics are a follow-up that needs cleaner
  application→hiring_request joins. Role filter skipped entirely (text
  field, doesn't dedupe usefully). Manager filter is direct-reports
  only; transitive walk is a follow-up.

### Added
- **Hiring trends chart on `/analytics/people`.** Recharts line chart
  showing apps / hires / joins by calendar month for the last 12 months.
  Three lines on shared Y-axis so funnel collapse is visible. Months with
  zero activity still render (no chart holes). Full-width card. New
  domain function `getMonthlyHiringTrends`; added `recharts` dep.

### Added
- **Source → retention card on `/analytics/people`.** *The* killer
  cross-module chart. For every application source value (applied /
  sourced / referral / imported / manual), shows hire rate (apps →
  hired) alongside retention rate (hired → still active). Two horizontal
  bars per row in matching colors so the eye can compare side-by-side.
  Window-free on purpose — retention only means something across
  historical cohorts. Full-width card so it's the visual anchor of the
  page. Cross-vendor-impossible: ATS knows source, HRIS knows current
  status, same DB joins them.

### Added
- **Comp drift card on `/analytics/people`.** Fifth analytics card. For
  every active employee with 2+ `compensation_records` on file, shows
  the % change from earliest record (typically the offer) to the latest.
  Aggregate stats (median / p25 / p75) + per-employee drill-down. Exits
  gracefully when nobody has a comp history yet ("drift surfaces once
  people receive their first raise"). Uses the immutable-history pattern
  from migration 049 — no new schema.

### Added
- **CSV export on `/analytics/people` cards.** Download icon next to each
  card's subtitle exports that card's data as a timestamped CSV (RFC 4180
  escaping, UTF-8 BOM for Excel). Cost card includes per-employee
  breakdown rows. New helper `src/lib/api/csv-export.ts`.

### Added
- **DOB on `employee_profiles` (migration 059) + auto-derive 80DDB senior
  flag.** Optional `date_of_birth DATE` column. Payroll compute orchestrator
  now sets `80ddb_senior=1` automatically when the employee was 60+ at the
  pay-period end date — saves them ticking the checkbox per FY. Explicit
  user-set value wins (e.g. a senior treating a non-senior dependent).
  - Admin UI: inline DOB editor on `/hris/employees/[id]` next to Hired /
    Start date / Joined.
  - API: `PUT /api/employees/[id]/dob` (admin-only, validates ISO date,
    rejects future / >120yr past).
  - Re-added `/analytics/people` to the Insights sidebar bucket — the
    redesign dropped it.

### Changed
- **Sidebar redesigned: buckets-only rail + hover flyouts.** The desktop
  sidebar now shows only top-level buckets (Dashboard, Me, Recruiting,
  HRIS, Payroll, Insights, Admin) at a fixed 140px rail. Hovering a bucket
  (150ms delay) opens a flyout panel to the right with that bucket's
  flat list of items. Dashboard navigates directly on click (no flyout
  since it has no children). Settings stays inside the Admin flyout.
  Active highlighting bubbles up: the bucket lights emerald when any of
  its items matches the current route.
  - Mobile (below md): the rail is hidden and replaced with a fixed
    top-left hamburger that opens an off-canvas drawer containing the
    full nested list (no hover required).
  - Removed: the manual collapse/expand toggle and its localStorage key
    (`rs_sidebar_collapsed`) — the rail is always the compact form now.
  - No item overlaps were renamed (Onboarding / OKRs / Documents / HR
    cases still appear in both Me and HRIS — intentional, scope deferred).

### Added
- **Cross-module people analytics — `/analytics/people`.** Four metrics
  that each join data from at least two modules in one query. The
  unified-data moat in actual numbers, not a system prompt claim.
  - **Conversion funnel** — applications → hired → joined → still-active
    for the time window. Joins ATS `applications` to HRIS
    `employee_profiles` via `application_id`.
  - **Time-to-hire** — median / p25 / p75 days from `applied_at` to
    `hired_at`. Uses the trigger-stamped HRIS timestamp; ATS doesn't
    track this on its own.
  - **Real cost per active hire** — for active employees whose
    application landed in the window, sum of `payslips.net` ÷ headcount.
    Includes per-employee breakdown. Cross-vendor-impossible: Greenhouse
    can't see payslips, Rippling can't see application date.
  - **Tenure distribution** — current actives bucketed into <3mo /
    3–12mo / 1–2y / 2–5y / 5y+ with a median months number.
  - Domain: `src/modules/core/domain/people-analytics.ts` (lives in
    core because every metric crosses module boundaries; modules can't
    import from siblings).
  - API: `GET /api/analytics/people?days=N` runs all four in parallel via
    `Promise.allSettled` — a failure on one metric doesn't sink the
    page; each card surfaces its own error.
  - UI: 4-card grid with a window picker (30 / 90 / 180 / 365 days), a
    unified-data callout banner explaining the joins. Cost card has a
    drill-down list by employee. Sidebar entry under Insights.

## 2026-06-10

### Added
- **Payroll v1.2 — disability / specified diseases.** Three more Chapter
  VI-A sections in the India engine: **80U** (self disability), **80DD**
  (disabled dependent maintenance), **80DDB** (treatment of specified
  diseases — cancer, neurological, AIDS, etc.). No migration —
  reuses the existing `other_exemptions` jsonb column.
  - 80U / 80DD caps: ₹75,000 normal, ₹1,25,000 if severe (≥80% disability).
  - 80DDB caps: ₹40,000 under-60, ₹1,00,000 if patient is 60+.
  - Severity / senior flags stored as 0/1 in jsonb (`80u_severe`,
    `80dd_severe`, `80ddb_senior`). Engine reads them, picks the cap,
    then clamps the amount.
  - 10 new unit tests pin the math, including cap-clamp behaviour,
    new-regime-ignores-all, and a combined v1.1+v1.2 scenario.
  - UI: `/me/tax-declarations` "More exemptions" gets a sub-section
    "Disability / specified diseases" with an amount field plus a
    severity/senior checkbox per section. Cap in the field label
    updates live based on the toggle.
  - API: amount-key + flag-key whitelists on both routes — flags
    coerced to 0/1, unknown keys dropped.
  - Honest scope: no medical-certificate verification (Form 10-IA),
    no patient-DOB derivation (we trust the senior checkbox).

## 2026-06-08

### Added
- **Payroll v1.1 — old-regime extras.** Four more Chapter VI-A sections in
  the India engine, no migration needed (uses the existing
  `other_exemptions` jsonb column):
  - **Section 24(b)** — home loan interest, ₹2L cap (self-occupied)
  - **Section 80E** — education loan interest, no cap
  - **Section 80G** — donations, applied as flat 50% deductibility (working-
    tool simplification documented in code + UI + payslip meta). Real rule
    splits 100%/50% donees and caps some at 10% of gross
  - **Section 80TTA** — savings account interest, ₹10k cap
  - New regime continues to ignore all exemptions
  - Engine surfaces a payslip note when 80G is claimed, flagging the
    simplification
  - 11 new unit tests pin the math (28 total India tests passing)
  - UI: `/me/tax-declarations` gets a collapsible "More exemptions"
    section with per-field cap hints. Auto-expands if any v1.1 field is
    already populated
  - API: known-key whitelist sanitizer on both `/api/me/tax-declarations`
    and `/api/payroll/employees/[id]/declarations` — drops anything
    outside the engine's known keys, keeps the open jsonb safe

### Added
- **Payroll module v1 — India tax engine.** Compute joins the ledger:
  pluggable `TaxEngine` interface + one concrete implementation (India,
  FY 2026-27, both regimes). The compute orchestrator pre-fills draft
  payslips from current compensation, runs the engine, deducts LWP
  pulled from HRIS approved unpaid leave, and writes — preview-then-write
  modal on the run-detail page. Honest scope: working-tool accuracy, not
  statutory compliance (disclaimer banners everywhere).
  - Schema: `payroll_org_settings` (country, state, regime, salary
    decomposition %, PF/ESI/PT config) + `employee_profiles.tax_regime` +
    `employee_tax_declarations` (per FY: rent, 80C, 80D, 80CCD(1B)).
    Migration 058.
  - Engine math: Basic/HRA/Special decomposition, PF (12% of Basic, optional
    ₹15k cap), ESI (0.75% if gross ≤ ₹21k), state PT (KA/MH/TN/DL/HR),
    TDS new + old regime with 87A rebate / surcharge tiers / 4% cess.
    Karnataka PT default reflects the Apr 2025 threshold change to
    ₹25,000/month.
  - 17/17 unit tests pin the math; will fail loudly when slabs change after
    a future budget.
  - LWP from HRIS — the unified-data moat made concrete: approved unpaid
    leave overlapping the pay period deducts proportionally from net.
  - New UI: `/settings/payroll` (admin) + `/me/tax-declarations` (employee
    self-service: regime picker + per-FY exemption entry).
  - Agent prompt updated to describe v1 engine + limits; agent stays
    read-only (compute writes go through the admin UI).

### Added
- **Payroll module v0 — payslip ledger.** The fourth real module is live (no
  longer a placeholder). Records what each employee was paid in each pay
  period; no payroll math is computed here. Pillars:
  - Schema: `payroll_runs` + `payslips` (migration 057). Run totals computed
    on read; payslip rows snapshot employee name/email at write time.
  - Domain: `modules/payroll/domain/{runs,payslips}.ts` — full CRUD + finalize.
    Finalized runs are immutable from the API/UI.
  - Admin UI: `/payroll/runs` (list with totals), `/payroll/runs/[id]` (detail
    with editable payslip rows while draft, locked once finalized).
  - Self-service UI: `/me/payslips` (history), `/me/payslips/[id]` (printable
    detail). User-scoped via `employee_profiles.user_id`; never leaks across
    employees.
  - Sub-agent: `delegate_to_payroll` joins ATS / CRM / HRIS in the orchestrator
    with 3 read-only tools — `list_payroll_runs`, `get_payroll_run`,
    `get_employee_payslips`.
  - Flag: `NEXT_PUBLIC_PAYROLL_ENABLED` (default on); sidebar gates admin nav
    + employee "Payslips" item.
  - Scope deliberately excluded for v0: tax/statutory engine, bank
    disbursement, CSV import, PDF generation. All additive in v1.

### Changed
- Sidebar nav rearranged for clearer planning/execution separation. Under
  **Recruiting**, items now read `Openings → Jobs → Pipelines → Candidates →
  Sourcing → Sequences → Inbox` (Jobs before Pipelines reflects the legacy/
  canonical ordering; Inbox joined Recruiting since it's an action feed, not
  analytics). **Insights** is now `Analytics` only. HRIS / Me / Admin sections
  unchanged. Openings stayed in Recruiting (not HRIS) because HRIS is
  admin-only and Openings must remain visible to recruiters.

## 2026-05-24

### Fixed
- Onboarding no longer loops users who set up their workspace but didn't click
  through to the final "All set" screen. `onboarded_at` was stamped only by the
  done step's client-side effect, so connecting an integration mid-onboarding
  (which bounced the user back to the integrations step) and then closing the
  tab left it `null` forever — every subsequent login re-ran onboarding even
  though, e.g., Slack was already connected. Now completion is stamped
  server-side and idempotently (`markOnboarded`) once the required steps are
  persisted (`requiredStepsComplete`): on *reaching* the integrations step and
  again on the done screen as a backstop.
- OAuth connect/install flows started from the onboarding integrations step now
  carry an explicit `origin=onboarding` signal through the signed OAuth state,
  so callbacks return the user to that step instead of inferring the
  destination from `onboarded_at` (which is now set earlier). Settings-initiated
  connects are unchanged.

### Changed
- Extended the emerald brand theme across the app (52 files: landing page, public
  apply/schedule/intake flows, dashboard pages, and shared components). Converted
  brand/interactive blue — buttons, hover/focus states, focus rings, gradients,
  link text — to emerald. **Categorical status colors were deliberately
  preserved** (e.g. candidate `active`, pipeline stages, scorecard `yes`/`Good`
  ratings) so distinct states stay visually distinct. Light-blue decorative
  panels (`bg-blue-50` callouts) were left as-is and can be greened later.

### Docs
- Rewrote `README.md` into a real first-look entry point with a "Start here"
  reading path to `CLAUDE.md` and the canonical data-model docs.
- Refreshed `CLAUDE.md`: corrected stale counts (migrations 27→48+, API routes
  60+→130+, copilot tools 20+→~38, tests 13→37), added a Canonical Data Model
  section linking the `docs/` files and documenting the `src/lib/domain/*` facade
  convention, and surfaced `npm run audit:canonical`.
- Added this `CHANGELOG.md` as the running progress log.

### Removed
- Deleted `AGENTS.md` — it was a corrupted duplicate of `CLAUDE.md`
  (`Claude`→`Codex` text swap from another tool). `CLAUDE.md` is the single
  source of truth.
</content>
