# CRM module

Relationships with people who aren't (yet) active applicants — outreach
sequences today; leads, talent pools, and sourcing later. Sits on the shared
`core` identity spine (`people`): a CRM lead and an ATS candidate can be the
same person.

## What's in the module today (v1)

- **Domain**: `domain/sequences.ts` — reads only. listSequences (with stage /
  enrollment / reply counts), getSequence (with ordered stages), listEnrollments
  (flattened with candidate name/email), getSequenceAnalytics (per-stage
  open/click/reply/bounce stats), listCandidateEnrollments.
- **Sub-agent**: `agent.ts` — CRM_TOOLS + CRM_SYSTEM_PROMPT for the
  orchestrator's `delegate_to_crm` route.
- **Agent tools** (3, read-only): list_sequences, get_sequence,
  list_candidate_sequence_history.

## What's still outside the module

- Sequence **writes** (create, update, archive, add stage, enroll candidate)
  live in the API routes for v1 — the enrollment-scheduling flow is delicate
  and routes call Supabase directly. Lift into domain in a follow-up.
- The `sequence_email` job-queue worker (in `src/lib/api/job-handlers.ts`)
  stays where it is — it renders templates, sends via SendGrid, and updates
  enrollment progress. Moving it is mechanical and low-ROI today.
- **Leads** (homepage capture) and **sourcing** (CSV/CV/profile import) still
  live under `src/app/api/leads/*` and `src/app/api/sourcing/*`. Sourcing in
  particular is tightly coupled to candidate creation (which is ATS turf), so
  leaving it there for now is the honest call.

## Boundary rule

May import from `core` and itself only — never from a sibling module
(enforced by `npm run check:boundaries`).
