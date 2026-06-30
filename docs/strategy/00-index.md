# 00 — Strategy Index & Executive Summary

> **Date:** 2026-05-28
> **Author:** Foundational exploration commissioned by the founder.
> **Scope:** Not implementation — analysis only. No app code touched. Output lives in this `docs/strategy/` tree.
> **Posture:** Cut-throat-brutal as requested. Anything (including kill / pivot) is on the table.

---

## Reader's map — five concerns, five docs

| # | Doc | What it answers |
|---|---|---|
| **01** | [Competitive Intelligence](./01-competitive-intel.md) | What is actually true about the 2026 ATS market across the four comp sets — with citations |
| **02** | [Whitespace & ICP Recommendation](./02-whitespace-and-icp.md) | Where the market is open + the single recommended ICP + the new positioning |
| **03** | [Codebase Audit](./03-codebase-audit.md) | What's strong, what's fragile, what to kill / pivot / double-down on — file paths, not vibes |
| **04** | [Two-Year Roadmap](./04-roadmap-2yr.md) | 8-quarter sequenced plan with quarterly kill/pivot review gates |
| **05** | [Agent Architecture](./05-agent-architecture.md) | The Claude Code dev sub-agent fleet — system prompts, hooks, worktrees, runbook |

Read in any order; cross-references resolve in both directions. For a fast-path: this index → [04 §0–§1](./04-roadmap-2yr.md) → [05 §1](./05-agent-architecture.md) → [02 §3](./02-whitespace-and-icp.md).

---

## Three sentences

RecruiterStack is **architecturally ambitious but operationally immature** — the canonical migration is right, the copilot monolith is wrong, the multi-tenancy boundary is fragile. The 2026 ATS market is **consolidating into HCM platforms while compliance becomes the new moat** — Eightfold is being sued, DPDP enforcement begins in 18 months, EU AI Act treats hiring AI as high-risk. The recommended bet is **a compliance-native AI ATS for Indian companies hiring globally**, executed by a single founder + a 12-agent Claude Code fleet, sequenced over 8 quarters, with the first 30 days spent paying down debt before any new feature ships.

---

## The one-line verdict per concern

| Concern | One-line verdict |
|---|---|
| Market | Incumbents got bought; AI-native winners are Ashby/Gem/Mercor; "agentic" is still mostly theatre; compliance is the real new wedge. |
| Whitespace | The bottom-left "AI-native + India-focused" quadrant is empty; the *compliance-native* angle multiplies any ICP. |
| ICP | Indian export-SaaS, GCCs, and Tier-2 IT services hiring globally — a $15M–$120M ARR ceiling that fits a solo + agent operating model. |
| Codebase | Functional but fragile; copilot monolith is the single biggest tech-debt time-bomb; canonical migration is ~50% done; Slice 2 is the choke-point. |
| Roadmap | Q1 = pay down debt (Slice 2 + audit guard + safety controls); Q2 = decompose copilot; Q3 = ship compliance flagship; Q4 = AI quality moat; Year 2 = scale + polish + enterprise. |
| Agents | 12-agent fleet, one orchestrator + per-module engineers + cross-cutting infra/sec/qa/frontend/design/docs/reviewer; worktree-isolated; PR-reviewed; founder approves merges to main. |

---

## Top 7 actions the founder should take this week

These are concrete, in priority order. Each links to the doc that argues why.

1. **Ship the uncommitted `org_id` fix in `src/app/api/jobs/[id]/stages/route.ts`.** It's a multi-tenant boundary leak waiting to happen. [03 §6.3](./03-codebase-audit.md), [04 §6 day 1](./04-roadmap-2yr.md).
2. **Cut a `develop` branch from `main` and configure branch protection.** All agent work lands on `develop`; promotion to `main` is a deliberate weekly act. [05 §2.3](./05-agent-architecture.md).
3. **Set up the `.claude/agents/` fleet skeleton (orchestrator + ats-eng + reviewer + infra-eng) and run one end-to-end task as a drill.** [05 §6 Week 1](./05-agent-architecture.md).
4. **Add the Slice 5 audit guard (pre-commit + CI on `npm run audit:canonical`).** This is the single highest-leverage one-time investment. [03 §6.4](./03-codebase-audit.md), [04 §Q1](./04-roadmap-2yr.md).
5. **Add `checkAuthRateLimit` to `/api/copilot` + a per-org daily Anthropic spend cap.** Unbounded AI cost is the #1 risk. [03 §9](./03-codebase-audit.md), [04 §Q1](./04-roadmap-2yr.md).
6. **Decide three brand/positioning questions explicitly: keep RecruiterStack/.in brand, public INR pricing, free tier yes/no.** [02 §8](./02-whitespace-and-icp.md).
7. **Start 20 ICP-fit discovery calls** with Indian export-SaaS / GCC / Tier-2 IT services CHROs and TA leads. The roadmap's Q2 kill/pivot gate depends on the signal you collect now. [02 §3](./02-whitespace-and-icp.md), [04 §Q1 GTM](./04-roadmap-2yr.md).

---

## The five biggest *uncomfortable* findings

These are the things easiest to ignore and most expensive to ignore.

1. **"Multi-tenant SaaS ATS with 5 AI agent personas" no longer differentiates.** Every competitor now claims this. The current public positioning is feature-list, not wedge. Re-frame to compliance-native + India-outbound. [02 §6](./02-whitespace-and-icp.md).
2. **`src/lib/copilot-tools.ts` (2,746 LOC, 44 tools, zero tests, no facade) is the single biggest time-bomb in the codebase.** Every quarter you don't decompose it costs 5–10× more in feature velocity. [03 §4.1](./03-codebase-audit.md), [04 §Q2](./04-roadmap-2yr.md).
3. **Doing India + Global GTM simultaneously will kill the solo + agent model.** Pick India outbound now; expand in year 3+. [02 §3.4](./02-whitespace-and-icp.md).
4. **The Eightfold lawsuit + DPDP + EU AI Act + LL144 stack will reset the ATS sales process by 2027.** Vendors without compliance UX will lose RFPs. Vendors with it will win them. [01 §1, §4](./01-competitive-intel.md), [02 §2.5](./02-whitespace-and-icp.md).
5. **The "infinite resources" framing does not change the answer — solo + Claude Code agent fleet is the *right* model for this ICP, not a constraint to overcome.** A funded buildout would burn 18 months on team formation while a 12-agent fleet ships in week 2. [05 §0](./05-agent-architecture.md).

---

## What this exercise *did not* settle

Three decisions remain with the founder, listed for visibility:

1. **Brand & domain.** [02 §8.1](./02-whitespace-and-icp.md) recommends keep; weak default, not a strong claim.
2. **Pricing transparency.** [02 §8.2](./02-whitespace-and-icp.md) recommends public ₹ pricing; could go either way.
3. **Free tier.** [02 §8.3](./02-whitespace-and-icp.md) recommends yes with a cap; depends on founder capacity for PLG channel maintenance.

These should be answered before Q1 of the roadmap commits — see [04 §6](./04-roadmap-2yr.md) day 28–30.

---

## Ground rules honoured

For the record, the four ground rules the founder set were:

1. **All current code committed and kept on the current main / protected branch** → not touched at all per founder's revised instruction; git state at start of session preserved.
2. **Any future coding on `develop`** → recommended setup documented in [05 §2.3](./05-agent-architecture.md); not executed (no code touched).
3. **Ask all clarifying questions before proceeding** → 12 questions asked across 3 rounds before any analysis began.
4. **Assume infinite time and resources — no corners cut** → full codebase crawl, full competitive scan with citations, complete agent fleet spec; all five concerns covered in dedicated docs.

The only deliverables are six markdown files in this directory. No code, no migrations, no `.claude/` configuration was modified.

---

## Suggested next session

Once the founder has read these six docs:

1. **Yes/no on the recommended ICP** ([02 §3](./02-whitespace-and-icp.md)) and the positioning re-frame ([02 §6](./02-whitespace-and-icp.md)).
2. **Yes/no on the Q1 engineering theme** ([04 §Q1](./04-roadmap-2yr.md)).
3. **Yes/no on the 12-agent fleet structure** ([05 §1](./05-agent-architecture.md)) — and which 2–3 agents to stand up first.
4. **Decisions on the three open questions** ([§What this exercise did not settle](#what-this-exercise-did-not-settle) above).

Once those are answered, the next session can move to *execution* — author the `.claude/agents/*.md` files, cut the `develop` branch, ship the day-1 uncommitted `org_id` fix, and run the fleet's first real task end-to-end.

---

*End of strategy index. Six documents, ~52K words of analysis, one bet, one fleet, two years.*
