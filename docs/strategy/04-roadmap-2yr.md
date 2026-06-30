# 04 — Two-Year Roadmap to Production-Grade

> **Date:** 2026-05-28 → 2028-05-28
> **Inputs:** [01](./01-competitive-intel.md) (market), [02](./02-whitespace-and-icp.md) (ICP), [03](./03-codebase-audit.md) (code).
> **ICP:** Indian companies hiring globally (export-SaaS / GCCs / Tier-2 IT services). Positioning: *compliance-native AI ATS.*
> **Team:** Solo founder + Claude Code agent fleet (spec in [05](./05-agent-architecture.md)).
> **"Production-grade" bar:** enterprise compliance (SOC 2 Type II, GDPR, India DPDP, ISO 27001) + scale (10K orgs, 1M candidates, <200ms p95, multi-region) + reliability (99.9% uptime, on-call, DR) + product/UX polish (design system, a11y AA, i18n, mobile parity).

This roadmap is sequenced for *one* operator. It assumes infinite *time* but realistic *concentration* — the founder cannot work on two things at once even with agents.

---

## 0. Decision framework

Three commitments govern every quarterly choice:

1. **ICP-first.** Every shipped feature passes the test "does this help an Indian export-SaaS / GCC / Tier-2 IT services CHRO buy this product?" Otherwise: defer.
2. **Tech-debt-before-feature.** The copilot monolith and missing facades (see [03 §4, §10](./03-codebase-audit.md)) eat 5–10× the cost of fixing them every quarter they're unfixed. Q1 is debt; product compounding follows.
3. **Compliance-as-feature, not back-office.** SOC 2 / DPDP / EU AI Act / LL144 are the *wedge* in this ICP. They ship as product surface (audit log UX, candidate consent UI, bias reports) — not just paperwork.

---

## 1. Two-year north stars

| North star | Target (end of year 2) |
|---|---|
| Paying orgs | 200–300 (ICP-fit) |
| ARR | ₹15–35 Cr (~$1.8M–$4.2M) |
| Gross margin | 75–85% |
| Net retention | 110–120% |
| SOC 2 Type II | Achieved |
| India DPDP compliance | Audited, public attestation |
| EU AI Act high-risk certification | Filed |
| Multi-region deploys | India (Mumbai) + EU (Frankfurt) live; US (Ashburn) optional |
| p95 API latency | < 200 ms |
| Uptime | ≥ 99.9% |
| Codebase test coverage | ≥ 60% on business logic; ≥ 80% on facades |
| Copilot decomposition | One file per module; zero direct table access from agent tools |
| Canonical migration | Slice 2 + Slice 5 complete; legacy `hiring_requests` retired |

---

## 2. The 8-quarter plan

Each quarter = **engineering theme + GTM theme + compliance theme + a single kill/pivot review gate**. Founder concentration is single-threaded; agent fleet parallelises within the quarter.

### Year 1 — Foundations

#### Q1 (Jun 2026 – Aug 2026) — "Pay down the debt"

**Engineering theme.** The Slice 2 + Slice 5 + safety pass. Nothing user-visible ships in this quarter.

| Workstream | Owner agent (see [05](./05-agent-architecture.md)) | Done means |
|---|---|---|
| Complete `src/modules/ats/domain/*` facades (candidates, applications) | `agent:ats-eng` | Every ATS copilot tool calls a facade; no `.from('candidates')` outside `src/modules/` |
| Add Slice 5 audit guard (pre-commit + CI) | `agent:infra-eng` | `npm run audit:canonical` fails CI on regression; pre-commit blocks new legacy writes |
| Ship the uncommitted `org_id` fix in `jobs/[id]/stages` | `agent:ats-eng` | PR merged Day 1; CI assertion added |
| Add idempotency keys to bulk endpoints | `agent:ats-eng` + `agent:infra-eng` | Score / move / reject endpoints dedupe by UUID |
| Add `checkAuthRateLimit` to `/api/copilot` | `agent:sec-eng` | Per-org per-user rate ceilings live |
| Add per-org daily Anthropic spend cap | `agent:infra-eng` + `agent:copilot-eng` | Hard stop at configurable $ ceiling; alerts at 50%, 80% |
| Fail-fast on missing `TOKEN_ENCRYPTION_KEY` | `agent:sec-eng` | Server refuses to boot if integrations enabled + key missing |
| Slack signing verification on `/api/slack/interactions` | `agent:integrations-eng` | Signature verified per Slack spec |
| Persistent job-status table replacing SSE-only progress | `agent:infra-eng` | Bulk jobs survive client disconnect; poll endpoint added |

**GTM theme.** Customer discovery — 20 founder calls with target ICP. Zero outbound. Pure listening.

**Compliance theme.** SOC 2 readiness — pick auditor, set scope, start evidence collection. Vanta/Drata onboarding.

**Kill/pivot review gate.** End of Q1: if Slice 2 + audit guard + copilot rate-limit aren't done, the rest of the year is at risk. Stop adding features until they are.

#### Q2 (Sep 2026 – Nov 2026) — "Decompose the copilot"

**Engineering theme.** Break `src/lib/copilot-tools.ts` into per-module tool exports.

| Workstream | Owner | Done means |
|---|---|---|
| Per-module tool exports: `src/modules/<mod>/agent/tools.ts` | `agent:copilot-eng` (orchestrating others) | ATS, HRIS, sourcing, scheduling, sequences each export their tool set |
| Tool orchestrator: composes per-request tool list | `agent:copilot-eng` | `lib/copilot-tools.ts` becomes a 100-LOC composer, not a 2,746-LOC monolith |
| Add per-tool cost-tracking metadata (max_tokens, max_iterations, dollar_cap) | `agent:copilot-eng` | Every tool declares its budget |
| Unify async task layer on Postgres-backed queue | `agent:infra-eng` | Single `enqueue()` API; DLQ + retry + monitoring; Upstash becomes fast-path optimisation |
| Add component test floor: 30% coverage on dashboard pages | `agent:qa-eng` | Vitest + Testing Library; happy-path coverage for candidates, jobs, pipeline, copilot UI |

**GTM theme.** Re-positioning. Public site re-write to "compliance-native AI ATS for Indian companies hiring globally" (see [02 §6](./02-whitespace-and-icp.md)). Publish two anchor posts: "DPDP for hiring teams" and "EU AI Act for Indian export SaaS."

**Compliance theme.** SOC 2 evidence collection running. Begin India DPDP gap assessment with a domestic advisor.

**Kill/pivot review gate.** Q2: if discovery calls don't validate the "compliance-native + India outbound" wedge with at least 8 of 20 prospects saying *"I would pay for this"*, run the alternative ICP analysis from [02 §4](./02-whitespace-and-icp.md) and decide whether to pivot before Q3 commits to it.

#### Q3 (Dec 2026 – Feb 2027) — "Ship the compliance flagship"

**Engineering theme.** Compliance UX as a top-level feature surface.

| Workstream | Owner | Done means |
|---|---|---|
| Audit log v2 — every agent action + every PII access recorded; queryable per candidate + per org | `agent:sec-eng` + `agent:hris-eng` | Public "Audit log" tab in product nav; DPDP DSAR exportable in one click |
| Candidate consent UI — explicit per-purpose consent capture at apply; per-jurisdiction templates (IN/EU/US-NYC) | `agent:ats-eng` + `agent:design` | Apply page surfaces consent; consent state stored, signed, timestamped |
| Bias-audit dashboard — per-job AI-decision histogram by stated demographics (opt-in); LL144 export | `agent:copilot-eng` + `agent:reporting-eng` | One-click LL144 bias report; per-stage acceptance-rate deltas surfaced |
| Human-review gates on every auto-reject, auto-advance, auto-rejection-email | `agent:copilot-eng` | Default = human review required; opt-in per-org to autonomous mode after audit log review |
| Per-candidate data-subject right flow — export, rectify, delete | `agent:hris-eng` | DPDP §11–14 compliant flow |
| Encryption key rotation runbook + tooling | `agent:sec-eng` + `agent:infra-eng` | Rotate without downtime; logged + audited |

**GTM theme.** Founder-led sales to first 10 ICP-fit design-partner customers at ₹2L–₹4L ACV. India SaaS LinkedIn presence + 1 podcast appearance per month.

**Compliance theme.** SOC 2 Type I audit completed. DPDP advisor gap-fix on track.

**Kill/pivot review gate.** Q3: if first 10 paying customers aren't ICP-fit OR if the compliance flagship isn't driving the conversation, return to discovery for 1 month before Q4.

#### Q4 (Mar 2027 – May 2027) — "AI quality moat"

**Engineering theme.** The scoring feedback loop and the agent reliability layer.

| Workstream | Owner | Done means |
|---|---|---|
| Scorecard delta loop — compare AI scores to interviewer scorecards; surface deltas as rubric drift; per-org feedback to rubric weights | `agent:copilot-eng` + `agent:hris-eng` | New "AI calibration" page in product; rubric weight updates tracked per org |
| Anthropic prompt cache adoption across all agent paths | `agent:copilot-eng` | Per-org system prompts cached; per-job context cached; cost reduction measured + reported |
| Fallback model strategy — Sonnet → Haiku → cached response on Anthropic outage | `agent:copilot-eng` | Synthetic outage test passes; user sees degraded but functional service |
| Agent reliability harness — replay + golden test fixtures per persona | `agent:qa-eng` + `agent:copilot-eng` | 50+ golden fixtures per persona; CI runs them; regression catches before merge |
| Conversation memory — copilot remembers prior turn context per session | `agent:copilot-eng` | Per-session memory store; per-org retention setting |
| Outage SLO — measured + published | `agent:infra-eng` | Status page live; 99.9% measured against synthetic monitors |

**GTM theme.** Public launch of repositioning. India SaaS conference (SaaSBoomi) presence. First case studies from Q3 design partners.

**Compliance theme.** SOC 2 Type I attestation issued. DPDP self-attestation drafted (Phase 1 of India enforcement).

**Kill/pivot review gate.** End of year 1: ARR target ≥ ₹2 Cr (~$240K). 30+ ICP-fit paying orgs. If not, the Year-2 plan needs surgery before Q5 commits.

---

### Year 2 — Compounding

#### Q5 (Jun 2027 – Aug 2027) — "Multi-region + scale"

**Engineering theme.** Performance and reach.

| Workstream | Owner | Done means |
|---|---|---|
| Multi-region Supabase: EU (Frankfurt) live for EU candidate data | `agent:infra-eng` | Per-org data residency setting; EU candidates' PII never leaves EU |
| Read replicas for analytics endpoints | `agent:infra-eng` | p95 dashboard latency < 200 ms |
| Caching layer (Redis SWR) for org settings, custom fields, role profiles | `agent:infra-eng` | Hot paths cached; cache invalidation on writes |
| Job queue sharding — per-org queues; per-org rate ceiling at queue level | `agent:infra-eng` | Noisy-neighbour insulation; per-org throughput SLO |
| Search re-architecture — pg_trgm + full-text + RAG-indexed candidate notes | `agent:ats-eng` + `agent:copilot-eng` | Sub-100 ms candidate search at 100K candidates |

**GTM theme.** Founder-led → founder-supervised: hire **no** humans yet, but the agent fleet now handles 90% of feature ship. Founder focus shifts to enterprise design partners (2–3 GCCs at ₹8–15L ACV).

**Compliance theme.** SOC 2 Type II audit window opens (12-month observation period concluding ~Q2 of Year 2). DPDP Phase 2 readiness (full DPDP enforcement begins ~May 2027).

**Kill/pivot review gate.** Q5: confirm at least one GCC customer in design-partner pipeline. If not, GCC ICP slice is weaker than [02 §3](./02-whitespace-and-icp.md) assumed; double-down on export-SaaS instead.

#### Q6 (Sep 2027 – Nov 2027) — "Polish, i18n, mobile"

**Engineering theme.** The product-quality bar.

| Workstream | Owner | Done means |
|---|---|---|
| Design system v1 — Tailwind + Radix + tokens; component library documented | `agent:design` + `agent:frontend-eng` | All new screens use the system; legacy screens migrated 50% |
| Accessibility AA across product nav + apply + intake + schedule | `agent:design` + `agent:qa-eng` | Axe CI clean; manual screen-reader pass on critical flows |
| i18n: English + Hindi at product UI; English + Hindi + Tamil + Telugu on candidate surfaces (apply / schedule) | `agent:frontend-eng` | Per-org locale; per-candidate locale; lang attribute correct |
| Mobile-PWA parity for recruiter inbox + candidate detail + interview scheduling | `agent:frontend-eng` | Installable PWA; offline-tolerant for read views |
| Public typography + content refresh | `agent:design` + `agent:docs` | New brand presence consistent with positioning |

**GTM theme.** Self-serve PLG live. Free tier capped at 10 active jobs + 200 candidates. INR billing rail via Razorpay live.

**Compliance theme.** ISO 27001 readiness assessment begins.

**Kill/pivot review gate.** Q6: if free-tier conversion < 3%, PLG signals failure; revert to founder-led + outbound.

#### Q7 (Dec 2027 – Feb 2028) — "Enterprise readiness"

**Engineering theme.** SSO, SCIM, fine-grained roles, audit-bus.

| Workstream | Owner | Done means |
|---|---|---|
| SSO (SAML, OIDC) on top of Clerk | `agent:sec-eng` | Enterprise IdP support; per-org SSO config |
| SCIM provisioning | `agent:sec-eng` + `agent:hris-eng` | Auto-provision users from IdP; deprovision on offboard |
| Fine-grained roles + permissions matrix | `agent:hris-eng` | Beyond admin/recruiter; per-feature role matrix; per-org custom roles |
| Audit-bus: event stream of all PII access + agent actions; replayable; sinkable to customer SIEM | `agent:sec-eng` + `agent:infra-eng` | Webhook + S3 sink available; per-org schema |
| Disaster recovery: RPO ≤ 15 min, RTO ≤ 1 hr; quarterly drill | `agent:infra-eng` | DR runbook tested in production-shaped staging |
| Status page + on-call rotation (solo on-call with agent triage) | `agent:infra-eng` | PagerDuty/incident.io integration; agent-driven first-pass triage |

**GTM theme.** Enterprise pipeline of 3–5 deals at ₹15–30L ACV; SOC 2 Type II + DPDP attestation become the closing argument.

**Compliance theme.** SOC 2 Type II report issued (observation period closes mid-Q7). DPDP full compliance attested.

**Kill/pivot review gate.** Q7: if ≥ 1 enterprise contract signed, the upmarket path is open; if 0, settle on mid-market focus permanently — fine and intended.

#### Q8 (Mar 2028 – May 2028) — "Reliability, observability, polish"

**Engineering theme.** The "9s" quarter.

| Workstream | Owner | Done means |
|---|---|---|
| Observability: structured logs + traces + metrics; per-org dashboards | `agent:infra-eng` | OTel pipeline; Grafana per-org; SLO burn alerts |
| Synthetic monitors per critical user journey | `agent:qa-eng` + `agent:infra-eng` | Continuous monitoring of apply, score, schedule, copilot |
| Chaos drill cadence: monthly | `agent:infra-eng` | Documented; results tracked |
| Test coverage push to 60% business logic + 80% facades | `agent:qa-eng` (all module-specific agents contribute) | Vitest coverage in CI; SonarQube or equivalent |
| Public bug bounty + security audit | `agent:sec-eng` | HackerOne or equivalent live; rotational external pentest |
| Public engineering blog | `agent:docs` | One technical post / month; sourcing top-of-funnel via dev community |

**GTM theme.** Year-2 close: 200–300 ICP-fit orgs, ₹15–35 Cr ARR, 75–85% gross margin, 110–120% net retention. Public engineering presence is now a recruiting + sales asset.

**Compliance theme.** ISO 27001 audit window concluding. Year-3 setup: EU AI Act high-risk system filing prepared.

**Kill/pivot review gate.** End of year 2: this is the *exit-or-double-down* decision. If ARR + margin profile is hit, options open up — raise, hold solo, sell to a platform (see [01 §1.1](./01-competitive-intel.md) for M&A backdrop). The roadmap explicitly *does not* assume the answer.

---

## 3. Cross-cutting workstreams (every quarter, always-on)

These don't fit a single quarter; they run continuously, owned by the dedicated agents in [05](./05-agent-architecture.md):

1. **Security & compliance.** Continuous: SOC 2 evidence, DPDP DSAR processing, EU AI Act audit logs, LL144 quarterly bias reports, dependency CVE patching. Owner: `agent:sec-eng`.
2. **Cost + reliability.** Per-org Anthropic spend monitoring, p95 latency, error budget burn, queue depth, DB connection pool. Owner: `agent:infra-eng`.
3. **Customer support + feedback loop.** Founder-supervised; agents triage tickets, summarise themes weekly. Owner: `agent:support`.
4. **Docs + DX.** Every shipped feature gets docs + a CHANGELOG entry. Owner: `agent:docs`.
5. **Design system + a11y.** Once Q6 ships v1, an always-on regression guard. Owner: `agent:design`.
6. **Sales enablement.** Pitch deck, ROI calculator, India + EU + US contract templates, customer success playbook. Owner: `agent:gtm`.

---

## 4. Hard rules (never-violated)

1. **No new code writes to `hiring_requests`.** Enforced by pre-commit + CI from Q1 onward.
2. **Every Anthropic call has a per-tool max_tokens, per-tool dollar_cap, and per-org daily cap.** Enforced at the orchestrator layer.
3. **No public endpoint without rate limiting** by end of Q1.
4. **No new agent tool without a domain facade.** Enforced by `agent:copilot-eng` PR review.
5. **No feature ship without test coverage on the happy path.** Enforced by `agent:qa-eng`.
6. **No customer in production without org_id-scoped queries proven by audit.** Enforced by Slice 5.
7. **No agent action affecting candidate or employee data without an audit-log entry.** Enforced by `agent:sec-eng`.
8. **No quarterly review skipped.** Every kill/pivot gate must be answered explicitly.

---

## 5. What this plan deliberately does *not* do

- **No multi-product expansion** (no payroll, no LMS, no surveys, no engagement scoring as separate product). The HRIS module stays minimal — depth on hiring + employee lifecycle only.
- **No second ICP in years 1–2.** US, EU-native, Indian-domestic-only buyers are deferred to year 3.
- **No mobile-native app.** PWA is the bar.
- **No on-prem deployment.** Cloud-only.
- **No agency / staffing-firm pivot.** Different product, different sale.
- **No public OSS push.** Stays proprietary. The agent fleet config + skeletons may be shared as DX material, but the product code is closed.
- **No platform / marketplace API.** Webhooks + REST for integrations; no third-party app store. Reconsider in year 3.
- **No fundraise modelled.** Bootstrap-aligned. If fundraising happens, the plan accelerates on people, not on direction.

---

## 6. The first 30 days (concrete)

Because the founder will read this Monday morning:

| Day | What | Owner |
|---|---|---|
| 1 | Merge the uncommitted `org_id` fix in `jobs/[id]/stages`; add a CI test | self / `agent:ats-eng` |
| 1–3 | Set up `develop` branch off current `main`; protect `main`; require PR review on `develop` | self |
| 2–5 | Stand up the agent fleet skeleton: `.claude/agents/*.md` per [05](./05-agent-architecture.md); test one PR end-to-end | self / `agent:infra-eng` |
| 5–10 | `agent:ats-eng` opens PR series finishing `src/modules/ats/domain/candidates.ts` + `applications.ts` facades | `agent:ats-eng` |
| 10–14 | `agent:infra-eng` ships Slice 5 audit guard: pre-commit hook + CI assertion + grace period for legacy files | `agent:infra-eng` |
| 14–21 | `agent:sec-eng` adds `checkAuthRateLimit` to `/api/copilot` + Slack signing verification + `TOKEN_ENCRYPTION_KEY` startup check | `agent:sec-eng` |
| 21–28 | `agent:copilot-eng` ships per-org daily Anthropic spend cap with config UI in org settings | `agent:copilot-eng` |
| 28–30 | Founder discovery calls — 5 ICP-fit conversations; record positioning hypothesis test | self |

If days 1–14 ship clean, the rest of Q1 has air to breathe. If not, the plan reschedules itself.

---

## 7. How to know it's working

Quarterly review checklist for the founder (single page):

- [ ] Quarter's engineering theme shipped? (Yes / partial / no)
- [ ] Quarter's GTM theme delivered to plan? (Yes / partial / no)
- [ ] Quarter's compliance theme on track? (Yes / partial / no)
- [ ] Hard rules violated? (Count + details)
- [ ] ICP-fit % of new paying customers ≥ 80%? (Yes / no)
- [ ] Anthropic spend per active org within target? (Yes / no)
- [ ] p95 API latency < 200 ms? (Yes / no)
- [ ] Test coverage trend up? (Yes / no)
- [ ] Audit-canonical status improved? (Yes / no)
- [ ] Kill/pivot review answered explicitly? (Yes / no — answer written)

If three or more "no"s in a quarter, the next quarter is recovery, not progression.

---

*End of roadmap. Agent fleet that executes it lives in [05-agent-architecture.md](./05-agent-architecture.md).*
