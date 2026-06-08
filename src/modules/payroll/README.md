# Payroll module

The fourth real module — what each employee was paid in each pay period, and
(in v1) what they *should* be paid based on their compensation + the country
tax engine. Sits on the shared `core` identity spine (`people`) and the
HRIS employee record: a payslip belongs to an `employee_profile`, which
belongs to a `person`, who may also be a `candidate`. One unbroken thread
from apply → paid.

## What's in the module today

### v0 — payslip ledger (always available)

Manually enter (or import) payslips per employee per period. No math.
Works in any country because we don't bake statutory rules into v0. This is
still the path of last resort when a customer's compute needs go beyond
what our engine supports.

### v1 — India tax engine (ships when `country_code='IN'`)

A pluggable engine interface (`domain/tax/types.ts`) + one concrete
implementation:

- **India, FY 2026-27** (`domain/tax/india.ts`). Both regimes. Math:
  - Decomposes monthly gross into Basic / HRA / Special using org-config %
  - **PF** 12% of Basic with optional ₹15k wage ceiling (Budget 2026)
  - **ESI** 0.75% of gross if gross ≤ ₹21k
  - **Professional Tax** state-varying (Karnataka, Maharashtra, Tamil Nadu,
    Delhi, Haryana built in). Karnataka raised the threshold to ₹25k/mo
    in Apr 2025
  - **TDS** — new + old regime slabs (Finance Act 2025 numbers, confirmed
    unchanged by Budget 2026), 87A rebate, surcharge tiers, 4% cess
  - **LWP** — cross-module from HRIS `time_off` (approved unpaid leave
    overlapping the period). This is the unified-data moat made concrete

Adding another country = drop a new file into `domain/tax/`, implement
`TaxEngine`, register in `domain/tax/registry.ts`. No schema rewrite.

## What's still NOT in here (deliberately)

- **Statutory accuracy.** This is a working-tool estimate. Any org actually
  filing tax returns must reconcile with their CA. The UI says so loudly
  on settings, in the compute modal, and in this README.
- **Employer-side PF / EPS split.** Shown as one informational line only;
  no statutory accuracy.
- **Surcharge marginal relief** at exact thresholds — slightly wrong inside
  a ~₹3-5k window around each surcharge floor.
- **Form 16 generation, year-end reconciliation, Form 12BB declarations.**
- **Bank disbursement / ACH / NEFT.** Same as v0.
- **Non-India engines.** Customers outside India fall back to the v0 manual
  ledger until we ship more country engines.
- **Hourly pay frequency** in compute. The engine throws explicitly; admin
  enters manual payslips for hourly staff.
- **Old-regime exemptions beyond HRA / 80C / 80D / 80CCD(1B).** Form 12BB
  has dozens more; we cover what 95% of salaried employees use. Free-form
  deduction lines remain available for the rest.

## Code map

```
modules/payroll/
├── README.md                    (this file)
├── agent.ts                     PAYROLL_TOOLS + system prompt
├── domain/
│   ├── runs.ts                  CRUD + finalize on payroll_runs
│   ├── payslips.ts              CRUD on payslips + self-service reads
│   ├── settings.ts              get/update payroll_org_settings (lazy create)
│   ├── declarations.ts          per-(employee, FY) old-regime exemptions
│   ├── compute.ts               orchestrator: plan + write draft payslips
│   └── tax/
│       ├── types.ts             TaxEngine interface, line types
│       ├── india.ts             India FY 2026-27 implementation
│       ├── registry.ts          lookup by country code + FY helper
│       ├── lwp.ts               read HRIS time_off → LWP days
│       └── __tests__/india.test.ts   17 scenarios pinning the math
```

## Routes

**Admin**

- `GET/POST  /api/payroll/runs`
- `GET/PATCH/DELETE  /api/payroll/runs/[id]` (`PATCH {action:'finalize'}`)
- `GET/PUT  /api/payroll/runs/[id]/payslips`
- `GET/DELETE  /api/payroll/runs/[id]/payslips/[payslipId]`
- `POST  /api/payroll/runs/[id]/compute` (`{preview, preserveExisting}`) — v1
- `GET/PUT  /api/payroll/settings` — v1
- `GET/PUT  /api/payroll/employees/[id]/declarations` — v1
- `PUT  /api/payroll/employees/[id]/regime` — v1

**Self-service**

- `GET  /api/me/payslips`, `GET  /api/me/payslips/[id]`
- `GET/PUT  /api/me/tax-regime` — v1
- `GET/PUT  /api/me/tax-declarations` — v1

## UI

- `/payroll/runs` (list), `/payroll/runs/[id]` (detail + "Generate from
  employees" compute modal in v1)
- `/settings/payroll` (tax engine + state + PF/ESI config) — v1
- `/me/payslips`, `/me/payslips/[id]`
- `/me/tax-declarations` (regime + per-FY declaration entry) — v1

## Agent

Three read-only tools on the orchestrator's `delegate_to_payroll` route:
`list_payroll_runs`, `get_payroll_run`, `get_employee_payslips`.

## Boundary rule

May import from `core` and itself only — never from a sibling module
(enforced by `npm run check:boundaries`). The LWP integrator (`tax/lwp.ts`)
reads `time_off_requests` directly from the canonical DB; that's allowed
because it's a database read, not an import from `hris/`.

Payroll remains the most likely candidate for extraction into its own
service later (compliance isolation, independent batch scaling) — but only
on a real forcing function, behind this module's interface.
