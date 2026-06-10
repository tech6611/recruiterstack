# RecruiterStack Canonical Data Model

RecruiterStack's product promise is unified hiring data across the candidate-to-employee journey. The data model should make that promise true by treating ATS, CRM, requisition, approvals, offers, and employee handoff data as stages of one lifecycle, not as separate tools stitched together later.

## Current State

The codebase currently has two active generations of model:

- Lean ATS model: `roles`, `hiring_requests`, `pipeline_stages`, `applications`, `candidates`.
- Requisition/HRIS-style model: `openings`, `jobs`, `job_openings`, `job_postings`, `departments`, `locations`, `compensation_bands`, `approval_*`.

Both models are useful, but both describe "work we are hiring for." New product work should converge on one canonical spine instead of adding more logic to both generations.

## Canonical Spine

The canonical hiring lifecycle is:

```text
Organization
  -> Workforce Need / Opening
  -> Job Pipeline
  -> Posting
  -> Person
  -> Candidate Profile
  -> Application
  -> Interview
  -> Offer
  -> Hire / Employee Profile
```

## Canonical Objects

### Person

The universal human record. A person can be a lead, candidate, applicant, referral, employee, alumni, or future rehire. This is the anchor for unified data.

Long-term target:

```text
people                ← canonical identity (name, email, phone, linkedin_url)
candidate_profiles    ← role-specific recruiting attrs (resume, skills, ai_score, status)
employee_profiles     ← role-specific HRIS attrs (dept, manager, comp, joined_at, status)
```

The existing `candidates` table currently acts as both `person` and `candidate_profile`. Keep it working in the near term, but avoid deepening that coupling in new features.

#### Party Model rule (enforced from migration 062 onwards)

**Identity facts live ONLY on `people`. Role tables hold only role-specific facts plus a non-null `person_id`.**

This is the standard Party Model pattern used by Workday, Salesforce, SAP. A single human can wear multiple role hats simultaneously (candidate + employee + Clerk user), so each role gets its own table that links back through `person_id`.

Concretely:
- `people.name`, `people.email`, `people.phone`, `people.linkedin_url` are the canonical source of truth for identity.
- `candidates.name / email / phone / linkedin_url` survive as DB-enforced read mirrors only — the BEFORE INSERT trigger on `candidates` fills them from the linked `people` row whenever they're NULL, and an AFTER UPDATE trigger on `people` propagates identity edits to every linked `candidates` row. Writers should pass `person_id` and skip identity fields.
- A future migration will drop the duplicate columns from `candidates` entirely once the ~27 join-read sites are refactored to use `candidates(person:people(...))`.

When adding new person-role tables (employees, leads, alumni, …):

1. Add a `person_id UUID NOT NULL REFERENCES people(id)` column.
2. Do NOT duplicate identity fields. Read them via the people join.
3. Add ONLY role-specific attributes (e.g. employees get `tax_regime`, `department_id`; leads get `marketing_source`, `lead_score`).
4. The write path goes through `findOrCreatePerson` first, then inserts the role row referencing the returned `person_id`.

See [`data-inventory.md`](./data-inventory.md) §3.1 for the overlap-zone context that led to this rule.

### Opening

The approved or requested headcount slot. This is the canonical requisition/workforce planning object.

Owns:

- Department
- Location
- Compensation band
- Hiring manager
- Recruiter
- Approval state
- Budget/headcount context
- Custom fields

Existing table: `openings`.

### Job Pipeline

The recruiting operating container used to fill one or more openings. Recruiters manage stages, applications, interviews, and offers here.

Existing table: `jobs` in the requisition module.

Legacy equivalent: `hiring_requests`.

### Posting

The public or internal advertisement for a job pipeline. One job can have multiple postings.

Existing table: `job_postings`.

### Application

A person's candidacy for a specific job/opening. This is where pipeline state, AI score, review status, source, rejection/hire status, and activity timeline belong.

Existing table: `applications`.

### Offer

Commercial terms extended for an application. Offer approvals attach here when compensation terms need governance.

Existing table: `offers`.

## Migration Direction

The platform should converge toward:

```text
roles                 -> role_profiles
hiring_requests       -> compatibility layer or migrated into openings/jobs
openings              -> canonical requisition/headcount
jobs                  -> canonical recruiting pipeline
job_postings          -> canonical posting layer
candidates            -> split later into people + candidate_profiles
applications          -> canonical candidacy record
pipeline_stages       -> job pipeline stages
scorecards            -> application/interview evaluation
offers                -> offer layer
approval_*            -> governance layer
```

## Engineering Rules For New Work

1. New requisition/headcount logic attaches to `openings`.
2. New recruiting workflow logic attaches to requisition `jobs` where possible.
3. New candidate lifecycle logic should attach to `applications`.
4. New person-level facts should be designed so they can move from `candidates` to `people` later.
5. Do not add new core workflows to `hiring_requests` unless explicitly building a compatibility bridge.
6. Every tenant-scoped write must set `org_id` explicitly.
7. Every tenant-scoped read must filter by `org_id`.

## First Implementation Slices

1. Fix legacy routes that create or reuse candidates globally instead of by org.
2. Add a canonical read facade that can present legacy `hiring_requests` and requisition `jobs` consistently.
3. Move AI scoring/autopilot toward `application` as the durable contract, with job/opening adapters behind it.
4. Introduce `people` behind a feature flag or additive migration, then backfill from `candidates`.
5. Convert candidate profile UI to resolve through person identity while preserving existing candidate URLs.

## Audit Command

Run this before adding major features or after touching model-heavy routes:

```bash
npm run audit:canonical
```

The audit lists direct table access by status (`legacy`, `adapter`, `compatibility`, `canonical`) so migration progress is measurable instead of anecdotal.
