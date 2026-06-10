# Changelog

A running log of notable changes to RecruiterStack — new features, fixes, schema
changes, UI/visual changes, and anything else worth knowing at a glance. Newest
entries on top.

> **How to use this file:** add an entry under the current date whenever you make a
> meaningful change. Group entries by type — `Added`, `Changed`, `Fixed`,
> `Removed`, `Schema` (migrations), `Docs`. Keep each line short and concrete.
> This file is part of the workflow — see the "Changelog" note in `CLAUDE.md`.

## 2026-06-10

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
