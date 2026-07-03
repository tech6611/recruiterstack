# Custom Domains for Careers Pages — Build Plan

Let customers serve their careers page at their **own** address — e.g.
`careers.acme.com` — instead of `recruiterstack.in/careers/acme`. This is a
standard multi-tenant SaaS feature and a natural paid-plan upsell.

> **Status:** Not started. This is a proposal/spec, not yet built.
> **Owner:** _(assign)_  •  **Target plan gate:** paid/enterprise only.

## Why

- **Trust & branding.** Candidates trust `careers.acme.com` more than a shared
  `recruiterstack.in/careers/acme` subpath. Every leading ATS (Greenhouse,
  Lever, Ashby, Workable, Teamtailor) offers this.
- **Upsell lever.** It's a classic feature to gate behind a paid tier — high
  perceived value, low incremental cost to us.
- **Low platform risk.** We host on **Vercel**, which has first-class support
  for programmatic custom domains + automatic SSL. This is well-trodden ground.

## Plain-English overview (how it works end to end)

1. In Settings, a customer types the domain they want: `careers.acme.com`.
2. Our app tells Vercel "please accept this domain for our project." Vercel
   replies with the DNS record the customer must create.
3. We show the customer that record (a single **CNAME**) and a **Verify** button
   — exactly like the SendGrid DNS step. The customer adds it in *their* DNS.
4. Once the record is live, Vercel automatically issues the HTTPS certificate
   (the padlock) — free, no work for us.
5. When a visitor opens `careers.acme.com`, our app sees the incoming domain,
   looks up which customer owns it, and shows that customer's careers page.

That's it. The only thing the customer does by hand is add one DNS record — the
same kind of task we just did in Squarespace.

## The moving parts (technical)

### 1. Data — one migration
Add to `org_settings` (or a dedicated `org_domains` table if we want multiple
domains per org later):

| Column | Type | Notes |
| --- | --- | --- |
| `custom_domain` | `text` unique nullable | e.g. `careers.acme.com`, lowercased |
| `custom_domain_status` | `text` | `pending` \| `verified` \| `error` |
| `custom_domain_added_at` | `timestamptz` | for support/debugging |

A **unique** index on `custom_domain` is essential — two orgs must never claim
the same host.

### 2. Vercel integration — a few API endpoints
Using the Vercel Domains/Projects API (needs a `VERCEL_API_TOKEN` +
`VERCEL_PROJECT_ID` in env):

- `POST /api/settings/domain` — attach domain to the Vercel project, store row
  as `pending`, return the CNAME instructions.
- `POST /api/settings/domain/verify` — ask Vercel if the domain is configured &
  the cert is issued; flip to `verified` on success.
- `DELETE /api/settings/domain` — remove from Vercel + clear the row.

Vercel handles SSL certificate issuance and renewal automatically once DNS
resolves. We never touch certs.

### 3. Host-based routing — middleware
The core logic. In `src/middleware.ts`, read the incoming `Host` header:

- If it's `recruiterstack.in` / `www` / a preview URL → behave as today.
- If it's a **known custom domain** → look up the owning org's `careers_slug`
  and internally rewrite the request to `/careers/[slug]` so the visitor sees
  that careers page at their own domain. (A `NextResponse.rewrite`, not a
  redirect — the URL bar keeps showing `careers.acme.com`.)

Caching the domain→org lookup (Redis/Upstash, already in the stack) keeps this
fast since middleware runs on every request.

### 4. Settings UI — add-domain + verify flow
Extend `CareersPageCard.tsx` (or a new card) with: an input for the domain, a
"Add domain" button, the DNS record to copy, a "Verify" button, and a status
badge (Pending / Live / Needs attention). Mirror the SendGrid UX the customer
already understands.

## Recommendations / guardrails

- **Subdomains only for v1** (`careers.acme.com`, `jobs.acme.com`). Root/apex
  domains (`acme.com`) need A/ALIAS records and are fiddlier — defer.
- **Gate behind a paid plan.** Check plan entitlement before allowing add.
- **One domain per org** to start; the `org_domains` table leaves room to grow.
- **Handle "domain already in use"** gracefully (unique constraint + friendly
  error) — a customer may try a domain another org already claimed.
- **SSL wait UX.** After DNS verifies, the cert can take a few minutes; show a
  "securing your domain…" state rather than a hard error.

## Suggested build order (phased)

| Phase | Scope | Rough effort |
| --- | --- | --- |
| P1 | Migration + Vercel add/verify/remove endpoints (no UI, test via API) | ~1 day |
| P2 | Middleware host-based routing + Redis cache | ~1 day |
| P3 | Settings UI: add/verify/status + DNS instructions | ~1 day |
| P4 | Plan-gating, "domain in use" handling, SSL-wait polish, docs | ~1 day |

**Ballpark: ~4 focused days** for a solid v1 (subdomain-only, one domain/org,
paid-gated). References: Vercel's "Multi-tenant custom domains" platform guide
and Domains API docs.

## Open questions to decide before building

1. One domain per org, or many? (Affects table vs. column.)
2. Which plan tier unlocks it?
3. Do we also want a branded **email** sending domain later (ties into the
   SendGrid domain-auth work already in flight)?
4. Apex domain support — v2, or never?
