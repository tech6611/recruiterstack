# Juicebox visual parity — candidate profile & icons

**Date:** 2026-09-26
**Scope chosen:** the ATS candidate profile (`/candidates` and `/candidates/[id]`).
**Deferred by decision:** funding-stage chips ("Series F through Post IPO").
**Logo strategy chosen:** layered — logo.dev (keyed) → favicon service → monogram.

> Read against `origin/main`. The local checkout was 82 commits behind when this was
> written; implement from `origin/main`, not from the stale tree.

---

## 1. What Juicebox actually shows

From the reference screenshot, two surfaces.

**Result card (list):** name + a row of source icons (LinkedIn / GitHub / site) with a
`+N` overflow · location · current role as *[company logo] Title at Company · dates* ·
prior roles as indented hollow-bullet lines · an education line with a school logo ·
an AI summary paragraph with key phrases highlighted.

**Profile drawer:** name + right-aligned social icon row · location · a chip row of
*[logo] Company* and *[logo] School* · an action bar · tabs **Overview / Experience /
Education / Skills / More** · then labelled rows (Status, Email, Phone, Tags) and an
**Experience** section headed `· 10 years total · 4 years average tenure`, each entry a
32px company logo beside title, company, `Jul 2024 - Present · 2 yrs 2 mos`, location —
with roles at one employer grouped under a single logo and a **Promotion** badge on the
step up.

The visual signature is three things: **an icon on every entity**, **a dated grouped
work history**, and **durations computed everywhere**.

## 2. Where we stand

| Juicebox element | RecruiterStack today |
|---|---|
| Company logo | `CompanyLogo` exists — but **its provider is dead** (see §3), so every logo in the app is silently a grey initial |
| School logo | none |
| Social icon row | LinkedIn only, as an editable text row in the left rail |
| Tabs | `Summary` / `Activities & Progress` |
| **Experience timeline** | rendered, but as a flat bullet list — `CandidateHistoryPanel`, fed by `GET /api/candidates/[id]/enrich`. No logos, no durations, no employer grouping, and the roles' `summary` text was fetched and discarded |
| **Education** | rendered as one plain line per entry, no school marks |
| Durations, total, average tenure | none; only a flat `experience_years` number |
| Employer grouping / Promotion badge | none on the ATS side (the logic exists in `modules/pool/domain/profile-tags.ts`) |
| Skills | chips in the left rail, folded at 6 |
| Avatar | coloured initials (`lib/ui/avatar`) |

> **Correction (2026-09-26).** An earlier draft of this plan said the work history was
> never rendered anywhere. That was wrong — `CandidateHistoryPanel` has been showing it
> on the Summary tab, fed by its own endpoint rather than the candidate detail API,
> which is why a grep of that route missed it. Step 1 was re-scoped accordingly: no API
> work was needed, only the presentation.

**The data is already there.** Measured on the live database:

- 12 of 15 candidates have dated role rows — 77 rows, **all 77 carry a `start_date`**, 76 an employer
- 12 of 15 have education JSON, LinkedIn URLs and skills
- the pool holds 423 profiles / 1,313 role rows for the later phase

So Phases 1–3 are a front-end build. Nothing needs re-fetching or re-buying.

## 3. The icon problem, measured

`src/lib/company-logo.ts` points at `logo.clearbit.com`. **That host no longer
resolves** — a request to it fails at the connection, so `<CompanyLogo>`'s `onError`
fires every time and the app has been rendering grey initials everywhere. Verified:

| Provider | Result |
|---|---|
| `logo.clearbit.com` | connection failure — dead |
| `google.com/s2/favicons` | 200, real logos for Figma, Vanta, Airbnb, Razorpay, Plivo, Zoho, Notion, virginia.edu |
| `img.logo.dev` | 401 without a token; free tier needs a signup key |

Two cautions the design must absorb:

1. **Google returns a generic globe rather than a 404** when it has nothing. IIT Madras
   (`iitm.ac.in`) returns byte-for-byte the same image as a domain that doesn't exist.
   A resolver must detect that fallback and prefer our own monogram over a meaningless globe.
2. **The tail is long.** 729 distinct employers across 1,000 role rows; the top 50
   employers cover only 24% of rows, the top 150 only 41%. Names arrive dirty —
   `GOLDMAN SACHS` beside `Goldman Sachs`, `Boston Consulting Group (BCG)`, `Freelance`,
   `E-Cell IIT Madras`. **The monogram is the common case, not the exception** — it has to
   look deliberate, or the screen will read as broken.

## 4. Plan

### Phase 0 — One icon pipe (`BrandIcon`)

The "all the icons show similarly" requirement. One component, one resolver, everywhere.

- **`src/lib/brand-icon.ts`** (retires `company-logo.ts`) — name → domain. Suffix
  stripping, an alias table for the dirty head (`GOLDMAN SACHS`, `BCG`, `Bain & Company`,
  `Facebook`/`Meta`), a school table for the institutions that dominate our data (IITs,
  IIMs, SRCC, PES, Christ), and a deny-list for non-employers (`Freelance`,
  self-employment, campus societies) that goes straight to a monogram. Pure, unit-tested.
- **`brand_domains` table** — `(name_norm pk, kind, domain, icon_status, checked_at)`. A
  resolution is learned once and hand-correctable, instead of re-guessed per render.
- **`/api/brand-icon`** — server proxy: logo.dev when `LOGODEV_TOKEN` is set → favicon
  service → generic-globe detection → 404. Long `Cache-Control`, negative caching.
  Server-side on purpose: hotlinking from the browser would leak every candidate's
  employer list to a third party on every page view.
- **`<BrandIcon>`** — sizes 16/20/32, square-rounded for companies and schools, circular
  for people, monogram fallback on the existing `lib/ui/avatar` palette. Replaces
  `CompanyLogo` **and** the duplicate copy inside `PersonaTabs.tsx:176`.

*Fixing this alone repairs logos on the persona tabs and ideal-profile tiles, which are broken today.*

### Phase 1 — Surface the history we already store — **DONE**

- No API change was needed: `GET /api/candidates/[id]/enrich` already returns the dated
  roles, the education and the derived movability.
- **`src/lib/ui/work-history.ts`** — pure and tested: `"2 yrs 2 mos"` formatting, total
  experience, average tenure, grouping roles by employer, promotion detection. Lift the
  rules already proven in `pool/domain/profile-tags.ts` rather than writing new ones, so
  the pool and the ATS can't drift apart.

### Phase 2 — The profile drawer — **partly done in Phase 1**

`<ExperienceTimeline>` and `<EducationList>` were built and are live inside the existing
Career-history panel. What remains here is the tab restructure and the Overview tab.


- Tabs become **Overview / Experience / Education / Skills / Activity**.
- **`<ExperienceTimeline>`** — roles grouped under one employer logo, connector rail,
  nested promotion rows with a **Promotion** badge, section header reading
  `Experience · 10 years total · 4 years average tenure`.
- **`<EducationList>`** — school icon + degree line.
- **Overview** = labelled rows (Status / Email / Phone / Tags) + the three most recent
  roles + education, which is Juicebox's Overview exactly.

### Phase 3 — Header and list

- Profile header: name, social icon row (LinkedIn / GitHub / site / résumé) with `+N`
  overflow, location, and the logo chip row (current company · top school).
- `/candidates` rows rebuilt as Juicebox result cards: logo + *Title at Company* + dates,
  indented prior roles, education line.

### Phase 4 — Optional, outside the chosen scope

Drop the same primitives into `/pool` and the job Source tab. Cheap once Phases 0–2 exist;
the Source tab is the larger job because it's a scorecard spreadsheet today, not a card list.

## 5. Deliberately not built

- **Funding-stage chips** — needs a company dataset (Crustdata's company endpoint, credits
  per company). A data project, not a visual one.
- **Company news items** ("Oct 2025 · Figma Agents… Read more") — same dependency.
- **Compensation estimate** — no source.
- **Candidate photos** — LinkedIn photos aren't available to us. GitHub avatars are free
  for the 108 pool profiles with a GitHub identity; everyone else keeps the initials circle.

## 6. Risks

- **Monogram density.** With the tail this long, many rows will show initials. Mitigated by
  designing the monogram as a first-class mark, not an error state.
- **Schools resolve worse than companies.** The favicon service already fails on IIT Madras;
  the school alias table carries more weight than the company one.
- **logo.dev needs a signup key.** Without it the layered resolver still works, one tier down.
- **Verification.** Signed-in pages are Clerk-gated, so review happens on a dev fixture page
  (`/dev/candidate-preview`, mirroring `/dev/sourcing-preview`) plus unit tests on the pure
  helpers — not on a live browser preview.

## 7. Open — screenshots still needed

The reference covers the Overview tab. For pixel fidelity I still need the drawer's
**Experience**, **Education**, **Skills** and **More** tabs, and the list's grid/table toggle view.
