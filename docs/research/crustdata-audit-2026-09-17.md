# Crustdata and external sourcing audit

> Historical snapshot from the earlier investigation. The user reports that the ICP generator has since improved. The code findings below have not been revalidated and are excluded from the resumed competitor deep-dive. Do not treat this document as an assessment of the current implementation.

Audited 17 September 2026. Read-only review of application code and current public Crustdata documentation. No paid API requests, account inspection, secret access, candidate retrieval, or application changes. Existing Crustdata unit tests were run: **3 files, 37 tests passed**. Deployment state and account entitlements were not verified.

## Assessment

The repository has an effective ingestion foundation and an early connection from approved ICPs to Crustdata. It does **not yet implement a recruiter-grade external sourcing loop**. Its strongest assets are reusable ingestion, identity resolution, dated provenance, and a shared Fit Engine. The largest gaps are query construction, company intelligence, evidence loss before scoring, and the absence of retrieval continuity.

The present path is:

`Approved ICP + job title → hard filters → fetch 3 people → ingest → embed current title/company/skills → recall global pool's top 20 → Fit Engine → cached matrix`

The required path is closer to:

`Job outcomes and recruiter calibration → company/role hypotheses → multiple searches → deduplicated candidate evidence → targeted enrichment → evidence-aware scoring → recruiter feedback → revised search`

These are architectural recommendations, not claims that Crustdata or a competitor already implements every step.

## What is implemented

| Layer | Verified behavior | Repository evidence |
|---|---|---|
| API entry | Requires recruiting edit capability and an approved ICP; default 3 results, maximum 25 | [route.ts](/Users/sagar/recruiterstack/src/app/api/jobs/[id]/source/crustdata/route.ts:35) |
| Job context | Fetches only `jobs.title`; does not read company targets, geography, working arrangement, or full intake | [route.ts](/Users/sagar/recruiterstack/src/app/api/jobs/[id]/source/crustdata/route.ts:53) |
| Query compiler | Maps structured `must_haves`; accepts but does not consume `sourcing_map`; combines conditions with AND | [query.ts](/Users/sagar/recruiterstack/src/modules/pool/vendors/crustdata/query.ts:282) |
| Vendor HTTP | Versioned `/person/search`; bearer credential stays server-side; limit/cursor/sorts; reads credit and remaining-rate headers | [client.ts](/Users/sagar/recruiterstack/src/modules/pool/vendors/crustdata/client.ts:108) |
| Acquisition | Starts a run, searches, logs successful calls, ingests profiles, records totals | [crustdata-acquire.ts](/Users/sagar/recruiterstack/src/modules/pool/domain/crustdata-acquire.ts:126) |
| Mapping | Preserves current/past roles, role descriptions, education, LinkedIn identifier, source timestamps; primary concurrent role respected | [adapter.ts](/Users/sagar/recruiterstack/src/modules/pool/vendors/crustdata/adapter.ts:66) |
| Identity | Same vendor identity, then strong contacts, then new profile; raw usable payloads retained | [ingest.ts](/Users/sagar/recruiterstack/src/modules/pool/domain/ingest.ts:59) |
| Fit and display | Reuses pool semantic search and Fit Engine, then renders the shared sourcing matrix | [pool-sourcing.ts](/Users/sagar/recruiterstack/src/modules/pool/domain/pool-sourcing.ts:57), [PoolSourcingSection.tsx](/Users/sagar/recruiterstack/src/components/req-jobs/PoolSourcingSection.tsx:194) |
| Availability | Migration seeds Crustdata disabled; code supports activation through source configuration | [140_crustdata_source.sql](/Users/sagar/recruiterstack/supabase/migrations/140_crustdata_source.sql:16) |

The migration is evidence of the default, not proof that the current workspace's database still has the source disabled. Its comment claiming no Acquire client exists is outdated relative to the code.

## Prioritized findings

### 1. Company targets are not first-class retrieval inputs

The external route supplies only a title as query context. The compiler supports a company only when someone has represented it as a `must_have`, in which case it becomes a current-employer-name `in` condition. It has no target-company IDs, domains, alumni scope, exclusions, employer tier, company similarity, rationale, or recency rules. See [query.ts](/Users/sagar/recruiterstack/src/modules/pool/vendors/crustdata/query.ts:267).

This is materially different from a recruiter using an employer as evidence of an operating environment. A recruiter may want former employees, the relevant function at that employer, or adjacent companies with equivalent customers and technical problems. Requiring a current company name turns that preference into a gate and loses those people.

Recommendation: create an entity-resolved company map with `include/prefer/exclude`, `current/past/either`, rationale, relevant functions, confidence, and evidence timestamps. Use company cohorts as separate retrieval lanes and as explicit ranking evidence, rather than hard-filtering every search to a prestigious employer list.

### 2. The compiler changes or discards requirement semantics

The regex classifier and operator handling are too weak for open-ended recruiter inputs. [query.ts](/Users/sagar/recruiterstack/src/modules/pool/vendors/crustdata/query.ts:142) maps every attribute containing `company` to employer name. Thus `company_stage = Series A` would search for a person whose current employer is named “Series A.” An attribute such as `startup_experience` becomes total years of experience if its value parses numerically. These are deterministic consequences of the code, not observed production examples.

Title and location arrays keep only their first entry. Company, skills, function and seniority always use positive `in`, regardless of the input operator. Unknown numeric operators silently become a minimum. A partial closed-set match discards unmatched values without recording the discarded subset. See [query.ts](/Users/sagar/recruiterstack/src/modules/pool/vendors/crustdata/query.ts:231).

Every unrepresented `sourcing_map` proxy disappears before acquisition. The comments promise coarse high-confidence recall, but string classification is not sufficient to guarantee that intent.

Recommendation: compile from typed predicates with explicit attribute, scope, operator, value, hardness, and provenance. Unsupported predicates must remain visibly unapplied. Add contract tests for alternatives, exclusions, current versus previous employers, company stage, country versus radius, and role-specific versus total experience.

### 3. Job title, location, and seniority can over-constrain recall

The complete job title becomes a current-title all-words match unless a must-have supplied a title. Internal wording such as “Founding Backend Engineer, Payments” can therefore hide experienced backend engineers whose current title is simply “Software Engineer.” There are no alternative-title or career-adjacency queries. See [query.ts](/Users/sagar/recruiterstack/src/modules/pool/vendors/crustdata/query.ts:302).

All geography becomes a 50 km radius around a string, including attributes named country or region. Meanwhile, the local Fit Engine explicitly removes `location` and `seniority` from rejecting gates, while acquisition uses them as hard vendor filters. A person can be acceptable to the local judge and impossible to retrieve. See [query.ts](/Users/sagar/recruiterstack/src/modules/pool/vendors/crustdata/query.ts:236) and [fit-engine.ts](/Users/sagar/recruiterstack/src/lib/ai/fit-engine.ts:67).

Recommendation: maintain one requirement-hardness policy across search and scoring. Generate title families and search lanes for direct title, equivalent scope, relevant previous role, and adjacent trajectory. Model remote eligibility, time zone, relocation willingness, and current location separately.

### 4. The acquisition-to-scoring handoff loses valuable evidence

The adapter retains work-description summaries and education, but pool scoring selects only work titles, employers, and dates. It provides no education and no profile text. Candidate embedding contains only current title, current company, and skills. See [pool-sourcing.ts](/Users/sagar/recruiterstack/src/modules/pool/domain/pool-sourcing.ts:95), [embeddings.ts](/Users/sagar/recruiterstack/src/lib/ai/embeddings.ts:18).

This especially hurts a recruiter-style evaluation: team ownership, systems built, scale, customers, and previous environments are often in role descriptions. A present-day title cannot reconstruct that evidence.

Crustdata search has no skill values in its payload. The repository acknowledges that limitation, but has no Person Enrich call. Therefore a skill-based search may return a person while the scorer sees no listed skills. This is **not** an automatic skill rejection: the explicit missing-data reject applies only when both education and role history are absent and the ICP has gates. That policy nevertheless conflicts with treating incomplete vendor discovery as provisional evidence. See [adapter.ts](/Users/sagar/recruiterstack/src/modules/pool/vendors/crustdata/adapter.ts:10), [fit-engine.ts](/Users/sagar/recruiterstack/src/lib/ai/fit-engine.ts:280).

Recommendation: assemble a normalized evidence packet, carry role descriptions and education through the scoring boundary, and represent `supported / contradicted / unknown` independently from fit. Enrich candidates when missing evidence could change their ranking. Do not describe an inferred trait as established personality.

### 5. A paid result can vanish before it is evaluated

After acquisition the route reruns global pool semantic recall for the top 20. It does not guarantee that freshly bought profile IDs are scored. A newly acquired candidate with little embedding text can lose to an existing pool profile before the Fit Engine sees their history. If embedding fails, the exception is swallowed; the run can still succeed. See [route.ts](/Users/sagar/recruiterstack/src/app/api/jobs/[id]/source/crustdata/route.ts:88), [pool-sourcing.ts](/Users/sagar/recruiterstack/src/modules/pool/domain/pool-sourcing.ts:70).

Recommendation: persist per-run candidate membership and score the union of new vendor hits, suitable local matches, and previously discovered candidates. Deduplicate the union before scoring. Display counts for retrieved, reused, enriched, evaluated, qualified, and unknown—not merely fetched.

### 6. Re-search can buy the same page repeatedly

Each acquisition begins with a null cursor; the public route requests one page and neither persists nor returns the continuation cursor. There is no query fingerprint, run idempotency key, result exclusion, or refresh policy. The acquisition file explicitly documents that the pre-buy ledger is not wired and repeat searches re-pay. See [crustdata-acquire.ts](/Users/sagar/recruiterstack/src/modules/pool/domain/crustdata-acquire.ts:10).

The ingestion layer usually prevents duplicate people after purchase, but does not prevent duplicate spend. The existing generic ledger assumes a free ID-only discovery stage, which should not be assumed for this vendor/account.

Recommendation: cache searches by normalized query and ICP version, persist cursors, deduplicate acquired identifiers, separate “more candidates” from “refresh evidence,” lock concurrent runs, and retain per-run candidate IDs. Confirm any premium preview economics before basing the architecture on free search.

### 7. Spend protection and error accounting need completion

There is a per-request record cap, but no cumulative organization/job budget. Pool subscription access is checked only after vendor acquisition, in `sourcePoolForIcp`; a user with recruiting edit permission can therefore trigger spend before receiving `no_access`. Move entitlement and budget checks ahead of acquisition. [route.ts](/Users/sagar/recruiterstack/src/app/api/jobs/[id]/source/crustdata/route.ts:63), [pool-sourcing.ts](/Users/sagar/recruiterstack/src/modules/pool/domain/pool-sourcing.ts:63).

The client reads credits on a failed HTTP response but throws an error without carrying them. The orchestrator only logs successful vendor calls, so a charged failure is not reliably represented. Credit totals are rounded up into integer columns, which distorts fractional search economics. [client.ts](/Users/sagar/recruiterstack/src/modules/pool/vendors/crustdata/client.ts:131), [crustdata-acquire.ts](/Users/sagar/recruiterstack/src/modules/pool/domain/crustdata-acquire.ts:145).

There is no default HTTP timeout, rate pacing, retry strategy, or explicit handling of payment/permission/rate-limit errors. An optional abort signal exists in the client, but the orchestrator does not pass it. Errors ultimately use a Supabase error mapper. The UI's asynchronous fetch has no `finally`, so a network rejection can leave the sourcing indicator active. [client.ts](/Users/sagar/recruiterstack/src/modules/pool/vendors/crustdata/client.ts:120), [PoolSourcingSection.tsx](/Users/sagar/recruiterstack/src/components/req-jobs/PoolSourcingSection.tsx:94).

### 8. Freshness exists internally but is lost in the sourcing product

The adapter correctly uses vendor timestamps instead of ingestion time, and refuses to invent freshness. The pool has `evidence_as_of`, verified tenure, and employer-dispute concepts. However, sourcing matches omit those fields and the UI's stale indicator only means “ICP version changed.” A freshly requested search is not proof that its person records were refreshed today. [adapter.ts](/Users/sagar/recruiterstack/src/modules/pool/vendors/crustdata/adapter.ts:66), [pool.ts](/Users/sagar/recruiterstack/src/modules/pool/domain/pool.ts:53), [pool-sourcing.ts](/Users/sagar/recruiterstack/src/modules/pool/domain/pool-sourcing.ts:219).

Recommendation: show profile evidence age separately from search date and score date; distinguish cached enrichment from live refresh. Use role-history dates carefully—past role entries without end dates currently become “ongoing” in the adapter.

### 9. The UI does not expose the acquisition reasoning

The endpoint returns matched count, created/merged counts, and unmapped requirements; the component discards those details and toasts `fetched` as “new profiles.” Fetched may mean refreshed, duplicate, or unusable. There is no query explanation, target-company coverage, market size, next page, uncertainty, or per-lane result summary. See [route.ts](/Users/sagar/recruiterstack/src/app/api/jobs/[id]/source/crustdata/route.ts:97), [PoolSourcingSection.tsx](/Users/sagar/recruiterstack/src/components/req-jobs/PoolSourcingSection.tsx:107).

Recommendation: expose a recruiter-facing search plan and compact evidence cards: why this person fits, evidence supporting each important requirement, unknowns, employer-context rationale, freshness, and the next verification step.

## Current Crustdata capabilities relevant to the design

These are documented vendor capabilities, not capabilities currently implemented in Recruiterstack. Public docs can differ from specific account access or beta behavior.

| Capability | Verified documentation and practical implication |
|---|---|
| People discovery | `/person/search` returns profiles, total count, and cursors; documented price is 0.03 credits per returned result. Titles support all-words matching, and employer search can include current or previous roles. [Person Search](https://docs.crustdata.com/person-docs/search/introduction) |
| Semantic candidate retrieval | Beta `search.query` supports hybrid, lexical, and semantic modes. Top-level `mode: exact` preserves explicit hard filters; default managed mode may broaden beyond them. A reranked head of up to 200 has `fit` tiers; the cursor caps at 10,000. Do not send `sorts` with semantic ranking. Vendor fit is a retrieval signal, not a hiring verdict. [Semantic Search](https://docs.crustdata.com/guides/person-semantic-search) |
| Precise employer/history queries | Company IDs/domains and current/past scopes are available. Nested `all_of` can represent requirements met across different roles. Search does not return skills, summary, or developer-platform details, even when those fields are filterable. Premium preview is permission-dependent. Filter-only `explain` can diagnose zero-result filters. [Search reference](https://docs.crustdata.com/person-docs/search/reference) |
| Valid vocabulary | Person autocomplete returns indexed values and can be scoped with filters; use it for titles, company names, location, skills, and valid taxonomies. [Autocomplete](https://docs.crustdata.com/api-reference/person-apis/get-autocomplete-suggestions-for-person-search-fields) |
| Company resolution | `/company/identify` resolves names, domains, profile URLs or IDs, returning confidence-ranked matches and basic identities. Use stable IDs/domains rather than hoping display names match. [Identify Companies](https://docs.crustdata.com/api-reference/company-apis/identify-a-company-from-name-domain-id-or-profile-url) |
| Company discovery | Company search accepts structured and semantic criteria. It can expose company size, funding, and geography for candidate-employer cohorts. Documented search cost is 0.03 credits/result. [Company Search](https://docs.crustdata.com/company-docs/search/introduction) |
| Company evidence | Enrichment provides requested company sections such as headcount, funding, hiring, people, competitors, and reviews. This can ground environment hypotheses, though company-wide characteristics do not establish an individual's responsibilities. [Company Enrich](https://docs.crustdata.com/company-docs/enrichment/introduction) |
| Technology context | Beta technographics supports company and posting-level technology filters. Enrichment returns detection sources and job-posting evidence; the add-on requires access and currently adds 2 credits per company with data, above base enrichment cost. A company's tools do not prove each employee used them. [Technographics](https://docs.crustdata.com/guides/technographics) |
| Candidate enrichment | Cached `/person/enrich` accepts up to 25 profile URLs. Explicit fields are necessary for employment, education and skills; defaults are only basic profile and handles. Base profile is 1 credit, developer data adds 1. Contact enrichment is separate. The docs distinguish cached data from live enrichment. Live-enrich documentation redirected to login and its exact contract was not verified here. [Person Enrichment](https://docs.crustdata.com/person-docs/enrichment/introduction) |
| Continuous discovery | A person discovery watch reruns filters and delivers new/updated matches. First baseline sample is free; subsequent deliveries are documented at 0.5 credits/person. It supports caps and expiry. Filters are immutable, so ICP updates require a replacement watch. This is an eventual enhancement, not necessary for an initial interactive shortlist. [Person Discovery Watcher](https://docs.crustdata.com/watcher-docs/person/discovery) |
| Reliability | Read sliding-window rate-limit headers, back off on 429, treat insufficient-credit 402 as terminal, and distinguish permissions from transient failures. Account/key quotas can vary. [Best practices](https://docs.crustdata.com/openapi-specs/2025-11-01/best-practices) |

**Pricing discrepancy requiring reconciliation:** repository comments say approximately 0.3 credits per request, reportedly observed on 16 September, whereas current public documentation says 0.03 per returned result. The audit cannot determine whether this is a billing change, account-specific behavior, or inaccurate comments. Preserve exact `x-credits-used` values and verify actual account economics before estimating dollar costs. No billing requests were made in this review.

## Recommended staged implementation

1. **Repair the current path.** Preflight access and budget; retain acquired candidate membership; expose mapped/unmapped filters; pass role descriptions and education to scoring; distinguish unknowns; log fractional/failed-call spend; show exact acquisition outcomes.
2. **Make the ICP executable.** Introduce typed search predicates, a company map, title families, hard versus preferred versus verify-later requirements, and per-lane query plans. Every predicate should link to the recruiter input or evidence supporting it.
3. **Use company-first and semantic retrieval together.** Resolve explicit employer targets, discover similar environments, query relevant current employees and alumni, and run a parallel broader skills/trajectory search. Merge the results before scoring. Benchmark vendor hybrid retrieval against the existing deterministic path rather than replacing all search immediately.
4. **Enrich only where it changes a decision.** For promising but thin candidates, request the missing profile fields. Refresh important stale claims before outreach. Obtain contacts when the recruiter chooses to act, subject to the product's access rules.
5. **Close the feedback loop.** Record accept/reject/uncertain and the reason, not just a preference signal. Track yield and recruiter precision per company cohort and query lane. Revise search hypotheses without silently changing approved hard requirements.
6. **Add continuous sourcing after the interactive funnel works.** Version watches to the ICP, cap spend, suppress duplicates, respect profile removal statuses, and stop watches when the job closes.

Suggested acceptance measures: recruiter-accepted candidates per 20 reviewed; relevant candidate coverage across lanes; percentage with evidence for every hard requirement; retrieval-to-display survival rate; duplicate paid hits; useful candidates per credit; unknown rate; evidence age; latency to first usable shortlist. Measure subgroup disparities only with an appropriate evaluation design and permitted data; do not infer protected traits from names or profiles.

## Boundaries and validation

The endpoint is authenticated through `withCapability`; approved ICP lookup is scoped to organization and job. Its Supabase client is administrative, so explicit scoping is important. The later job-title read lacks an organization predicate, but an organization-scoped approved ICP is required first; this review does not claim a demonstrated cross-tenant exploit. [helpers.ts](/Users/sagar/recruiterstack/src/lib/api/helpers.ts:66), [icp.ts](/Users/sagar/recruiterstack/src/modules/ats/domain/icp.ts:51).

The code stores shared pool data and withholds contacts until unlock through its pool facade. Production data-sharing entitlement and vendor retention terms were outside this code-only audit; they should not be inferred from the presence of a technical integration.

Existing tests cover the HTTP client, adapter and simple compiler mapping. They all passed, but do not establish end-to-end sourcing quality or catch the principal product gaps above. There were no Crustdata orchestrator/route tests in the inspected vendor test set. Recommended high-value new checks are: positive versus negative predicate semantics; past employer and company stage interpretation; entitlement checked before spend; fetched candidate retained through ranking; incomplete evidence handled as unknown; cursor continuity; exact fractional billing on success and failure.
