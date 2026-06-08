# Payroll module

The fourth real module — what each employee was paid in each pay period. Sits
on the shared `core` identity spine (`people`) and the HRIS employee record:
a payslip belongs to an `employee_profile`, which belongs to a `person`, who
may also be a `candidate`. One unbroken thread from apply → paid.

## What's in the module today (v0 — payslip ledger)

We do **not** compute payroll in v0. The org runs payroll wherever they already
do (Razorpay, Keka, in-house spreadsheets) and we hold the resulting record.
This is the honest scope: it lands the unified-data moat (apply → comp →
payslip in one DB) without any tax-engine / statutory-compliance risk on
prod.

- **Schema** (`supabase/migrations/057_payroll.sql`):
  - `payroll_runs` — one row per (org, pay period). Status `draft | finalized`.
    Run-level totals are computed on read (sum of payslip rows) — no aggregate
    cache, no drift. Same pattern as leave balances and OKR progress.
  - `payslips` — one row per (run, employee). `gross + deductions_total + net`,
    plus a freeform `breakdown` jsonb (so this works in any country without
    baking statutory rules). Snapshots employee name/email at write time so
    the ledger is robust to later employee-record edits.

- **Domain**:
  - `domain/runs.ts` — listRuns / getRun (with computed totals) / createRun /
    updateRun / finalizeRun / deleteRun. Refuses edits + deletes on finalized
    runs in code (DB doesn't enforce yet to leave room for explicit overrides).
  - `domain/payslips.ts` — listPayslipsForRun / getPayslip /
    listEmployeePayslips / listMyPayslips (self-service via the user_id
    bridge) / getMyPayslip / upsertPayslip / deletePayslip.

- **Routes**:
  - Admin: `/api/payroll/runs`, `/api/payroll/runs/[id]` (GET/PATCH/DELETE;
    PATCH supports `{action:'finalize'}`), `/api/payroll/runs/[id]/payslips`
    (GET/PUT upsert), `/api/payroll/runs/[id]/payslips/[payslipId]` (GET/DELETE).
  - Self-service: `/api/me/payslips`, `/api/me/payslips/[id]` — user-scoped via
    the `employee_profiles.user_id` bridge; never leaks across employees.

- **UI**:
  - Admin: `/payroll/runs` (list), `/payroll/runs/[id]` (detail with editable
    payslip rows while draft, locked when finalized).
  - Self-service: `/me/payslips` (history), `/me/payslips/[id]` (printable
    detail).

- **Sub-agent**: `agent.ts` — `PAYROLL_TOOLS` + `PAYROLL_SYSTEM_PROMPT` for
  the orchestrator's `delegate_to_payroll` route.

- **Agent tools** (3, read-only): `list_payroll_runs`, `get_payroll_run`,
  `get_employee_payslips`.

## What's deliberately not here yet

- **No compute engine.** No tax math, no statutory contributions (PF/ESI/etc.),
  no country-specific rules. v1 candidate.
- **No disbursement.** No bank/ACH/NEFT integration; the org pays through
  whatever rail they already use.
- **No CSV upload yet** — payslips go through the typed admin form. CSV
  import is mechanical; add when an org asks.
- **No PDF generation** — `/me/payslips/[id]` uses browser print, which is
  enough for v0.

## Boundary rule

May import from `core` and itself only — never from a sibling module
(enforced by `npm run check:boundaries`).

Payroll remains the most likely first candidate for extraction into its own
service later (compliance isolation, independent batch scaling), but only on
a real forcing function — behind this module's interface, no caller needs to
care.
