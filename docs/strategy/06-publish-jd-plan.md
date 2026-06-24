# 06 — Publish JD: gap analysis, market patterns & build plan

> **Date:** 2026-06-24
> **Author:** Working session with the founder.
> **Scope:** Feature plan for "Publish JD" — how a job goes from created → a
> well-formatted, candidate-facing posting. Phase 1 is implemented in the same
> session; Phases 2–3 are scoped for later sessions.
> **Status:** Phase 1 = building now. Phases 2–3 = planned, not started.

---

## 1. The problem we found

When you create a job, the form collects a lot — Team context, Key
requirements, **Nice to have**, Target companies, level, budget, notes. But:

- Only three fields become "real" columns the app reads back: `title`,
  `department`, and `description` (the JD body).
- Everything else is saved into a single hidden JSON bag,
  `jobs.custom_fields.intake`. **No screen ever read that bag back out** — so
  the fields you filled looked like they vanished.

Concretely, before this work:

- **Job detail → Overview** showed only `description` (labelled "Internal
  context").
- **Public apply page** showed the *same* `description` (labelled "About the
  role"), inside a small scroll box that truncated long text — and nothing
  else.

That single `description` field was doing all the work. That's why the apply
page looked thin next to a structured posting like Multiplier's
(`careers.kula.ai/usemultiplier/...`), which breaks the JD into *What you'll
do / You'll be successful if / What we're looking for / What we offer*.

### Data collected vs. shown (before Phase 1)

| Field (at job creation) | Stored where | Shown on job detail | Shown on apply page |
|---|---|---|---|
| Title | `jobs.title` | ✅ | ✅ |
| Department | `departments.name` | ✅ | ✅ |
| Description / JD | `jobs.description` | ✅ (Internal context) | ✅ (About the role) |
| Team context ("what they do") | `custom_fields.intake.team_context` | ❌ | ❌ |
| Key requirements | `custom_fields.intake.key_requirements` | ❌ | ❌ |
| Nice to have | `custom_fields.intake.nice_to_have` | ❌ | ❌ |
| Target companies | `custom_fields.intake.target_companies` | ❌ | ❌ |
| Level / seniority | `custom_fields.intake.level` | ❌ | ❌ |
| Notes | `custom_fields.intake.notes` | ❌ | ❌ |
| Budget min/max | openings + intake | partial (linked reqs) | ❌ |

**Also absent today (whole-product gaps):** no branded company career page that
lists all of a company's jobs; no company logo/colours on public pages; no
custom screening questions (the apply form is hardcoded: name, email, phone,
LinkedIn, résumé, cover letter — identical for every job).

---

## 2. How other ATSs publish jobs to a company's career page

Two mechanics do the heavy lifting.

### A) Each company (tenant) gets a hosted, themed careers page

The snapshot `careers.kula.ai/usemultiplier/38703` is the giveaway: **Kula**
(the ATS) hosts a page for **usemultiplier** (its customer). Every ATS does one
of these:

| Model | Example URL | Who controls the look |
|---|---|---|
| Hosted board, subpath | `careers.kula.ai/{company}` | ATS template; company sets logo + colour |
| Hosted board, subdomain | `jobs.lever.co/{company}` | same |
| **Job Board API / embed** | Greenhouse/Lever JSON feed pulled into the company's own Webflow/WordPress site | Company's own site design |

Small/mid companies use the hosted board (zero engineering). Bigger companies
use the **embed API** so jobs render inside *their own* marketing site.
RecruiterStack today has neither — only single, token-gated `/apply/[token]`
links.

### B) Consistent formatting comes from structure, not discipline

Every job on a board looks identical because the JD is split into **named
sections** (about / responsibilities / requirements / nice-to-have / benefits),
and **one page template** renders those sections the same way for every job.
Recruiters fill fields; they don't format. Companies also set reusable
**boilerplate blocks** (the "About us" intro + EEO statement) that auto-attach
to every posting — which is exactly why Multiplier's "What do we do?" intro is
word-for-word the stored description.

**Implication for us:** the path to consistent, professional postings is to
*store the JD as sections and render them through one template* — not to ask
recruiters to format text well.

---

## 3. How other ATSs let users build custom JDs + screening questions

This is an **application-form builder**. How Greenhouse / Lever / Ashby do it:

1. **A question library + a form per job.** Recruiters assemble a form from
   reusable questions. Field types: short text, long text, dropdown,
   multi-select, yes/no, number, date, file upload.

2. **Common reusable questions** (the "work authorization" type):
   - "Are you legally authorized to work in {country}?"
   - "Will you now or in the future require visa sponsorship?"
   - Notice period / earliest start date
   - Salary expectation
   - Years of experience in X

3. **Knockout (disqualifying) questions.** A question can carry a "required
   answer." A wrong answer auto-rejects or flags the candidate. *"Authorized to
   work? → No"* knocks the candidate out automatically. This is the single
   highest-value screening feature.

4. **Compliance / EEO questions kept separate.** Gender, race, veteran,
   disability — voluntary, hidden from the hiring team, stored apart for
   reporting. Legally must not influence screening.

5. **Scoping: org default + per-job override.** There's a default form every
   job inherits, and recruiters add job-specific questions on top. Set "work
   authorization" once globally; add "Native French speaker?" only on the EMEA
   role.

**What our codebase already left as a hook:** `job_postings.application_form_id`
exists but is unused, and the channel enum already lists
`careers_page / linkedin / indeed / glassdoor / custom`. So Phase 3 wires up
existing placeholders rather than inventing new concepts.

---

## 4. The build plan (smallest-value-first)

### Phase 1 — Make the JD we already collect actually show up *(this session)*

Display-only. **No database changes, no migrations** — lowest possible risk.

- Read the intake fields we already store (`team_context`, `key_requirements`,
  `nice_to_have`) and render them as proper sections.
- **Public apply page:** show *About the role* (description), *What you'll do*
  (team context), *What we're looking for* (key requirements), and *Nice to
  have* — each as its own section. Remove the truncating scroll box.
- **Internal job detail → Overview:** show the same sections plus the
  internal-only context (level, target companies, notes) the team filled in.

Sensitive intake (hiring-manager name/email/Slack, budget, target companies,
notes) stays **internal-only** — never rendered on the public apply page.

**Why first:** it fixes the bug you actually reported (vanishing fields) and
makes the product look credible, with effectively zero schema risk because the
data is already in the database.

### Phase 2 — Branded company career page *(later session)*

- Add `logo_url`, `brand_color`, and a `careers_slug` to company settings.
- Build a public `/careers/[company-slug]` page that lists all of that
  company's open jobs, plus themed per-job pages — replacing the bare token
  link.
- Optional follow-on: a JSON feed so customers can embed jobs in their own site.

### Phase 3 — Screening questions / application-form builder *(later session)*

- New tables: `application_forms`, `form_fields` (question library),
  `application_answers`.
- Wire the existing `job_postings.application_form_id` to a real form.
- Add knockout logic on apply-submit (auto-reject on a disqualifying answer);
  keep EEO questions in a separate, hidden bucket.

---

## 5. Phase 1 — exactly what changes

| File | Change |
|---|---|
| `src/modules/ats/domain/job-pipelines.ts` | Extend `CanonicalApplyJobPreview` + `getCanonicalApplyJobPreview` to also return `responsibilities` (team context), `requirements`, `nice_to_have` read from `custom_fields.intake`. |
| `src/app/apply/[token]/page.tsx` | Render the JD as sections (About / What you'll do / What we're looking for / Nice to have). Drop the `max-h-64` scroll box. |
| `src/components/req-jobs/JobDetail.tsx` | On the Overview tab, render the intake sections (team context, requirements, nice to have) plus level, target companies and notes when present. |

No migrations. No change to what the apply form *collects* (Phase 3 territory).

---

*End of Publish JD plan. Phase 1 ships this session; Phases 2–3 are queued.*
