# Sourcing Lab: first production observation

## Run

- Job: Founding Engineering Manager, New York
- Experiment: `f6f89d3c-d5da-40c1-b127-320428ea7d4c`
- Started: 2026-09-23 15:40:45 UTC
- Completed: 2026-09-23 15:44:19 UTC
- Elapsed: **213.9 seconds (3m 34s)**
- Budget: five Crustdata profiles per arm; 0.15 credits per arm, 0.30 total
- Outcome: both arms completed successfully with five fetched and five displayed profiles.

## Latency log

The product currently performs the arms sequentially in one request:

1. Generate the Current brief with Gemini.
2. Search and ingest five Crustdata profiles.
3. Embed and score the retrieved profiles.
4. Repeat steps 1–3 for Challenger.

The database records only experiment start and end times, so it cannot yet attribute the 213.9 seconds by stage. The two Gemini brief calls, two Crustdata searches/ingests, ten individual Fit Engine evaluations, and embedding calls are all on the critical path. A follow-up should add stage timings and make the run asynchronous, with a job/worker record rather than a long-lived browser request.

## Quality observations to address before broader testing

- Each arm stopped after the first five profiles in its first vendor lane. It did **not** retrieve a larger candidate set and then select the best five.
- The Current arm's first lane returned 63 matches, but the product surfaced its first page: scores 90, 90, 90, 70, and 40.
- The first lane permits `title_any`, so a past software-engineering title can qualify someone whose current role is security, GTM, product, or another adjacent function.
- Neither arm uses an engineering-function inclusion gate, an exclusion for GTM/sales/solutions work, a minimum displayed score, or per-company diversity.
- The arms define different competency rubrics. Their scores are internally deterministic but not directly comparable: a 100 in one arm is not proof that the person is better than a 90 in the other.

## Correct retrieval direction

The product must **not** begin broad and use scoring to compensate. It must model the
recruiter's exact first-pass persona as vendor filters, then relax one dimension at a
time only when that lane is exhausted.

For this role, the first lane should require all of:

- current core-engineering function;
- a current engineering-leadership title family appropriate to the seat;
- the defined experience band, location, and first feeder-company set.

Only after that exact persona returns too few people should the ladder deliberately
widen: next feeder companies, then a recruiter-approved adjacent title family, then
location. A prior title is valid in the strict lane only when the recruiter brief says
that prior experience, rather than the current job, predicts success for this seat.

The generator therefore needs to emit explicit search semantics, not just title words:
`current` versus `past` title basis, required current function, and role-family
exclusions when a title phrase is ambiguous (for example GTM Engineering, Sales
Engineering, Solutions Engineering, or RevOps for a core product-engineering seat).
Scoring should explain and order people who already match the active lane; it is not a
substitute for a precise first-pass search.
