# RecruiterStack

AI-powered recruitment platform — a multi-tenant SaaS ATS with 5 AI agent personas
that automate the full hiring lifecycle (apply → hire → employee). Live at
[recruiterstack.in](https://recruiterstack.in).

## Start here (new to the codebase?)

Read these in order — they're the "catch everything" path:

1. **[`CLAUDE.md`](./CLAUDE.md)** — the architecture reference. Stack, the 5 AI
   agents (Drafter / Scout / Sifter / Scheduler / Closer), directory map, auth &
   multi-tenancy, core data flows, env vars, and testing. **This is the single
   best overview of how the system works.**
2. **[`docs/canonical-data-model.md`](./docs/canonical-data-model.md)** — the target
   data architecture: the canonical lifecycle spine (Person → Candidate Profile →
   Application → Interview → Offer → Employee Profile) and the engineering rules
   for new work.
3. **[`docs/canonical-ownership-matrix.md`](./docs/canonical-ownership-matrix.md)** —
   the migration control plane: a per-route / per-table / per-tool status matrix
   (`canonical` / `compatibility` / `adapter` / `legacy` / `mixed`). Check this
   before touching model-heavy code so you know which generation you're in.
4. **[`docs/canonical-completion-plan.md`](./docs/canonical-completion-plan.md)** —
   the active build plan (Slice 0→5) for finishing the canonical data model. This
   is the current work-in-flight.

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

You'll need the environment variables listed in **[`CLAUDE.md`](./CLAUDE.md#environment-variables)**.
Required: Supabase, Google (Gemini), and Clerk keys. Optional integrations (email,
calendar, Slack, rate limiting, error tracking) degrade gracefully when unset.

## Common commands

```bash
npm run dev            # Dev server (localhost:3000)
npm run build          # Production build
npm run lint           # ESLint
npm run typecheck      # TypeScript (tsc --noEmit)
npm run test:run       # Vitest (single run)
npm run gen:types      # Regenerate Supabase types
npm run audit:canonical # Report direct table access by migration status
```

## Stack at a glance

Next.js 14 (App Router) · React 18 · TypeScript 5 · Supabase (PostgreSQL) ·
Clerk (auth + orgs) · Google GenAI SDK (Gemini 2.5 Pro/Flash) · SendGrid · Tailwind ·
Vitest. Hosted on Vercel. See [`CLAUDE.md`](./CLAUDE.md) for the full breakdown.

## Repo conventions

- **Multi-tenant:** every tenant-scoped read filters by `org_id`; every write sets
  it explicitly. `requireOrg()` in `src/lib/auth.ts` enforces this on protected routes.
- **One concept, one facade:** storage changes hide behind `src/lib/domain/*`.
  New model-heavy code should call a domain facade, not raw `supabase.from(...)`.
- **Migrations** live in `supabase/migrations/` and are additive/reversible — see
  the guardrails in the completion plan.
- Run `npm run audit:canonical` before adding major features or after touching
  model-heavy routes.
</content>
</invoke>
