# RecruiterStack — Backlog & Parking Lot

A single place to **park plans and ideas that aren't being worked on right now**, so
they don't get lost in chat or memory. This is the "later" list — deliberately not
urgent. When an item is picked up, either expand it into its own `docs/<name>-plan.md`
or just work it and tick it off here.

> Detailed, in-flight plans still live in their own files (e.g.
> [`canonical-completion-plan.md`](./canonical-completion-plan.md),
> [`nav-consolidation-roadmap.md`](./nav-consolidation-roadmap.md)). This file is the
> lightweight index of what's *parked*.

**How to read an item:** each has a one-line **What**, a **Why**, its **Status** and
**Priority**, any **Links**, and the **Next step** to take when it's resumed.

---

## 🅿️ Parked

### 1. Backend consolidation — collapse Django into Next.js

- **What:** Retire the duplicated Django REST backend (Railway) and make Next.js the
  single application backend. Keep **only** the voice-AI calling service standalone
  (it's the one piece that genuinely needs an always-on Python server).
- **Why:** Right now ~12 core features are built **twice, in two languages** — every
  change risks being made in the wrong place. One codebase roughly halves the ongoing
  maintenance for a solo maintainer. _(Note: this is a **maintainability** move, **not**
  a speed one — the old ~2.5s lag was a separate US↔Singapore region issue, already
  fixed on 2026-07-07.)_
- **Status:** ✅ Decided 2026-07-07 (Decision Record "DR-001"). Not started. **No urgency.**
- **Priority:** Low — calm, reversible cleanup. Do it when there's appetite, not under pressure.
- **Safety net (already built):** the migration is proven low-risk. Running
  `node scripts/migration-checklist.mjs` reconciles Django's own routes against the
  Next.js handlers and writes [`../migration/route-status.md`](../migration/route-status.md).
  Current result: **29 route groups READY, 1 LEGACY (`hiring-requests`), 1 KEEP
  (`voice`), zero un-portable gaps.** So there is effectively nothing to port.
- **The plan when resumed (each step reversible):**
  1. Confirm whether `DJANGO_API_URL` is even set in Vercel prod (if not, Django is already dormant).
  2. Re-run the checklist script; decide the source of truth per route.
  3. Remove routes from the `next.config.mjs` proxy **one batch at a time**; watch a day each.
  4. Delete the now-dead Django twin only after a route runs clean in prod for a bake period.
  5. Land at: Next.js = the one backend; Railway holds only the standalone voice service.
- **Verify as you go:** `node scripts/measure-perf.mjs` for before/after TTFB, and Sentry
  (already installed) as a 404/5xx tripwire on `/api/*` after each cutover.
- **Links:** Decision Record (DR-001, Claude artifact) · Architecture Memo (Claude artifact) ·
  [`../migration/route-status.md`](../migration/route-status.md) ·
  `scripts/migration-checklist.mjs`.

---

## 📝 Also noted (lighter, not yet plans)

Small, real items surfaced during the 2026-07-07 architecture + performance review.
Parked here so they're not lost; each is independent of the consolidation above.

- **Optional: squeeze pages below ~0.5s.** After the Singapore region fix, logged-in
  pages sit at ~0.7–1s. Remaining cost is Clerk auth (US-based) + a few per-request DB
  queries. Only worth doing if you want it snappier; not needed. _(Priority: low)_
- **Code-health fixes (from the code review).** Independent of everything above:
  - A real bug — a mis-ordered React hook in `src/components/candidates/CandidateProfileContent.tsx`
    that can crash the candidate-profile view; plus 7 other lint errors currently hidden
    by `eslint.ignoreDuringBuilds`. **Highest-value hour.** _(Priority: medium)_
  - Two "coming soon" Sequences controls (channel selector, conditional steps) have UI but
    silently do nothing — hide behind a flag or finish. _(Priority: medium)_
  - `npm run gen:types` writes to a file nothing imports — fix the target, then retire the
    236 `as any` DB casts. _(Priority: low)_
  - No tests on the AI scorer / auto-reject logic (`src/lib/ai/job-scorer.ts`,
    `autopilot.ts`) — a quiet bug there could reject real candidates. _(Priority: medium)_

---

## ✅ Done (recent, for context)

- **2026-07-07 — Fixed the ~2.5s page lag.** Root cause: Vercel compute (`iad1`/US-East)
  was far from the Supabase DB (`ap-southeast-1`/Singapore); every query crossed ~220ms.
  Fix: moved Vercel to `sin1` (Singapore) via `vercel.json`. Jobs page **2457ms → 710ms**,
  app ~2–3× faster. See `CHANGELOG.md`.
