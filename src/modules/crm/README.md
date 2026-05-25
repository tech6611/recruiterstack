# CRM module

Relationships with people who aren't (yet) active applicants — leads, talent
pools, nurture sequences, sourcing, outreach. Sits on the shared `core` identity
spine (`people`): a CRM lead and an ATS candidate can be the same person.

Status: placeholder. Existing CRM-adjacent code (leads, sequences, sourcing)
will migrate here. See `docs/platform-modular-architecture.md`.

Boundary rule: may import from `core` and itself only — never from a sibling
module (enforced by `npm run check:boundaries`).
