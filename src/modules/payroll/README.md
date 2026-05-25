# Payroll module

Pay runs, salaries, tax, benefits — downstream of HRIS employment records. Sits
on the shared `core` identity spine (`people`): a payroll payee is the same
person as the HRIS employee, no data copied across a boundary.

Status: placeholder (future). See `docs/platform-modular-architecture.md`.

Payroll is the most likely first candidate for extraction into its own service
later (compliance isolation, independent batch scaling) — but only on a real
forcing function, behind this module's interface.

Boundary rule: may import from `core` and itself only — never from a sibling
module (enforced by `npm run check:boundaries`).
