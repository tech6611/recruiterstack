# Changelog

A running log of notable changes to RecruiterStack — new features, fixes, schema
changes, UI/visual changes, and anything else worth knowing at a glance. Newest
entries on top.

> **How to use this file:** add an entry under the current date whenever you make a
> meaningful change. Group entries by type — `Added`, `Changed`, `Fixed`,
> `Removed`, `Schema` (migrations), `Docs`. Keep each line short and concrete.
> This file is part of the workflow — see the "Changelog" note in `CLAUDE.md`.

## 2026-06-28

### Added
- **Candidates page: time filter + full-width search + responsive funnel.** Added
  a time filter (All time / 7d / 30d / 3m / custom range, by candidate
  created_at) mirroring the Jobs page; the search bar now stretches full-width;
  and the hiring-funnel stage cards flex to fill the available width (no more
  fixed-width cards with horizontal scroll). (`app/(dashboard)/candidates/page.tsx`.)
- **Pause / Resume for live jobs (reversible).** A live (`open`) job can now be
  **Paused** — it stops accepting new applicants (the public apply link freezes)
  and any live job-board postings go dark, but everything is preserved. **Resume**
  flips it back to `open` and revives the *same* apply link. New routes
  `POST /api/req-jobs/[id]/pause` and `/resume`; new `job.paused` / `job.resumed`
  webhook events. Pause/Resume buttons on the job detail page.

### Schema
- **Migration 074** adds `paused` to the `jobs` status CHECK constraint and
  documents the new ladder: `open ⇄ paused` (reversible) vs. `open|paused →
  withdrawn` (terminal, link killed). `JobStatus` type + `jobUpdateSchema` enum
  updated to match.

### Changed
- **"Withdraw" is now terminal (a job killed for good), not a reversible pause.**
  Previously Withdraw took a job off the market but could be re-published — that
  reversible behaviour now lives in **Pause/Resume**. Withdraw now clears the job's
  `apply_token`, so the public application link dies permanently and cannot be
  revived, and it can be triggered from `open` *or* `paused`. The publish route no
  longer accepts `withdrawn → open` (only `approved → open`); the withdraw confirm
  dialog and status badge (now red) reflect the terminal meaning.
- This is **Phase 1** of the job-lifecycle redesign (state model). Phases still to
  come: locking the approved substance — JD/key requirements/nice-to-haves — on
  live jobs, a JD word-change diff that re-triggers approval, and a "create new
  version" clone flow for materially different roles.
- **List & data pages now fill the full page width.** Candidates, Settings, the
  approvals inbox & approval chains, permissions, the sequences list, sourcing,
  and the req-jobs list dropped their `max-w-*` width caps so they stretch across
  the whole content pane like Jobs & Requisitions. Previously several (candidates
  especially) were pinned to a narrow left column with wasted space on the right
  and a horizontal scroll. Forms, single-record detail, and document pages keep
  their readable capped width on purpose.
- **Lighter, distinct summary-card colours on the list pages.** The Jobs /
  Candidates / Requisitions summary tiles used "medium" warm tints that read
  heavy, and two hues repeated (sand on Total + Closed, near-identical
  amber/gold on Awaiting + Active). Softened every tint one notch and gave each
  card its own hue — sand · honey · sage · clay · stone — by lightening the four
  existing tones in `src/lib/ui/stat-tones.ts` and adding a new `stone` tone for
  the Closed card (Jobs + Openings now use it). No layout changes.
- **Discard is now reachable without scrolling when editing a job.** While the
  job edit form is open, "Save changes" and a "Discard" button appear in the top
  action bar (where "Edit" was), so you can back out instantly instead of
  scrolling to the bottom of the long form. The bottom Save/Discard buttons
  remain too.
- **Job description is now a rich-text field.** On the job detail edit form, "Job
  description" uses the same formatting editor (bold, lists, headings, links) as
  What they'll do / Key requirements / Nice to have, instead of a plain text box.
  Existing plain-text descriptions are converted to paragraphs on first edit so
  their structure is preserved, and the read view renders the formatting via
  `RichText`. The candidate apply page already rendered it richly, so formatting
  now flows end-to-end.
- **Summary stat cards now use a warm tinted treatment.** The cards atop Jobs,
  Candidates, and Requisitions moved from flat white tiles to soft, on-brand
  tints matched to each status (sand/neutral · amber waiting · pine ready · gold
  live/milestone), via a shared `lib/ui/stat-tones` helper. The selected filter
  (Candidates) keeps an espresso ring. Tints tuned ("Medium" strength) for clear
  contrast against the cream page background.

### Fixed
- **Couldn't save JD edits on non-draft jobs ("Cannot edit a job with status
  '…'").** The job update validation schema (`jobUpdateSchema`) inherited
  `.default()` values from the create schema, so a PATCH that only sent
  `description` + `custom_fields` was silently re-injected with
  `department_id`/`confidentiality`/`hiring_team_id`. The route then saw those as
  edits to locked identity fields and rejected the whole save with a 409 — on
  approved, open, *and* withdrawn jobs. Rebuilt `jobUpdateSchema` as a plain
  partial with no defaults so omitted fields stay absent. Also stops draft edits
  from clobbering `hiring_team_id` to null.
- **Stat-card tints weren't rendering (Tailwind wasn't scanning `src/lib`).** The
  Tailwind `content` globs listed `src/pages`, `src/components`, and `src/app` but
  not `src/lib`, so arbitrary color classes defined in `lib/ui/stat-tones` were
  never generated — leaving most cards uncolored. Broadened the glob to
  `./src/**/*` so helper-defined classes are picked up.
- **Req-job status badge updates without a page refresh.** On the job detail page the
  status pill next to the title (and the status-driven action buttons) now re-read the
  job from the server right after an approval/submit/publish/withdraw, and again when
  you return to the tab — so it no longer lags behind the audit log showing the same
  change. The job is held in local state and refreshed via `GET /api/req-jobs/[id]`
  instead of relying on `router.refresh()` alone (which could leave the badge stale).

### Added
- **Preview the candidate application form.** The Application form tab has a new
  **Preview** button (next to Save form) that opens a full, on-brand preview of the
  apply page exactly as a candidate sees it — your company logo/colour/font, the JD
  sections, the always-collected built-in fields, and your custom questions. It uses
  your current unsaved edits and runs the conditional show/hide logic live (answer a
  controlling question and dependent questions appear). Nothing is submitted. The
  question renderer is now shared with the live apply page (`components/apply/
  screening-fields.tsx`) so the preview can never drift from the real form.
- **Copy an application form from another job.** The Application form tab now has a
  **"Copy from another job"** button (next to Add question / Add from library) that
  lists your other jobs and drops the chosen job's custom questions onto this form.
  Field ids are regenerated and conditional show/hide rules (`visible_when`) are
  re-pointed at the new ids so copied logic keeps working. Review and Save as usual.
- **Soft nudge before publishing a bare form.** Publishing a job whose application
  form has no custom questions now shows a confirmation — **"Add screening
  questions"** (jumps to the form tab) or **"Publish anyway"**. It guides without
  blocking; built-in fields (name, email, phone, LinkedIn, résumé, cover letter)
  are always collected regardless.
- **Set scoring criteria at the job level.** The weighted rubric the AI uses to
  judge candidates was only reachable inside a candidate's Scorecards tab — so on
  a job with no candidates yet there was no way to see or edit it. Added a
  **"Scoring criteria"** button in the job detail header next to **Autopilot**
  (and in the ⋯ More menu on narrow screens) that opens the same editor in a
  no-candidate mode, with a green dot when custom criteria are set. Saves through
  the existing `PATCH /api/req-jobs/[id]` (`custom_fields.scoring_criteria`); no
  backend change.
- **Edit the full job description from the job detail page.** The Overview edit
  form previously only exposed Title / Department / Confidentiality / a single
  "Internal context" box. It now lets you edit the complete JD — Level, Job
  description, "What they'll do", Key requirements, Nice to have (rich-text with
  bullets/bold), plus Target start date and Notes. Requirements/nice-to-have/JD
  are editable at any status, so the old jobs that lost their bullets can be fixed
  by re-pasting.

### Changed
- **Identity fields lock once a requisition is approved.** Title, Department,
  Confidentiality, Hiring manager and Location become read-only after a job leaves
  Draft (shown but not editable); the JD body and requirements/nice-to-have/level
  content stay editable. Editing is now available in `approved`/`open`/`withdrawn`
  states, not just `draft`. The `PATCH /api/req-jobs/[id]` route now treats the JD
  body (`description`) as editable at any status while keeping the other structural
  identity fields draft-only.
- Renamed the detail page's "Internal context" field to "Job description" (it was
  always the candidate-facing JD body, not internal notes).

### Fixed
- **Sidebar no longer "cuts off" on long pages.** The dashboard now uses an
  app-shell layout (Gmail/Linear/Notion pattern): the outer frame is fixed to one
  screen, the brown sidebar is a full-height fixed panel, and only the `<main>`
  content pane scrolls. Previously the sidebar was `h-screen` inside a
  `min-h-screen` flow, so on tall pages it ended after one viewport and showed bare
  background below. Changed the shell to `h-screen overflow-hidden` with the
  sidebar at `h-full`.

## 2026-06-26

### Fixed
- **Dashboard "Add widget" silently did nothing on a custom view.** Views and the
  "last active view" are stored under separate preference keys and could drift
  apart (e.g. an orphaned active-view id left over after a data wipe). The render
  layer tolerated the mismatch by falling back to the first view, but the
  add/remove/reorder handlers looked up the raw `activeViewId`, found nothing, and
  no-op'd — so the customizer looked editable but clicks did nothing. Handlers now
  target the resolved on-screen view, and a stale `activeViewId` is snapped back to
  the first view after hydration.

### Added
- **Job descriptions keep their formatting (bullets, bold) end-to-end.** The
  Team context / Key requirements / Nice-to-have fields were being flattened to
  plain text on save (via `stripHtml`), so pasted bullet lists rendered as
  spaced-out paragraphs and stray `&nbsp;` leaked through. They now store the
  editor's rich HTML and render it as formatted text — with real bullet markers
  — on both the internal job detail page and the public application page. New
  reusable `RichText` renderer sanitizes the HTML with DOMPurify before display
  (the apply page is public), and falls back to plain-text rendering for older
  records. The AI JD preview still receives stripped plain text, and the scorer
  is unaffected (it reads these fields as null for canonical jobs).

## 2026-06-25

### Added
- **Withdraw a posted job.** A live (Open) job can now be **Withdrawn** from its
  detail page — a new paused-but-revivable stage distinct from the terminal
  **Archive**. Withdrawing immediately makes every corresponding public
  application link defunct (the apply route and apply preview gate on
  `status = 'open'`) and switches off any live job-board postings. A withdrawn
  job can be **Re-published** (withdrawn → open), which reuses the original
  apply token so previously-shared links revive. Withdrawn jobs show under the
  **Past** block on the Jobs list. New endpoint `POST /api/req-jobs/[id]/withdraw`;
  publish endpoint now accepts re-publish from `withdrawn`. Emits a new
  `job.withdrawn` webhook.

### Schema
- **Migration 073** widens the `jobs.status` CHECK constraint to include
  `'withdrawn'`. Additive/idempotent; ladder is now
  draft → pending_approval → approved → open → (withdrawn ⇄ open) → closed/archived.

### Changed
- **Requisitions and Jobs pages now split into "Active" and "Past" blocks.** Each
  page previously had a single table filtered by clickable stat cards. Both now
  show two clearly separated, self-contained blocks — each with **its own search
  bar** — an **Active** block (in-flight work) on top and a **Past** block
  (terminal records) below, with accentuated borders. On Requisitions, Active =
  Draft/Pending/Approved/Open and Past = Filled/Closed/Archived; both blocks share
  the same simple table. On Jobs, Active keeps the full-featured table
  (drag-reorder, customizable columns, time + per-column filters, search) while
  Past is a simple closed/archived list with its own search. Stat cards on both
  pages are now a static at-a-glance overview (no longer click-to-filter); in-table
  status filtering on Jobs remains via the column-header filter.
  (`app/(dashboard)/openings/page.tsx`, `app/(dashboard)/jobs/page.tsx`.)
- **Rebrand polish — new logo mark + on-brand onboarding banner.** New
  RecruiterStack mark (`BrandMark`): a layered "stack" glyph in a warm cream tile,
  replacing the green lightning bolt in the sidebar (desktop + mobile); wordmark
  now emphasises "Stack". The "Finish setting up RecruiterStack" banner is
  re-skinned off green — espresso rocket tile + progress bar, a purpose-built icon
  per setup task (departments → building, locations → pin, approvals → shield/
  branch, requisition → clipboard, job → briefcase, teammate → person, calendar),
  and an espresso "done" tick instead of the green checkbox. Removed the throwaway
  `/brand-lab` and `/logo-lab` preview routes.
- **Platform rebrand — Stage 2: card consolidation.** Unified every "card"
  surface onto one shared system to remove the scattered, inconsistent-card look.
  The `Card` component gained variants (flat default / elevated / interactive /
  ghost) plus `Panel` (boxed surface + header bar) and `Section` (headed region,
  no box). Reusable `StatsCard` and `MatchCard` now route through it; the list
  pages (Requisitions, Jobs, Candidates) got uniform flat stat tiles (pine ring
  for the active filter) and flattened table surfaces; candidate detail tabs
  (Activities, History, Funnel, Emails, Forms, Referrals) and `WhatsAppCard`
  moved off inline `rounded-* border bg-white` wrappers onto `<Card>`/`<Panel>`
  (shadows dropped for a flat look); and the dashboard's category accents and
  overview cards were neutralized to a calm, uniform look. Surface-only — inner
  content, colors, and behavior unchanged.
### Fixed
- **Dashboard "Active Jobs" widget counted archived/closed jobs.** The
  `top_jobs` list in `/api/dashboard` sliced the first 6 jobs with no status
  filter, so archived and closed roles still showed as active. Now excludes
  `archived` and `closed` before building the list.
- **Stop stranding members on "Set up your workspace."** When a signed-in user's
  Clerk session had no *active* organization selected (e.g. after a token
  refresh, a new device, or a transient Clerk blip), `OrgGate` redirected them to
  `/org-setup` even though they were a member of an org with all their data
  intact. It now checks the user's memberships first and silently re-activates
  their workspace (`setActive`), only redirecting when they genuinely belong to
  zero orgs. Also, the server fallback `lookupOrgId` (`lib/auth.ts`) no longer
  treats a *failed* Clerk API call as "no membership" — it logs the failure so a
  transient outage is diagnosable rather than silently looking like an absence.
  (`components/OrgGate.tsx`, `lib/auth.ts`.)

### Added
- **Publish JD — Phase 3e: EEO / voluntary compliance reporting.** A new
  **EEO report** page (`/analytics/eeo`) shows anonymous, aggregate counts of the
  voluntary disclosures candidates give on the apply form — response rate plus a
  bar breakdown per question. The figures are **counts only, with no link to any
  candidate, application, or job**, so demographic data can never be tied back to
  a person or sway a hiring decision. It sits behind a brand-new **Compliance ·
  View** permission (`compliance:view`) — separate from the recruiting and
  analytics permissions, so the hiring team can't see it; workspace owners get it
  by default, and it shows up automatically as a new row in the Team & Permissions
  grid. Reached via a permission-gated "EEO report" link on the Analytics page.
  (`lib/permissions.ts`, `modules/ats/domain/reporting.ts`,
  `app/api/analytics/eeo/route.ts`, `app/(dashboard)/analytics/eeo/page.tsx`,
  `app/(dashboard)/analytics/page.tsx`.)
- **Publish JD — Phase 3d: conditional questions (show/hide based on an earlier
  answer).** In the **Application form** builder, any question can now be set to
  appear only when an earlier yes-no / choice question was answered a certain way
  (a new "Only show this question based on an earlier answer" rule:
  controlling question → *is / is not* → value). On the public apply page,
  conditional questions stay hidden until their controlling answer matches, and
  hidden questions are skipped for required-answer and knockout checks — both in
  the browser and re-checked server-side, so a candidate can't be blocked or
  knocked out by a question they never saw. The apply preview now returns each
  field's visibility rule (knockout rules still stay server-only).
  (`components/req-jobs/ScreeningTab.tsx`, `app/apply/[token]/page.tsx`,
  `app/api/apply/route.ts`, `modules/ats/domain/screening.ts`,
  `modules/ats/domain/job-pipelines.ts`.)
- **Publish JD — Phase 3c: candidates can answer screening questions, and
  knockout rules fire.** The public apply page (`/apply/[token]`) now renders a
  job's custom questions under an **"Additional questions"** section, with the
  right input for each field type (short/long text, yes-no, single/multiple
  choice, number, date, URL; file-type asks for a link for now) and a
  **"voluntary"** tag on EEO questions. Required questions are enforced before
  submit. When a candidate gives a **disqualifying answer**, the application is
  silently saved as **rejected** and skipped by AI scoring — the candidate still
  sees the normal success screen. **EEO answers** are stored in a separate hidden
  bucket, and knockout/conditional rules are never exposed to the candidate (the
  apply preview returns a public-safe field shape). The apply API re-loads the
  form server-side to attach labels, evaluate knockouts, and split EEO answers.
  (`app/apply/[token]/page.tsx`, `app/api/apply/route.ts`,
  `modules/ats/domain/job-pipelines.ts`, `modules/ats/domain/applications.ts`,
  `modules/ats/domain/screening.ts`, `lib/validations/applications.ts`.)

### Changed
- **Platform rebrand — "Warm Confident" (Direction D), Stage 1: foundations.** A
  brand overhaul of the in-app platform (not the marketing site). Redefined the
  Tailwind `emerald` scale as a pine green (brand accent → `#15604a`) and the
  `slate` scale as a warm sand→bark neutral ramp, so the whole app re-skins from
  `tailwind.config.ts` without per-file edits. Page background is now warm cream
  (`#faf7f2`); headings use a new display font (Plus Jakarta Sans, loaded as
  `--font-display` and applied to h1–h4); body stays Inter. The sidebar (desktop
  rail + mobile drawer) is now espresso (`#221b14`) with light-on-dark nav. A
  throwaway preview of all directions lives at `/brand-lab`.
  (`tailwind.config.ts`, `globals.css`, `layout.tsx`,
  `components/layout/Sidebar.tsx`.) Stage 2 (card consolidation) is next.
- **Platform rebrand — Stage 1b: single-accent palette.** Followed the
  foundations by collapsing the app's competing accent colors onto one brand
  color. Stray non-token greens (`green-*`/`teal-*` + hardcoded `#10b981` etc.)
  and cool grays (`gray-*`/`zinc-*`) were folded into pine/warm-slate; then the
  whole "rainbow" of decorative accents (`blue` — 400+ uses — plus `indigo`,
  `sky`, `violet`, `purple`, `cyan`, `pink`) was demoted to warm neutral across
  64 in-platform files. Pine is now the sole accent (primary actions, active
  states, positive statuses); only amber (warning) and red (danger) remain as
  semantic colors. Avatars and the score scale keep their colors on purpose.
  Public/marketing pages, emails, and `/brand-lab` were left out of scope.
- **Platform rebrand — Stage 1c: espresso action buttons.** Recolored the solid
  pine buttons to the sidebar's espresso brown (`#221b14`, hover `#33271b`) so
  the platform reads as a two-tone system: espresso = primary action, pine =
  accent / positive state. Only genuine buttons changed (filtered on the
  interactive hover state), so checkmarks, step indicators, status dots, the
  sidebar logo, and outline/text accents stay pine. Shared `Button` primary
  variant + ~40 in-platform files; marketing pages left out of scope.

## 2026-06-24

### Added
- **Publish JD — Phase 3b: recruiter application-form builder.** Job detail pages
  now have an **"Application form"** tab where recruiters build the questions a
  candidate answers when applying. Add, reorder, and delete questions; choose a
  field type (short/long text, yes-no, single/multi choice, number, date, file,
  URL); edit choices; mark a question required or EEO/voluntary (hidden from the
  hiring team); and set a knockout rule that will auto-disqualify on a given
  answer. "Add from library" reuses saved questions and the bookmark icon saves a
  question back to the org's library for reuse. New API routes
  (`/api/screening/questions`, `/api/screening/questions/[id]`,
  `/api/jobs/[id]/screening`) guarded by `recruiting:view`/`recruiting:edit`; the
  per-job form is stored on `jobs.custom_fields.screening`. Candidates don't see
  the form yet — rendering + knockout evaluation on the apply page land in 3c.
  (`components/req-jobs/ScreeningTab.tsx`, `components/req-jobs/JobDetail.tsx`.)
- **Publish JD — Phase 3a: screening-questions foundations (Ashby parity).**
  Backend groundwork for a real application-form builder: a reusable, org-scoped
  question library, an org default form template that new jobs inherit (with
  per-job overrides stored on `jobs.custom_fields.screening`), and answer storage
  on `applications`. Includes shared types (`database.ts`), Zod schemas
  (`lib/validations/screening.ts`), and a domain facade
  (`modules/ats/domain/screening.ts`) with library CRUD, template/per-job
  get-save (inherit-then-override), knockout evaluation, and EEO-answer
  partitioning. No UI wired yet — recruiter builder and candidate apply land in
  3b/3c.
- **Publish JD — Phase 2c: the apply page now inherits the company's branding.**
  The public application page (`/apply/[token]`) renders on-brand — the company's
  logo and name in the header (falling back to the RecruiterStack mark when unset),
  the brand color on the Submit button, and the chosen font across the page — so a
  candidate arriving from the careers page stays in one consistent look. Branding
  is independent of the careers-page public toggle (that gates only the listing
  page). The apply preview API now returns a `branding` object alongside the job
  (`getCanonicalApplyJobPreview` reads `org_settings`). (`app/apply/[token]/page.tsx`,
  `modules/ats/domain/job-pipelines.ts`.)
- **Publish JD — Phase 2b: the public branded careers page.** Each org with a
  public careers page now has a live page at `recruiterstack.in/careers/<slug>`
  that resolves the org by its slug, renders the saved branding (logo, hero image,
  brand color, font, tagline, About) and lists every open job with department and
  location, each linking straight to its existing apply page. Hidden unless the
  admin has switched the page on (`careers_public = true`); a toggled-off or
  unknown slug returns a 404. The route is public (added to the Clerk matchers in
  `middleware.ts`) and reads through a new `getCareersPageBySlug` domain function.
  (`app/careers/[slug]/page.tsx`, `modules/ats/domain/job-pipelines.ts`,
  `middleware.ts`.)
- **Publish JD — Phase 2a: "Careers page" branding settings.** Admins can now set
  up a branded public careers page from **Settings → Workspace → Careers page**: a
  unique page address (slug at `recruiterstack.in/careers/<slug>`, auto-suggested
  from the company name, validated for format/reserved words/uniqueness), logo and
  hero-image uploads, primary + accent colors, a font choice, a tagline, an About
  blurb, and a public on/off toggle with a preview link. This is the admin/config
  half — the public page itself and apply-page branding land in Phases 2b/2c.
  Branding image uploads go through a new admin-only route
  (`/api/org-settings/branding-upload`) into a public `company-assets` storage
  bucket. (`components/settings/CareersPageCard.tsx`,
  `app/api/org-settings/branding-upload/route.ts`, `app/api/org-settings/route.ts`,
  `app/api/org-settings/company/route.ts`, `lib/validations/org-settings.ts`.)
- **Cross-link the job's Kanban and detail views.** Once a job is published it
  routes to the Kanban (`/jobs/[id]`), which previously stranded the detail view
  (`/req-jobs/[id]`) — JD, approvals, audit log. The Kanban top bar now has a
  **Details** button (next to "Jobs") that opens that view, and the detail view
  shows a **View pipeline** button once the job is live, so you can move between
  working candidates and the requisition record either way. Routing itself is
  unchanged (`app/(dashboard)/jobs/[id]/page.tsx`, `components/req-jobs/JobDetail.tsx`).

- **Publish JD — Phase 1: the JD details you fill in at job creation now actually
  show up.** Fields like "What they'll do" (team context), "Key requirements" and
  "Nice to have" were collected at creation but stashed in
  `custom_fields.intake` and never rendered anywhere. They are now displayed as
  proper sections on **both** surfaces: the public **apply page**
  (`/apply/[token]` — About the role / What you'll do / What we're looking for /
  Nice to have, with the old truncating scroll box removed) and the internal
  **job detail Overview** (`/req-jobs/[id]` — same sections plus Level, Target
  companies and Notes, which stay internal-only). Display-only; no schema change.
  Sensitive intake (hiring-manager contact, budget) is never shown publicly.
  (`modules/ats/domain/job-pipelines.ts`, `app/apply/[token]/page.tsx`,
  `components/req-jobs/JobDetail.tsx`.) Plan + market research in
  `docs/strategy/06-publish-jd-plan.md`; Phases 2 (branded career page) and 3
  (screening questions) are scoped there for later sessions.
- **Approvals page now has a Pending pane + a History pane.** The page previously
  showed only your pending decisions and was empty once you'd cleared them. It now
  has two stacked sections: a **collapsible "Pending decisions"** pane (your
  personal to-dos, each with the Decide button — unchanged behaviour, just
  foldable with a count) and a static **"History"** table below it listing every
  approval **you've acted on**, newest first, with columns for Type, Title,
  Status, Your decision, Requested by, and Decided date — plus **search + Status +
  Type filters**. New endpoint `GET /api/approvals/history` returns the current
  user's decided approvals (`app/(dashboard)/approvals/inbox/page.tsx`,
  `app/api/approvals/history/route.ts`). An org-wide admin view of *all*
  approvals is intentionally deferred.

### Changed
- **Job Audit Log now includes the linked requisition's full history.** A job's
  audit log (`/req-jobs/[id]`) only showed events from after the requisition was
  approved (the job entity doesn't exist before that), hiding who requested and
  approved the requisition. `GET /api/audit-log` now, for a job target, also
  folds in its linked requisition(s)' `approval_audit_log` rows (found via
  `job_openings`) and synthesizes the **"created"** events (creator/requester)
  that aren't written to the audit table — for both the requisition and the job.
  Rows are merged chronologically and tagged with their entity; `AuditLogTab.tsx`
  shows a coloured **Requisition / Job** badge per row (only when the timeline
  spans both) and now renders the decision on a step. So the log reads end-to-end:
  requisition created → submitted → approved → job created → submitted → opened,
  with requester and approver names throughout.

### Fixed
- **Approvals inbox showed the bare word "job" instead of the job's name.** The
  inbox API (`/api/approvals/inbox`) only ever looked up titles for requisitions
  (`openings`); for a job target it fell back to printing the literal target type,
  and the "title" link always pointed at `/openings/[id]` (a broken link for a
  job). The inbox now hydrates **job** titles from the `jobs` table too, links each
  card to the correct detail page (`/req-jobs/[id]` for jobs, `/openings/[id]` for
  requisitions), and shows a type label ("Job posting" / "Requisition") plus
  **who requested** the approval (`app/api/approvals/inbox/route.ts`,
  `app/(dashboard)/approvals/inbox/page.tsx`). Email/Slack/bell notifications were
  already detailed and are unchanged.

## 2026-06-23

### Added
- **Edit a job after it's created (Draft only).** The job detail page
  (`/req-jobs/[id]`) now has an **Edit** button next to Submit/Archive that shows
  only while the job is a Draft. Clicking it flips the Overview card into an inline
  edit form for Title, Department, Internal context, and Confidentiality; Save
  PATCHes `/api/req-jobs/[id]` and refreshes. The draft-only lock matches the
  backend, which rejects structural edits once a job leaves Draft
  (`components/req-jobs/JobDetail.tsx`; the page now also fetches the full
  department list for the picker in `app/(dashboard)/req-jobs/[id]/page.tsx`).
- **Target Start Date in the New Job drawer now has a calendar picker.** The
  field stays free-text (so "ASAP" / "Q2 2026" still work), but a calendar icon
  on the right opens the browser's native date picker for users who'd rather
  click a date than type it; picking one fills the field with the date
  (`app/(dashboard)/jobs/page.tsx`). Implemented as a transparent `input[type=date]`
  overlaid on the icon — no new dependency.

### Changed
- **New Job drawer: Team & Requirements fields are now rich-text (Gmail-style).**
  "What does this person do on the team?", "Key Requirements" and "Nice to Have"
  were plain textareas; they now use the shared `RichTextEditor` (Tiptap) with a
  bold/italic/underline/lists/headings/align/link toolbar
  (`app/(dashboard)/jobs/page.tsx`). The HTML is stripped back to clean text
  before it's sent to the AI JD generator and before it's stored in the job's
  `custom_fields.intake`, so nothing downstream (the AI prompt, the hiring-manager
  intake form) ever sees raw tags. "Import from PDF/TXT" now inserts the extracted
  text into the live editor. The JD box and Additional notes stay plain text (the
  JD is AI-generated markdown rendered as plain text on the job page).

### Fixed
- **Target start date now carries from an approved requisition into Create JD.**
  The "Create job & write JD" handoff prefilled title/department/location/comp/HM
  but silently dropped the requisition's `target_start_date`, so the JD drawer's
  start-date field (and the generated JD) always came up blank. The date is now
  threaded end-to-end: added to the handoff URL in
  `components/openings/OpeningDetail.tsx`, to the `FromOpening` type + URL parse +
  `startDate` initial state in `app/(dashboard)/jobs/page.tsx`. The JD-generation
  payload, API route, and generator already accepted it — only the client handoff
  was missing.

### Added
- **Push an approved requisition straight into JD creation.** An approved
  requisition (`/openings/[id]`) now shows a "Create job & write JD" button that
  opens the New Job drawer pre-filled from the requisition (title, department,
  location, comp, hiring manager) in "fill everything myself" mode, so the user
  lands directly on the JD-writing step. On save the new job is **linked to the
  existing approved requisition** (via a new `link_opening_id` on
  `POST /api/req-jobs`) instead of minting duplicate headcount — keeping seat
  counts accurate. Touches `components/openings/OpeningDetail.tsx`,
  `app/(dashboard)/jobs/page.tsx` (New Job drawer `fromOpening` prefill + linked
  note in place of the seats editor), `lib/validations/jobs.ts`, and
  `app/api/req-jobs/route.ts`.

### Added
- **Decide on an approval straight from the requisition/job detail page.**
  Previously the only place to approve/reject was the Approvals inbox; the
  detail page's Approval card just showed read-only progress. The card
  (`components/approvals/ApprovalProgress.tsx`) now also checks the current
  user's inbox and, when they're the pending approver for this approval, shows
  an "Approve / Reject" button that opens the existing `DecisionModal`. On a
  decision it refreshes the card and the page (status badge, Cancel button). Used
  by both `OpeningDetail` and `JobDetail`, so it works for requisitions and jobs.

### Added
- **Approval requests now ring the in-app bell + show a sidebar count.** Approval
  steps already emailed/Slacked the approver, but never created an in-app
  notification, so a pending decision was easy to miss. `notifyStepActivated`
  now also creates an `approval_requested` bell notification for each approver
  (links to `/approvals/inbox`), and the requester gets `approval_decided` /
  `approval_completed` notifications when steps are decided/finished
  (`lib/approvals/notifications.ts`, new types in `lib/api/notify.ts`, icons +
  routing in `components/notifications/NotificationBell.tsx`). The sidebar
  **Approvals** item now shows a red count badge of decisions waiting on you
  (polled from `/api/approvals/inbox` every 60s), plus a small dot on the Admin
  bucket when the flyout is collapsed (`components/layout/Sidebar.tsx`).

### Added
- **First-run "Getting started" checklist on the dashboard.** A self-hiding
  banner (`components/onboarding/GettingStartedBanner.tsx`) guides the
  operational setup the signup wizard skips — and whose gaps stop a job from
  going live: create departments, add locations, approval chains for
  requisitions *and* jobs, first requisition, first published job, invite a
  teammate (org-wide, admins only), and connect your calendar (personal). Steps
  **auto-tick** from live data — no manual check-off — via a new
  `GET /api/onboarding/checklist` that reads real signals (departments,
  locations, `approval_chains` per target, `openings`, open `jobs`,
  `org_members`, `user_integrations`). Each still-open step also raises one
  notification nudge (`?sync=1`), routed to the right audience, deduped, and
  auto-cleared once done; the bell links each nudge to the right setup screen.
  Detection logic split into a client-safe `lib/onboarding/checklist-steps.ts`
  (with unit tests) and a server-only `lib/onboarding/checklist.ts`. Settings now
  honours `?tab=` so each step deep-links to the correct tab. (Note: "connect
  email" was dropped — the app sends candidate email via SendGrid and only
  connects calendars per user, so it could never tick.)

### Changed
- **Requisitions list now matches the Jobs page visually.** The Requisitions
  list (`(dashboard)/openings/page.tsx`) was restyled to be consistent with the
  Jobs list: the status-count chip strip was replaced with the same five colored
  stat-cards (Total / Awaiting Approval / Approved / Open / Closed) that filter
  the table on click, status pills now use the Jobs-style icon + colored badge
  via a shared `STATUS_CONFIG`, the header/"New requisition" button adopt the
  Jobs styling, and the table gained matching row hover, a dashed empty state,
  and a "Showing N of M" footer. Cards bucket all seven statuses so each stays
  reachable; the seven-status filter is preserved.

### Added
- **Requisitions has its own sidebar nav home + a status summary.** Requisitions
  were only reachable via a button in the Jobs header, which made them feel
  second-class and confused users about Jobs vs Requisitions. Added a
  **Requisitions** item to the Recruiting nav flyout (above Jobs, since a
  requisition is upstream of a job pipeline; `components/layout/Sidebar.tsx`).
  The list page (`(dashboard)/openings/page.tsx`) now shows a clickable
  status-count strip ("All · N", "open · 3", …) that doubles as the status
  filter; status filtering moved client-side so the counts stay stable.

### Changed
- **Settings → Departments list is now collapsible.** The flat stack of every
  department made the Workspace settings page long. Active departments are now
  folded into a collapsible "Active departments (N)" group with a click-to-
  expand header, and any archived departments sit in their own "Archived (M)"
  group; both default to collapsed (`components/settings/DepartmentsCard.tsx`).

### Added
- **Department field on the New Requisition form is now an autocomplete.**
  Replaced the static department dropdown with a typeahead combobox
  (`components/openings/DepartmentCombobox.tsx`): type to filter the org's
  departments, and if the typed name doesn't exist an "Add '<name>'" row creates
  it inline (`POST /api/departments`, admin-only) and selects it. Wired into
  `NewOpeningForm.tsx` (the now-unused `depts` fetch/state removed). Supports
  keyboard nav (↑/↓/Enter/Esc) and a clear button.

### Fixed
- **Approval chains list now reads "Requisition", not "Opening."** A leftover
  from the 2026-06-22 rename: each chain row printed the raw `target_type`
  (`opening`) instead of the display label, so the list still showed "Opening".
  It now uses the `TARGET_LABEL` map like the rest of the page
  (`admin/approvals/page.tsx`).

### Added
- **Visible "Edit" button on each approval-chain row.** The chain editor already
  existed (`/admin/approvals/[id]`) and the whole card was a link to it, but with
  no obvious affordance it looked un-editable. Added an explicit Edit button per
  row; it bubbles the click up to the existing row link, so it opens the same
  editor (`admin/approvals/page.tsx`).

## 2026-06-22

### Changed
- **Renamed "Openings" to "Requisitions" across the UI.** The recruiting object
  was labelled "Openings" in some places and conceptually overlapped with "Jobs"
  in users' minds. All user-facing display text now reads "Requisitions" — the
  Jobs-board header button, the requisitions list/new/detail pages
  (`(dashboard)/openings/*`), the linked-requisitions panel and link dialog on
  the pipeline detail (`req-jobs/JobDetail.tsx`, `req-jobs/LinkOpeningDialog.tsx`),
  the job-pipelines list copy (`req-jobs/page.tsx`), the approval-chain target
  label and builder (`admin/approvals/page.tsx`, `approvals/ChainBuilder.tsx`),
  and the Settings cards (Locations, Comp bands, Departments, Custom fields).
  URLs (`/openings`), routes, API endpoints, database tables, and code
  identifiers are unchanged — this is a display-text-only rename. The public
  hiring-manager intake form's "Number of Openings" field was intentionally left
  as-is (it reads as plain-English headcount, not the product object).
- **Pre-open jobs open in the management view, not the Kanban.** Clicking a job
  on the board now routes draft / pending-approval / approved jobs to the
  requisition management view (`/req-jobs/[id]`) and only sends open / posted /
  closed jobs to the Kanban pipeline (`/jobs/[id]`), so you manage a job before
  it goes live and work candidates once it's open.

### Schema
- **072_screening_questions.sql** — screening / application-form builder
  foundations. Adds `screening_questions` (org-scoped reusable question library:
  field type, choices, `is_eeo`, archive) and `screening_form_templates` (one row
  per org — the default form new jobs inherit), plus three additive columns on
  `applications`: `screening_answers`, `eeo_answers` (hidden compliance bucket),
  and `knockout_failed`. Per-job forms live on `jobs.custom_fields.screening`. RLS
  on with the service-role policy; additive, idempotent, reversible.
- **071_careers_branding.sql** — adds branded-careers-page columns to
  `org_settings` (`careers_slug`, `careers_public`, `logo_url`, `hero_image_url`,
  `brand_color`, `accent_color`, `brand_font`, `tagline`, `about`), a partial
  unique index on `lower(careers_slug)` so slugs are unique and case-insensitive,
  and a public `company-assets` storage bucket for logo/hero images. Additive,
  idempotent, reversible.

## 2026-06-21

### Changed
- **Public apply link now exists only when a job is open.** Previously every
  canonical job got an `apply_token` at creation (migration 068), so a
  draft/pending/approved job had a shareable apply URL that looked valid but
  accepted no applicants (the apply POST already gated on `status = 'open'`).
  Now the token is minted only when the job reaches `open`, the "Copy Apply
  Link" button is hidden until then (`jobs/[id]/page.tsx`), the job-detail API
  no longer returns the token for non-open jobs, and the public apply preview
  treats any non-open job as "not found" instead of showing a fillable form
  (`modules/ats/domain/job-pipelines.ts`).

### Schema
- **070_apply_token_only_when_open.sql** — `jobs.apply_token` trigger now mints
  the token only when `status = 'open'` (fires on INSERT *and* UPDATE so it's
  generated at the moment a job opens). Backfill nulls tokens for pre-open jobs
  (draft/pending_approval/approved) and ensures open jobs have one.

## 2026-06-20

### Fixed
- **Jobs board — a job deleted in the DB could linger on the board.** The list
  response (`GET /api/jobs`) set no cache header, so a stale cached copy could
  survive a refresh and keep showing a row that no longer exists in `jobs`
  (clicking it then 404s, since the detail read is live). The list response now
  sends `Cache-Control: no-store` and the board's client fetch uses
  `cache: 'no-store'`, mirroring the detail route — every board load is fresh.
- **Job detail — server errors no longer masquerade as "Job not found."**
  `GET /api/jobs/[id]` caught *every* failure from the board-detail read and
  returned a 404, so a real query error (e.g. a missing `jobs.apply_token` column
  when migration 068 hasn't been applied to the database) showed up as a deleted /
  nonexistent job. Genuine query failures now surface as a 500 with the error
  message; only an actually-missing row returns 404. This is why a job could show
  on the board list (whose SELECT omits `apply_token`) yet 404 on its detail page
  (whose SELECT includes it).

## 2026-06-19

### Added
- **New Job form now persists everything — incl. multi-location openings.** The
  "Fill Everything Myself" flow previously discarded every field except the title
  on create. It now posts the full payload to `/api/req-jobs`: the JD
  (`description`), department (find-or-create by name), comp range, and a
  per-location **openings repeater** ("Add another location", seats per location).
  The backend find-or-creates departments + locations by name, creates one opening
  per seat, and links them to the job via `job_openings`. Remaining intake fields
  (level, HM details, requirements, target companies) are stashed in the job's
  `custom_fields.intake` so nothing typed is lost.

### Fixed
- **Apply link — "Copy apply link" silently did nothing.** After the canonical
  cutover the board mapper hard-coded `apply_link_token: null`, so the copy button
  bailed. The real `jobs.apply_token` is now threaded through the board SELECTs and
  mapper.
- **JD generation — manual fallback.** When AI JD generation fails (or after a
  successful generate), a "Write manually instead" button now lets the user drop
  into the editable JD textarea instead of being stuck.

### Changed
- **Single job-creation front door.** There were two divergent "new job" forms:
  the rich drawer on `/jobs` and a bare-bones `/req-jobs/new` "New pipeline" form.
  `/req-jobs/new` now redirects to `/jobs?new` (which auto-opens the rich
  drawer), the `/req-jobs` list "New pipeline" links point there too, and the
  unused `NewJobForm` component was removed.
- **Archived jobs no longer linger on the board.** DELETE is a soft-archive
  (`status='archived'`); the board list now filters those out, so a deleted job
  disappears from `/jobs` instead of showing as a ghost row that 404s on click.
- **Nav — Openings folded into Jobs (single recruiting-pipeline entry).** Dropped
  the standalone "Openings" sidebar item; the Recruiting bucket is now Jobs ·
  Candidates · Sourcing · Sequences · Inbox. Openings (requisitions) stay fully
  available via an "Openings" link in the Jobs page header. Completes the nav
  roadmap's Phase-3 target (Greenhouse-style single Jobs object) now that jobs are
  canonical and candidate-bearing.

### Removed
- **Legacy `hiring_requests` cutover (Phase 3 / C6).** Deleted the legacy CRUD
  routes (`/api/hiring-requests`, `.../[id]`) and the legacy UI
  (`/hiring-requests` list, `new`, `[id]`). Removed the now-dead legacy domain
  functions from `src/modules/ats/domain/`: in `job-pipelines.ts` —
  `createLegacyJobAndPipeline`, `createLegacyIntakeRequest`,
  `listLegacyJobPipelineSummaries`, `getLegacyJobPipelineDetail`,
  `getLegacyJobScoringContext`, `getLegacyCandidateJobContext`,
  `getLegacyApplyJobByToken`, `getLegacyApplyJobPreview`, `activateLegacyApplyJob`,
  `getLegacyJobById`, `updateLegacyJob`, `getFirstLegacyPipelineStage`,
  `listLegacyJobsForAgent`, `findLegacyJobsForAgent`, `countLegacyJobs`,
  `listLegacyPipelineStagesForJob`, the `listCanonicalJobPipelines` /
  `getCanonicalJobPipeline` union helpers, and the now-unused Legacy* types; in
  `reporting.ts` — `fetchLegacyDashboardInputs` / `fetchLegacyPipelineExportInputs`;
  in `applications.ts` — `getApplicationHiringRequestId`. Kept `getLegacyJobTokens`
  (still called by `getApplicationJobTokens`) and `fetchLegacyAnalyticsInputs`
  (still called by the copilot analytics tool).

### Changed
- **"New job" flow → canonical create (Phase 3 / C6).** The Jobs page "new job"
  drawer now POSTs to canonical `/api/req-jobs` (`{ title }`) and navigates to
  `/req-jobs/:id` on success, replacing the legacy `/api/hiring-requests` intake
  POST and the dead ticket-number/intake-URL success UI. The intake submit
  notification's "View in Dashboard" link now points to `/req-jobs`.
- **Drift-guard allowlist emptied (Phase 3 / C6).** Removed the 2 hiring-requests
  + 3 intake entries from `LEGACY_ALLOWLIST` in `scripts/audit-canonical-model.mjs`;
  the audit now reports 0 legacy / 0 mixed / 0 adapter files.
- **HM intake flow → canonical jobs (Phase 3 / C5.5).** The hiring-manager intake
  routes now operate on canonical `jobs` keyed by `jobs.intake_token` instead of
  legacy `hiring_requests`: `GET/POST /api/intake/[token]`, `.../generate-jd`, and
  `.../approve`. An intake is a canonical job — intake-pending = `draft`, the
  AI-generated JD lands in `jobs.description`, structured intake fields + HM
  name/email live in `jobs.custom_fields.intake`, and submit/approve flips the job
  to `open` (apply-ready via the migration-068 apply_token). New domain helpers in
  `src/modules/ats/domain/job-pipelines.ts`:
  `getCanonicalIntakeJobByToken` / `getCanonicalIntakeJobFull` /
  `submitCanonicalIntakeJob` / `setCanonicalIntakeJobJd` /
  `approveCanonicalIntakeJob`. AI JD generation, validation, notifications, and
  response shapes are preserved. Legacy intake code is untouched (cutover is C6).

### Schema
- **069_jobs_intake_token.sql.** Adds `jobs.intake_token TEXT UNIQUE` + a
  `BEFORE INSERT` trigger `set_job_intake_token` (auto-generates when null) +
  backfill, mirroring the migration-068 apply_token. Additive, idempotent,
  reversible.

### Changed
- **Copilot job tools → canonical jobs (Phase 3 / C5).** The agent job tools in
  `src/lib/copilot-tools.ts` now read the canonical `jobs` spine instead of
  legacy `hiring_requests`: `list_jobs` uses `listCanonicalJobBoardSummaries`,
  `get_job_pipeline` resolves via the new `findCanonicalJobsForAgent` then reads
  `getCanonicalJobBoardDetail`, and `get_dashboard_stats` job count uses the new
  `countCanonicalJobs`. Agent-facing return-string formats are unchanged. New
  canonical lookup helpers `findCanonicalJobsForAgent` / `countCanonicalJobs`
  added to `job-pipelines.ts`; legacy reads left intact (cutover is C6).

## 2026-06-18

### Added
- **Public apply → canonical jobs (Phase 3 / C3).** The public `/api/apply`
  route (GET preview + POST submit) now resolves the apply token against
  canonical `jobs` via `jobs.apply_token`, gates on `status = 'open'`, seeds the
  candidacy at the job's first canonical pipeline stage (`getFirstJobStage`), and
  creates the application anchored on `job_id` (no `hiring_request_id`). New
  domain helpers `getCanonicalApplyJobByToken` / `getCanonicalApplyJobPreview` in
  `job-pipelines.ts`. Legacy paths left intact (cutover is C6).

### Schema
- **Migration 068 — `jobs.apply_token`.** Adds a unique public apply token to
  canonical `jobs` with a `BEFORE INSERT` trigger that auto-generates it when
  null (mirrors `hiring_requests.apply_link_token`); backfills existing rows.
  Idempotent.

### Security
- **RBAC API guard gaps — closed.** Several recruiting endpoints enforced only
  org-membership (or, for `/api/email/send`, nothing at all in the handler) and
  ignored per-member capabilities. Added capability gates: `recruiting:view` on
  `GET` of `/api/hiring-requests` (+`[id]`), `/api/email-templates`,
  `/api/pipeline-stages`, `/api/roles` (+`[id]`), and `/api/export/{candidates,
  applications,pipeline}`; `recruiting:edit` on their writes and on
  `/api/email/send`; `analytics:view` on `/api/analytics`. A member without the
  capability now gets a 403 instead of the nav merely being hidden.

### Fixed
- **Invite flow — stale-role leak on re-invite.** Re-inviting an email now revokes
  any prior **pending** Clerk invitation first (`revokePendingInvitations`), so a
  superseded invite can't win the join-time role lookup. The join-time lookups
  (`getInvitePreferredRole` / `getInviteRbacRole`) now only fall back to **pending**
  invitations — never `revoked`/`expired` — so a revoked invite's frozen metadata
  (e.g. a since-deleted role) can no longer leak onto a new membership.
- **Onboarding "Your role" step — showed coarse legacy label.** The locked-role
  message now shows the actual invited **RBAC role name** (e.g. "Talent Acquisition")
  instead of the back-compat legacy label (always just admin/recruiter).
- **Onboarding "Your role" step — wrong role highlighted in the picker.** When the
  invite carries an RBAC role, the step now renders a single locked card with that
  role's real **name + description** (read from `rbac_roles`) instead of the legacy
  4-role radio list, which highlighted the coarse mapping (e.g. "Recruiter") and
  contradicted the banner above it. Uninvited/legacy-only joins still get the
  static 4-role list.
- **Team & Permissions — misleading base-role badge.** The per-member legacy
  base-role chip is now only shown for `admin`; the generic
  recruiter/hiring_manager/interviewer base roles (superseded by the RBAC role
  chips) are suppressed.

### Changed
- **Org setup — clearer guidance for invitees.** Copy now points invited users to
  the pending-invitation card (already rendered by Clerk's `OrganizationList`), so
  an existing user who lands here after signing in has an unmistakable accept path.
- **Settings/Sidebar — removed capability-gated nav flicker.** A new shared
  `CapabilitiesProvider` fetches `/api/me` once for the whole dashboard; Sidebar and
  Settings now read from it instead of each firing their own request. The Settings
  nav renders a skeleton while capabilities load, so admin tabs ("Workspace",
  "Teams & Agents") appear together with the rest instead of popping in ~100–300ms
  later.

## 2026-06-14

### Changed
- **RBAC — invite flow wired to RBAC roles + remaining gates migrated.** The
  Settings → "Invite teammate" dropdown now lists the org's **RBAC roles**
  (including custom ones) instead of the legacy 4-role enum. New `teamInviteSchema`
  (email + `roleId`); `/api/team/invite` resolves the role, maps Owner → Clerk
  `org:admin` (else `org:member`), and stamps `rbac_role_id` on the invitation;
  new `getInviteRbacRole` + `ensureDefaultMemberRole` **assign that exact role on
  join** (org-verified). The team member row's legacy role dropdown is replaced by
  a "Manage access" link to `/admin/permissions` (one source of truth). Also
  migrated `/api/org-settings` PATCH admin-field gate and the `/settings` page's
  client `is_admin` gating to the `settings:edit` capability. Onboarding bootstrap
  + last-admin guard intentionally left on the legacy path.

### Added
- **Per-member RBAC — Slice 5 (cleanup).** Remaining coarse admin gates
  (`requireAdmin()` on departments / locations / compensation-bands) migrated to
  `requireCapability('settings:edit')`; added resolver-precedence and tool-gate
  tests. `requireAdmin`/`is_admin` retained as deprecated back-compat (admin↔Owner
  still holds). Onboarding-invite + field-level org-settings gates intentionally
  left as-is. **All RBAC slices 0–5 complete.**
- **Per-member RBAC — Slice 3 (agent enforcement).** `executeTool` capability-gates
  each tool (75-tool `TOOL_CAPABILITIES` map) when given a capability set; the
  user copilot threads the caller's caps (orchestrator → sub-agent → executeTool),
  while background jobs (WhatsApp responder, HR-case auto-answer) omit them and run
  unrestricted. Closes the hole where the agent bypassed the route-level gates.
- **Per-member RBAC — Slice 2 (capability-driven nav).** `/api/me` returns the
  viewer's `capabilities`; the sidebar shows only items whose capability is held
  (sections hide when empty), replacing the coarse `adminOnly` flag. `AdminOnlyGuard`
  admits the `/hris` area on any People-area capability so granular grants reach
  their pages.
- **Per-member RBAC — Slice 4 (admin UI).** New "Team & Permissions" page at
  `/admin/permissions` (Owner-only). Roles section lists system roles (badged,
  read-only) and custom roles (editable/deletable) with a capability grid
  (rows = modules, columns = view/edit/approve, built from `CAPABILITIES`) plus
  create/edit forms. Members section lists active org members with role chips
  (add via a role picker, remove via the chip's ✕) and surfaces per-member
  override counts. Added a "Permissions" entry to the sidebar Admin section
  (`settings:edit`-gated).
- **Per-member RBAC — Slice 1 (API enforcement).** Capability gates now enforced
  across guarded API routes (130 route-methods, via a multi-agent workflow + a
  reviewed pass over 35 flagged routes). Foundation: `getViewerScope` resolves
  effective capabilities; `assertCapability(scope, cap)`; a `withCapability(cap,
  handler)` route wrapper and `requireCapability(cap)` helper; `ensureDefaultMemberRole`
  assigns new members their default role (admin→Owner, else Recruiter) so nobody
  is locked out. Behavior-preserving for the two current populations (Owner = all
  caps; Recruiter = recruiting/openings/analytics): admin-only surfaces map to
  Owner-only capabilities, recruiting surfaces to caps every member already holds.
  Relationship gates (canViewEmployee/Sensitive), `/me/**`, public, webhook, and
  copilot routes untouched. Open recruiter-UX reference reads (departments/
  locations lists, dropdowns) deliberately left open.
- **Per-member RBAC — Slice 0 (model & resolver).** Hybrid model: named roles
  (capability bundles) + per-member allow/deny overrides; capability =
  `<module>:<action>`. New `src/lib/permissions.ts` (capability registry + pure
  `resolveCapabilities`, precedence deny > allow > role, Owner → all). `rbac.ts`
  gains `getPermissionSet`/`can`/`assertCan` — **standalone and dormant** (not
  wired into `getViewerScope` or any route yet; Slice 1 turns on enforcement).
  Plan in `docs/rbac-plan.md`. **No enforcement; behavior unchanged.**

### Schema
- **Migration 065 — RBAC tables (Slice 0).** `rbac_roles`,
  `rbac_role_capabilities`, `rbac_member_roles`, `rbac_member_overrides`
  (prefixed `rbac_` to avoid the legacy ATS `roles` table). Seeds Owner +
  Recruiter system roles per org and backfills assignments behavior-preservingly
  (admins → Owner/all-caps, everyone else → Recruiter/recruiting+openings+analytics).
- **Migration 064 — Canonical Slice 3: link applications to canonical jobs.**
  Adds nullable `applications.job_id` (→`jobs`) and `opening_id` (→`openings`)
  plus indexes. Forward-only dual-write: `createApplication` now accepts optional
  `jobId`/`openingId` and only references those columns when set, so the legacy
  apply/intake flow is untouched and deploys stay safe even if the migration
  lags. `hiring_request_id` stays NOT NULL for now. This is the link that lets
  canonical `jobs` pipelines hold candidates for new data.

### Added
- **Canonical Slice 5 — drift guard.** `scripts/audit-canonical-model.mjs --check`
  (npm `audit:canonical:check`) exits non-zero when a caller file
  (`src/app`/`src/lib`/`src/components`) accesses a legacy table directly outside
  an explicit `LEGACY_ALLOWLIST` (the 5 frozen intake/`hiring_requests` routes).
  Wired into CI via `.github/workflows/canonical-guard.yml` (dependency-free).
  New core work that bypasses canonical services / domain facades now fails the
  build.

### Changed
- **Canonical Slice 2 — copilot + job-queue storage access moved behind domain
  facades.** `src/lib/copilot-tools.ts` and `src/lib/api/job-handlers.ts` no
  longer touch `candidates` / `applications` / `pipeline_stages` / `roles` /
  `interviews` / `offers` / `hiring_requests` directly. All raw `supabase.from(...)`
  reads/writes on those tables now route through `@/modules/ats/domain/*` facades
  (`candidates`, `applications`, `job-pipelines`, `role-profiles`, `interviews`,
  `offers`). Behavior is byte-identical — every agent-facing return string, error
  message, ordering, limit, and filter is preserved. Both files are now off the
  canonical audit's `legacy` list (legacy 7 → 5; the remaining 5 are the
  intake/`hiring_requests` routes frozen by decision).
- **Sidebar IA — TA-professional-only restructure (Phase 1).** The product is the
  cockpit for a centralized TA team (recruiting + HR-ops, access-gated); employee
  self-service ships as a separate variant. So `Sidebar.tsx` `NAV_SECTIONS` now:
  removes the entire `Me` self-service bucket (all `/me/*`); drops the duplicate
  `Pipelines` (`/req-jobs`) entry so legacy `/jobs` is the single "Jobs" surface
  (Option A — it's the only board with candidates until canonical Slice 3);
  renames `HRIS` → `People`. HR-ops modules (OKRs, Documents, HR cases, Leave
  policies, Payroll) stay as admin/org views. Per-module RBAC (vs the current
  coarse `adminOnly`) is a noted follow-up. See `docs/nav-consolidation-roadmap.md`.

### Removed
- Orphaned `Me`-only icon imports (`UserCircle`, `Calendar`, `Clock`) from `Sidebar.tsx`.

### Docs
- **Navigation consolidation roadmap.** New `docs/nav-consolidation-roadmap.md`
  ties the sidebar IA cleanup to the canonical migration. Establishes the
  TA-professional-only product principle (employee HRIS/Payroll self-service is a
  separate variant → the `Me` bucket leaves this nav), documents the
  Openings/Jobs/Pipelines overlap as "2 real concepts + 1 legacy duplicate"
  (legacy `hiring_requests` still holds all candidates because `applications` has
  no `job_id`), explains the canonical Job-vs-Opening distinction, and sequences
  the work: nav now → canonical Slices 0–3 → final nav collapse once candidates
  are re-anchored onto canonical `jobs`.

## 2026-06-10

### Added
- **WhatsApp provider adapter — Vobiz support.** The org's Meta business
  account is blocked from claiming apps, so WhatsApp now routes through a
  provider layer: Meta Cloud API (direct) or Vobiz (BSP, whose telephony we
  already use). New `lib/whatsapp/vobiz.ts` client
  (`api.vobiz.ai/v1/messaging/messages`, X-Auth-ID/X-Auth-Token), Vobiz
  callback signature verification (HMAC-SHA256 base64 over callbackUrl+nonce,
  X-Vobiz-Signature-V2/V3), webhook handles both payload shapes on the same
  endpoint, and the settings card gets a provider toggle with conditional
  fields. Vobiz's inbound `data` schema isn't published — the parser is
  tolerant and logs unparseable payloads verbatim for correction from the
  first live event.

### Schema
- **Migration 063 — WhatsApp providers.** `whatsapp_accounts.provider`
  ('meta'|'vobiz'), `auth_id` (Vobiz X-Auth-ID); `waba_id` now nullable.
  For Vobiz rows, `phone_number_id` holds the channel_id and `access_token`
  holds the auth token (also the callback HMAC key).

### Added
- **WhatsApp messaging (Meta Cloud API) — two-way conversational.** Agents can
  now talk to candidates on WhatsApp:
  - New copilot tool `send_whatsapp_message` (Scout outreach, mirrors
    `send_outreach_email`); orchestrator approval gates now cover WhatsApp.
  - Inbound webhook `/api/webhooks/whatsapp` (Meta handshake + HMAC-verified
    POSTs); replies are answered by an AI responder agent (Haiku, bounded
    toolset) via the job queue, with guardrails: STOP opt-out, unknown-sender
    escalation, 10-turn cap, per-conversation mute, recruiter notifications.
  - 24-hour customer-service window handled automatically: free-form text in
    window, the org's pre-approved outreach template outside it.
  - Settings → Integrations → WhatsApp card (per-org credentials, encrypted at
    rest; webhook URL + test send) backed by `/api/org-settings/whatsapp`.
  - Candidate profile right panel gets a WhatsApp thread tab (bubbles, delivery
    ticks, AI-responder toggle) via `/api/candidates/[id]/whatsapp`; timeline
    renders `whatsapp_sent` / `whatsapp_received` / `whatsapp_opt_out` events.
  - New env vars (optional, feature degrades gracefully):
    `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`,
    `WHATSAPP_DEFAULT_COUNTRY`.

### Schema
- **Migration 061 — WhatsApp tables.** `whatsapp_accounts` (per-org Meta
  credentials, tokens AES-encrypted), `whatsapp_conversations` (one per
  org+phone, tracks 24h window + responder state), `whatsapp_messages`
  (idempotent on Meta `wamid`), plus `digits_only()` helper + expression index
  on `people` for inbound phone → person matching.
- **Migration 062 — Party Model enforcement on `candidates`.** `people` is now
  the DB-enforced canonical source of identity (name / email / phone /
  linkedin_url). On the `candidates` table:
  - Dropped `NOT NULL` on `name` + `email` so writers can stop passing them.
  - Added `BEFORE INSERT/UPDATE` trigger that fills any NULL identity field
    from the linked `people` row.
  - Added `AFTER UPDATE` trigger on `people` that propagates identity edits
    to every linked `candidates` row.
  - Backfilled candidates with null `person_id` by linking to (or creating) a
    matching `people` row.

### Added
- **Party Model rule documented** in `docs/canonical-data-model.md`. Identity
  on `people`; role tables (candidates, employee_profiles, future leads /
  alumni) carry only role-specific facts + non-null `person_id`. New person-
  role tables MUST follow this rule.
- **`docs/data-inventory.md`** — full schema inventory (67 tables, 8
  categories, 7 overlap zones), cross-module spine diagram, homepage-pillar
  guidance. The motivating context for the Party Model rule above.

### Changed
- **Canonical write path for candidates.** `findOrCreateCandidateProfile`
  creates the `people` row first and inserts the candidate with only
  `person_id` + role-specific attrs. Trigger fills identity. Existing
  reads keep working (denormalized columns still present, kept in sync).
- **`POST /api/candidates`**, **`PATCH /api/candidates/[id]`**,
  **`/api/sourcing/confirm`** all route through the canonical write path.
  PATCH splits identity edits into a `people` update; role edits stay on
  `candidates`. Sourcing CSV import loses chunked batching in favour of
  per-row canonical writes — sourcing is admin-triggered, throughput
  isn't critical, the architectural consistency is.
- **`/api/candidates` search** queries `people` for name/email/phone
  matches first, then ORs with candidate-side fields (current_title /
  location). Replaces the previous all-on-candidates search.

### Fixed
- **Sidebar flyouts were invisible / buckets felt dead on click.** Two
  bugs in the new buckets-only rail:
  - The rail's `<nav>` had `overflow-y-auto`, which clipped the absolutely-
    positioned flyout panels — they rendered but were hidden behind the
    overflow boundary. Switched to `overflow-visible` (7 buckets fit
    without scrolling).
  - Bucket buttons with no direct route (Me, Recruiting, HRIS, Payroll,
    Insights, Admin) had no `onClick` handler — they only opened on
    hover. Click now toggles the flyout immediately (bypassing the
    150ms open delay), giving a deterministic fallback for trackpads
    where hover is finicky. Hover still works as before.

### Added
- **Payroll: Singapore tax engine (second country).** Validates the
  pluggable `TaxEngine` interface with a structurally different
  implementation. Effective Jan 2026 CPF rates (employee 20%, employer
  17%, OW ceiling S$8,000/month) and IRAS YA2026 resident slabs.
  - Singapore has no monthly TDS — employees file annually with IRAS.
    The engine deducts CPF only and emits a projected annual income
    tax as an *informational* line that doesn't reduce net.
  - Settings: country picker on `/settings/payroll`; India-only fields
    (state / regime / metro / PF / ESI / decomposition) hidden when
    Singapore is selected. Country-aware disclaimer banner.
  - 12 unit tests pin CPF math at / below / above the OW ceiling, LWP
    integration, and honest-scope guards (no-monthly-TDS note, AW note
    above the annual ceiling, hourly throws).
  - Schema: migration 060 widens `payroll_org_settings.country_code`
    CHECK to allow 'SG'.
  - Honest scope NOT shipped: CPF age tiers above 55, Additional Wages
    (bonus / 13th-month) CPF math, non-resident rates, SDL employer
    deduction, personal reliefs in the tax projection.
  - Sub-agent prompt updated to describe both engines + per-country
    limits.

### Added
- **Department + manager filters on `/analytics/people`.** Two dropdowns
  next to the window picker. Filters narrow the cohort cards
  (cost-per-hire, tenure, comp drift) which are employee-side. Amber
  banner appears when filters are active explaining that app-side cards
  (funnel, time-to-hire, source, trends) stay org-wide because
  applications don't carry department/manager directly yet — filter-
  aware app-side metrics are a follow-up that needs cleaner
  application→hiring_request joins. Role filter skipped entirely (text
  field, doesn't dedupe usefully). Manager filter is direct-reports
  only; transitive walk is a follow-up.

### Added
- **Hiring trends chart on `/analytics/people`.** Recharts line chart
  showing apps / hires / joins by calendar month for the last 12 months.
  Three lines on shared Y-axis so funnel collapse is visible. Months with
  zero activity still render (no chart holes). Full-width card. New
  domain function `getMonthlyHiringTrends`; added `recharts` dep.

### Added
- **Source → retention card on `/analytics/people`.** *The* killer
  cross-module chart. For every application source value (applied /
  sourced / referral / imported / manual), shows hire rate (apps →
  hired) alongside retention rate (hired → still active). Two horizontal
  bars per row in matching colors so the eye can compare side-by-side.
  Window-free on purpose — retention only means something across
  historical cohorts. Full-width card so it's the visual anchor of the
  page. Cross-vendor-impossible: ATS knows source, HRIS knows current
  status, same DB joins them.

### Added
- **Comp drift card on `/analytics/people`.** Fifth analytics card. For
  every active employee with 2+ `compensation_records` on file, shows
  the % change from earliest record (typically the offer) to the latest.
  Aggregate stats (median / p25 / p75) + per-employee drill-down. Exits
  gracefully when nobody has a comp history yet ("drift surfaces once
  people receive their first raise"). Uses the immutable-history pattern
  from migration 049 — no new schema.

### Added
- **CSV export on `/analytics/people` cards.** Download icon next to each
  card's subtitle exports that card's data as a timestamped CSV (RFC 4180
  escaping, UTF-8 BOM for Excel). Cost card includes per-employee
  breakdown rows. New helper `src/lib/api/csv-export.ts`.

### Added
- **DOB on `employee_profiles` (migration 059) + auto-derive 80DDB senior
  flag.** Optional `date_of_birth DATE` column. Payroll compute orchestrator
  now sets `80ddb_senior=1` automatically when the employee was 60+ at the
  pay-period end date — saves them ticking the checkbox per FY. Explicit
  user-set value wins (e.g. a senior treating a non-senior dependent).
  - Admin UI: inline DOB editor on `/hris/employees/[id]` next to Hired /
    Start date / Joined.
  - API: `PUT /api/employees/[id]/dob` (admin-only, validates ISO date,
    rejects future / >120yr past).
  - Re-added `/analytics/people` to the Insights sidebar bucket — the
    redesign dropped it.

### Changed
- **Sidebar redesigned: buckets-only rail + hover flyouts.** The desktop
  sidebar now shows only top-level buckets (Dashboard, Me, Recruiting,
  HRIS, Payroll, Insights, Admin) at a fixed 140px rail. Hovering a bucket
  (150ms delay) opens a flyout panel to the right with that bucket's
  flat list of items. Dashboard navigates directly on click (no flyout
  since it has no children). Settings stays inside the Admin flyout.
  Active highlighting bubbles up: the bucket lights emerald when any of
  its items matches the current route.
  - Mobile (below md): the rail is hidden and replaced with a fixed
    top-left hamburger that opens an off-canvas drawer containing the
    full nested list (no hover required).
  - Removed: the manual collapse/expand toggle and its localStorage key
    (`rs_sidebar_collapsed`) — the rail is always the compact form now.
  - No item overlaps were renamed (Onboarding / OKRs / Documents / HR
    cases still appear in both Me and HRIS — intentional, scope deferred).

### Added
- **Cross-module people analytics — `/analytics/people`.** Four metrics
  that each join data from at least two modules in one query. The
  unified-data moat in actual numbers, not a system prompt claim.
  - **Conversion funnel** — applications → hired → joined → still-active
    for the time window. Joins ATS `applications` to HRIS
    `employee_profiles` via `application_id`.
  - **Time-to-hire** — median / p25 / p75 days from `applied_at` to
    `hired_at`. Uses the trigger-stamped HRIS timestamp; ATS doesn't
    track this on its own.
  - **Real cost per active hire** — for active employees whose
    application landed in the window, sum of `payslips.net` ÷ headcount.
    Includes per-employee breakdown. Cross-vendor-impossible: Greenhouse
    can't see payslips, Rippling can't see application date.
  - **Tenure distribution** — current actives bucketed into <3mo /
    3–12mo / 1–2y / 2–5y / 5y+ with a median months number.
  - Domain: `src/modules/core/domain/people-analytics.ts` (lives in
    core because every metric crosses module boundaries; modules can't
    import from siblings).
  - API: `GET /api/analytics/people?days=N` runs all four in parallel via
    `Promise.allSettled` — a failure on one metric doesn't sink the
    page; each card surfaces its own error.
  - UI: 4-card grid with a window picker (30 / 90 / 180 / 365 days), a
    unified-data callout banner explaining the joins. Cost card has a
    drill-down list by employee. Sidebar entry under Insights.

## 2026-06-10

### Added
- **Payroll v1.2 — disability / specified diseases.** Three more Chapter
  VI-A sections in the India engine: **80U** (self disability), **80DD**
  (disabled dependent maintenance), **80DDB** (treatment of specified
  diseases — cancer, neurological, AIDS, etc.). No migration —
  reuses the existing `other_exemptions` jsonb column.
  - 80U / 80DD caps: ₹75,000 normal, ₹1,25,000 if severe (≥80% disability).
  - 80DDB caps: ₹40,000 under-60, ₹1,00,000 if patient is 60+.
  - Severity / senior flags stored as 0/1 in jsonb (`80u_severe`,
    `80dd_severe`, `80ddb_senior`). Engine reads them, picks the cap,
    then clamps the amount.
  - 10 new unit tests pin the math, including cap-clamp behaviour,
    new-regime-ignores-all, and a combined v1.1+v1.2 scenario.
  - UI: `/me/tax-declarations` "More exemptions" gets a sub-section
    "Disability / specified diseases" with an amount field plus a
    severity/senior checkbox per section. Cap in the field label
    updates live based on the toggle.
  - API: amount-key + flag-key whitelists on both routes — flags
    coerced to 0/1, unknown keys dropped.
  - Honest scope: no medical-certificate verification (Form 10-IA),
    no patient-DOB derivation (we trust the senior checkbox).

## 2026-06-08

### Added
- **Payroll v1.1 — old-regime extras.** Four more Chapter VI-A sections in
  the India engine, no migration needed (uses the existing
  `other_exemptions` jsonb column):
  - **Section 24(b)** — home loan interest, ₹2L cap (self-occupied)
  - **Section 80E** — education loan interest, no cap
  - **Section 80G** — donations, applied as flat 50% deductibility (working-
    tool simplification documented in code + UI + payslip meta). Real rule
    splits 100%/50% donees and caps some at 10% of gross
  - **Section 80TTA** — savings account interest, ₹10k cap
  - New regime continues to ignore all exemptions
  - Engine surfaces a payslip note when 80G is claimed, flagging the
    simplification
  - 11 new unit tests pin the math (28 total India tests passing)
  - UI: `/me/tax-declarations` gets a collapsible "More exemptions"
    section with per-field cap hints. Auto-expands if any v1.1 field is
    already populated
  - API: known-key whitelist sanitizer on both `/api/me/tax-declarations`
    and `/api/payroll/employees/[id]/declarations` — drops anything
    outside the engine's known keys, keeps the open jsonb safe

### Added
- **Payroll module v1 — India tax engine.** Compute joins the ledger:
  pluggable `TaxEngine` interface + one concrete implementation (India,
  FY 2026-27, both regimes). The compute orchestrator pre-fills draft
  payslips from current compensation, runs the engine, deducts LWP
  pulled from HRIS approved unpaid leave, and writes — preview-then-write
  modal on the run-detail page. Honest scope: working-tool accuracy, not
  statutory compliance (disclaimer banners everywhere).
  - Schema: `payroll_org_settings` (country, state, regime, salary
    decomposition %, PF/ESI/PT config) + `employee_profiles.tax_regime` +
    `employee_tax_declarations` (per FY: rent, 80C, 80D, 80CCD(1B)).
    Migration 058.
  - Engine math: Basic/HRA/Special decomposition, PF (12% of Basic, optional
    ₹15k cap), ESI (0.75% if gross ≤ ₹21k), state PT (KA/MH/TN/DL/HR),
    TDS new + old regime with 87A rebate / surcharge tiers / 4% cess.
    Karnataka PT default reflects the Apr 2025 threshold change to
    ₹25,000/month.
  - 17/17 unit tests pin the math; will fail loudly when slabs change after
    a future budget.
  - LWP from HRIS — the unified-data moat made concrete: approved unpaid
    leave overlapping the pay period deducts proportionally from net.
  - New UI: `/settings/payroll` (admin) + `/me/tax-declarations` (employee
    self-service: regime picker + per-FY exemption entry).
  - Agent prompt updated to describe v1 engine + limits; agent stays
    read-only (compute writes go through the admin UI).

### Added
- **Payroll module v0 — payslip ledger.** The fourth real module is live (no
  longer a placeholder). Records what each employee was paid in each pay
  period; no payroll math is computed here. Pillars:
  - Schema: `payroll_runs` + `payslips` (migration 057). Run totals computed
    on read; payslip rows snapshot employee name/email at write time.
  - Domain: `modules/payroll/domain/{runs,payslips}.ts` — full CRUD + finalize.
    Finalized runs are immutable from the API/UI.
  - Admin UI: `/payroll/runs` (list with totals), `/payroll/runs/[id]` (detail
    with editable payslip rows while draft, locked once finalized).
  - Self-service UI: `/me/payslips` (history), `/me/payslips/[id]` (printable
    detail). User-scoped via `employee_profiles.user_id`; never leaks across
    employees.
  - Sub-agent: `delegate_to_payroll` joins ATS / CRM / HRIS in the orchestrator
    with 3 read-only tools — `list_payroll_runs`, `get_payroll_run`,
    `get_employee_payslips`.
  - Flag: `NEXT_PUBLIC_PAYROLL_ENABLED` (default on); sidebar gates admin nav
    + employee "Payslips" item.
  - Scope deliberately excluded for v0: tax/statutory engine, bank
    disbursement, CSV import, PDF generation. All additive in v1.

### Changed
- Sidebar nav rearranged for clearer planning/execution separation. Under
  **Recruiting**, items now read `Openings → Jobs → Pipelines → Candidates →
  Sourcing → Sequences → Inbox` (Jobs before Pipelines reflects the legacy/
  canonical ordering; Inbox joined Recruiting since it's an action feed, not
  analytics). **Insights** is now `Analytics` only. HRIS / Me / Admin sections
  unchanged. Openings stayed in Recruiting (not HRIS) because HRIS is
  admin-only and Openings must remain visible to recruiters.

## 2026-05-24

### Fixed
- Onboarding no longer loops users who set up their workspace but didn't click
  through to the final "All set" screen. `onboarded_at` was stamped only by the
  done step's client-side effect, so connecting an integration mid-onboarding
  (which bounced the user back to the integrations step) and then closing the
  tab left it `null` forever — every subsequent login re-ran onboarding even
  though, e.g., Slack was already connected. Now completion is stamped
  server-side and idempotently (`markOnboarded`) once the required steps are
  persisted (`requiredStepsComplete`): on *reaching* the integrations step and
  again on the done screen as a backstop.
- OAuth connect/install flows started from the onboarding integrations step now
  carry an explicit `origin=onboarding` signal through the signed OAuth state,
  so callbacks return the user to that step instead of inferring the
  destination from `onboarded_at` (which is now set earlier). Settings-initiated
  connects are unchanged.

### Changed
- Extended the emerald brand theme across the app (52 files: landing page, public
  apply/schedule/intake flows, dashboard pages, and shared components). Converted
  brand/interactive blue — buttons, hover/focus states, focus rings, gradients,
  link text — to emerald. **Categorical status colors were deliberately
  preserved** (e.g. candidate `active`, pipeline stages, scorecard `yes`/`Good`
  ratings) so distinct states stay visually distinct. Light-blue decorative
  panels (`bg-blue-50` callouts) were left as-is and can be greened later.

### Docs
- Rewrote `README.md` into a real first-look entry point with a "Start here"
  reading path to `CLAUDE.md` and the canonical data-model docs.
- Refreshed `CLAUDE.md`: corrected stale counts (migrations 27→48+, API routes
  60+→130+, copilot tools 20+→~38, tests 13→37), added a Canonical Data Model
  section linking the `docs/` files and documenting the `src/lib/domain/*` facade
  convention, and surfaced `npm run audit:canonical`.
- Added this `CHANGELOG.md` as the running progress log.

### Removed
- Deleted `AGENTS.md` — it was a corrupted duplicate of `CLAUDE.md`
  (`Claude`→`Codex` text swap from another tool). `CLAUDE.md` is the single
  source of truth.
</content>
