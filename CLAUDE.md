# RecruiterStack

AI-powered recruitment platform at [recruiterstack.in](https://recruiterstack.in). Multi-tenant SaaS ATS with 5 AI agent personas automating the full hiring lifecycle.

## Quick Reference

```bash
npm run dev          # Start dev server (localhost:3000)
npm run build        # Production build
npm run lint         # ESLint
npm run typecheck    # TypeScript check (tsc --noEmit)
npm run test         # Vitest (watch mode)
npm run test:run     # Vitest (single run)
npm run test:coverage # Vitest with coverage
npm run gen:types    # Regenerate Supabase types
npm run audit:canonical # Report direct table access by migration status
```

> **New to the codebase?** Read this file, then the canonical data-model docs in
> [`docs/`](./docs) (see [Canonical Data Model](#canonical-data-model) below).

> **Changelog convention:** when you make a meaningful change — a new feature, a
> fix, a schema/migration, a UI/color change — add a short entry to
> [`CHANGELOG.md`](./CHANGELOG.md) under the current date before finishing. Keep
> it concrete and grouped by type (`Added` / `Changed` / `Fixed` / `Removed` /
> `Schema` / `Docs`). Treat it as part of "done," like updating tests.

## Stack

- **Framework:** Next.js 14 (App Router), React 18, TypeScript 5
- **Database:** Supabase (PostgreSQL), 48+ migrations in `supabase/migrations/`
- **Auth:** Clerk (user auth + org management), multi-tenant via org_id
- **AI:** Google GenAI SDK (Gemini) — Gemini 2.5 Pro for quality tasks, Gemini 2.5 Flash for speed/cost. Call sites still pass the old Claude tier names (e.g. `claude-sonnet-4-6`); a central wrapper (`src/lib/ai/llm.ts`, Django `ai/llm.py`) translates them to Gemini, so swapping providers is a one-file change.
- **Email:** SendGrid
- **Calendar:** Google Calendar API, Microsoft Graph (Outlook), Zoom
- **Styling:** Tailwind CSS 3.4
- **Rich Text:** Tiptap editor
- **Rate Limiting:** Upstash Redis
- **Error Tracking:** Sentry
- **Hosting:** Vercel (region: iad1)
- **Testing:** Vitest + Testing Library + jsdom

## Architecture

### The 5 AI Agents

These are conceptual personas implemented across multiple endpoints and flows:

1. **Drafter** — JD generation from hiring manager intake. Uses Gemini 2.5 Pro. Flow: `/intake/[token]` → `/api/intake/[token]/generate-jd` → `lib/ai/jd-generator.ts`
2. **Scout** — Candidate sourcing & import. CSV parsing via Gemini 2.5 Flash. Endpoints: `/api/sourcing/import`, `/api/sourcing/parse-cv`, `/api/sourcing/parse-profile`
3. **Sifter** — AI scoring (0-100) with weighted rubrics. Auto-advance/auto-reject. Flow: `/api/jobs/[id]/score` → `lib/ai/job-scorer.ts` + `lib/ai/autopilot.ts`. SSE streaming for progress.
4. **Scheduler** — Interview scheduling with calendar integration. Self-schedule via `/schedule/[token]`. Agent API: `/api/agent/schedule-interview`. Calendar helpers: `lib/google/calendar.ts`, `lib/microsoft/calendar.ts`
5. **Closer** — Offer management & approval workflows. AI-drafted offer letters via `/api/applications/[id]/email-draft`

### Key Directories

```
src/
├── app/                    # Next.js pages & API routes
│   ├── (auth)/             # Sign-in, sign-up
│   ├── (dashboard)/        # Protected app pages (candidates, jobs, pipeline, etc.)
│   ├── (public)/           # Marketing pages (landing, pricing, features, etc.)
│   ├── apply/[token]/      # Public job application
│   ├── intake/[token]/     # Hiring manager intake form
│   ├── schedule/[token]/   # Self-service interview scheduling
│   └── api/                # 130+ API endpoints
├── components/             # React components (layout, candidates, dashboard, etc.)
├── lib/
│   ├── ai/                 # AI logic (jd-generator, job-scorer, matcher, autopilot)
│   ├── api/                # API helpers (cache, rate-limit, search, csv, etc.)
│   ├── copilot-tools.ts    # ~38 copilot tool definitions (Claude-format, translated to Gemini by lib/ai/llm.ts)
│   ├── domain/             # Canonical domain facades (people, candidates, applications, openings, job-pipelines, ...)
│   ├── supabase/           # Supabase clients (browser + server)
│   ├── google/             # Google Calendar integration
│   ├── microsoft/          # Outlook integration
│   ├── zoom/               # Zoom integration
│   ├── validations/        # Zod schemas
│   ├── types/              # TypeScript interfaces (database.ts)
│   ├── auth.ts             # requireOrg(), getOrgId()
│   ├── crypto.ts           # AES-256-GCM token encryption
│   ├── logger.ts           # Structured logging
│   └── notifications.ts    # In-app + Slack notifications
├── middleware.ts            # Clerk auth middleware (public vs protected routes)
└── test/                   # Test setup & helpers
```

### Auth & Multi-tenancy

- Clerk handles user auth and org management
- `requireOrg()` in `lib/auth.ts` enforces org context on all protected API routes
- All database queries scoped by `org_id`
- Public routes (apply, intake, schedule) use token-based access

### Data Flow Patterns

- **Public Application:** `/api/apply` → creates candidate + application → triggers Autopilot (fire-and-forget)
- **Autopilot:** scores candidate → auto-advances or auto-rejects + optionally sends rejection email
- **Copilot:** conversational AI with agentic tool loop → reads/writes via `executeTool()` in `lib/copilot-tools.ts`
- **Bulk Scoring:** `/api/jobs/[id]/score` → SSE stream with live progress

### Database

- Supabase PostgreSQL with 48+ migrations in `supabase/migrations/`
- Core tables: candidates, hiring_requests, applications, application_events, pipeline_stages, interviews, offers, scorecards, candidate_tasks, candidate_tags, org_settings, notifications
- Canonical (requisition/HRIS) tables: openings, jobs, job_openings, job_postings, departments, locations, compensation_bands, approval_*, people
- Types defined in `src/lib/types/database.ts`
- Regenerate types: `npm run gen:types`

### Canonical Data Model

The schema is mid-migration from a lean ATS model (`hiring_requests`, `candidates`)
toward a canonical lifecycle spine (Person → Candidate Profile → Application →
Interview → Offer → Employee Profile). **Before adding model-heavy features, read:**

- [`docs/canonical-data-model.md`](./docs/canonical-data-model.md) — target architecture & engineering rules
- [`docs/canonical-ownership-matrix.md`](./docs/canonical-ownership-matrix.md) — per-route/table/tool migration status
- [`docs/canonical-completion-plan.md`](./docs/canonical-completion-plan.md) — the active Slice 0→5 build plan

**Conventions for new work:**
- Storage changes hide behind `src/lib/domain/*` facades — call the facade, not raw `supabase.from(...)`.
- Don't add new core workflows to legacy `hiring_requests`; create canonical `jobs`/`openings`.
- Run `npm run audit:canonical` after touching model-heavy routes to confirm progress (status should improve, never regress).

### Security

- AES-256-GCM encryption for OAuth tokens at rest (`lib/crypto.ts`)
- CSRF state tokens for OAuth flows (`lib/api/oauth-state.ts`)
- Rate limiting on public endpoints via Upstash Redis
- Zod validation on all API payloads
- Security headers configured in `next.config.mjs`

## Environment Variables

Required for local dev:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_APP_URL`

Optional (features degrade gracefully):
- `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL` (email sending)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (calendar)
- `SLACK_WEBHOOK_URL` (notifications)
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (rate limiting)
- `NEXT_PUBLIC_SENTRY_DSN` (error tracking)
- `TOKEN_ENCRYPTION_KEY` (OAuth token encryption, 32-byte hex)
- `OAUTH_STATE_SECRET` (CSRF protection)
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_DEFAULT_COUNTRY` (WhatsApp via Meta Cloud API; per-org credentials live in `whatsapp_accounts`)

## Testing

37 test files covering API helpers, auth, crypto, validations, search, and domain facades. Run with `npm run test:run`.
