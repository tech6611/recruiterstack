# Sequences — the outreach/nurture module

A **sequence** is a reusable, multi-step email campaign for candidates. You build
the steps once, enroll candidates (by hand or automatically), and the system
sends each step on its own schedule — stopping automatically if the candidate
replies.

> This doc describes what the module actually does today, including the parts
> that look built but aren't. It's the single reference; `CHANGELOG.md` is the
> dated history.

---

## 1. Building a sequence

A sequence (`sequences` table) has a **status** (`draft` → `active` → `archived`)
and an ordered list of **steps** (`sequence_stages`). Each step is an email with:

- **Subject + body** (rich text) with tokens like `{{candidate_first_name}}`,
  `{{job_title}}`, `{{company_name}}`.
- **A delay** — how long to wait before sending it. Units: **minutes, hours,
  days, or business days** (editor dropdown). A delay is measured **from when the
  previous step sent** (e.g. "2 days" = 2 days after the prior email). A fixed
  clock time ("at 9:00 AM") is only offered for *day*-level delays, so minute/
  hour steps stay purely relative.
- **Send on behalf of** (optional) — a from-name/email override per step.

New steps are appended at the end (the server assigns their order).

**UI:** `/sequences` (list) and `/sequences/[id]` (builder, with tabs: Stages,
Enrollments, Analytics, Automations).

---

## 2. How sending actually works

Sequences use **dynamic, one-step-at-a-time scheduling** — they do *not* pre-plan
the whole journey:

1. On **enrollment**, only **step 1** is scheduled (a job on the queue).
2. When a step sends, the handler reads the sequence's **current** step list,
   sends the **next step the candidate hasn't received yet**, and schedules the
   one after it.
3. When there's no next step, the enrollment is marked **completed**.

Because it reads the live step list each time:
- **Adding a step** mid-sequence → active candidates reach it and get it.
- **Deleting a step** → it's skipped cleanly (no ghost send).
- **Finished** candidates are **not** revived by later edits (by design — matches
  Outreach/Gem).

### The queue and the cron
Sends go through a durable job queue (`job_queue` table). Nothing sends until the
worker endpoint **`POST /api/queue/process`** is called. **No cron for this exists
in the repo** — an **external pinger** (configured outside the codebase) hits that
endpoint every ~1–2 minutes in production. That same tick also runs the
auto-enrollment scan (§5). If sends ever stop, that external pinger is the first
thing to check.

---

## 3. Enrolling candidates

- **Manually:** "Add to Sequence" on a candidate, or "Add Candidates" on the
  sequence page. Only enrolls into **active** sequences; skips anyone already
  active/paused in that sequence.
- **Automatically:** via auto-enrollment rules (§5).

Both paths go through one shared function, `enrollCandidate()`
(`src/modules/crm/domain/enroll.ts`), so they behave identically.

---

## 4. In-flight controls

- **Reply-stop:** every email carries a hidden per-enrollment `Reply-To`
  (`reply+<enrollmentId>@reply.recruiterstack.in`). When a candidate replies,
  SendGrid Inbound Parse forwards it to the Django webhook
  (`/api/webhooks/sendgrid/inbound`), which marks the enrollment **replied** — and
  the sender skips any non-active enrollment, so remaining steps stop.
- **Pause / resume:** pausing freezes the enrollment (the due step is held, not
  lost). Resuming continues **forward** from the next unsent step — it does **not**
  blast the backlog.
- **Cancel:** stops the enrollment permanently.

---

## 5. Auto-enrollment rules (Automations tab)

Instead of adding candidates by hand, a **rule** enrolls them when an event fires.
Managed per-sequence on the **Automations tab** of the sequence page.

- **Triggers:** `tag_added` (a tag is added to a candidate) and `stage_moved`
  (an application moves to a named pipeline stage).
- **How it runs:** a poll (`scanAutomations`,
  `src/modules/crm/domain/automations.ts`) runs on the queue cron tick. It reads
  new `candidate_tags` / `application_events` rows since a saved cursor
  (`automation_scan_state`), matches them to enabled rules
  (`sequence_enrollment_rules`), and enrolls via `enrollCandidate`.
- **Guardrails:** idempotent (skips anyone already active/paused), only enrolls
  into active sequences, and a scan failure never breaks the email queue.
- **Note:** the cursor starts at "now", so rules only act on events that happen
  *after* they're created — no retroactive enrollment.

Requires DB migration **`079_sequence_enrollment_rules.sql`**.

---

## 6. Analytics

The Analytics tab reads counts from `sequence_emails`. **Sent / opened / clicked /
bounced are all real** once the SendGrid **event webhook** is wired up (§9):
SendGrid posts engagement events to `/api/webhooks/sendgrid/events`, which matches
them back to the exact enrollment + stage (via custom args stamped on each send)
and updates `status` / `opened_at` / `clicked_at` / `bounced_at` / `open_count` /
`click_count`. Until that webhook is configured in the SendGrid dashboard, only
"sent" populates and the rest read zero. (`skipped` rows — §5 — never went out and
are excluded from sent/delivered counts.)

---

## 7. Honest limitations (looks built, isn't)

- **Conditional steps** ("if no reply / no open / no click"): **enforced** in the
  sender — a stage whose condition isn't met is recorded as `skipped` and the
  chain moves on. But "no open" / "no click" only have signal once SendGrid
  engagement tracking is live (§6/§9); until then those fields are 0, so nothing
  is skipped (conditions are inert, not broken). "No reply" also overlaps with the
  reply-stop in §4, which already halts the whole enrollment.
- **Business-day delays** (`delay_business_days`): stored and offered in the
  editor, but the scheduler treats them as plain calendar days — weekend-skipping
  is **not** implemented.
- **WhatsApp / SMS / LinkedIn steps:** selectable, but the sender **emails
  anyway**. Non-email delivery isn't implemented.
- **"AI Draft":** canned template text, **not** an AI call.
- **Threading** (follow-ups in one email thread): investigated and **parked** —
  SendGrid→Gmail threading is unreliable.
- **Org-level sender / domain authentication:** not built; emails send from the
  platform default (`no-reply@recruiterstack.in`). **Deliverability** (inbox vs
  spam) is the main open operational item.

---

## 8. Where things live

| Concern | File |
|---|---|
| Enroll (shared) | `src/modules/crm/domain/enroll.ts` |
| Auto-enroll engine + matchers | `src/modules/crm/domain/automations.ts` |
| Step scheduling maths | `src/lib/sequences/schedule.ts` |
| Sender (dynamic chain) | `src/lib/api/job-handlers.ts` (`sequence_email` handler) |
| Queue worker + automation scan | `src/app/api/queue/process/route.ts` |
| Enroll / stages / enrollments APIs | `src/app/api/sequences/[id]/...` |
| Clone a sequence | `src/app/api/sequences/[id]/clone/route.ts` |
| SendGrid engagement webhook | `src/app/api/webhooks/sendgrid/events/route.ts` |
| Rules API | `src/app/api/automations/...` |
| Pause/resume API | `src/app/api/enrollments/[id]/route.ts` |
| Reads facade | `src/modules/crm/domain/sequences.ts` |
| Sequence UI | `src/app/(dashboard)/sequences/[id]/page.tsx` |
| Step editor / rules tab | `src/components/sequences/SequenceStageEditor.tsx`, `SequenceAutomations.tsx` |
| Inbound reply webhook | Django `sequences/views_webhooks.py` |
| Tables | migrations `025` (sequences), `079` (rules) |

---

## 9. Operational notes

- **To make sends fire:** the external pinger must be hitting `/api/queue/process`;
  `SENDGRID_API_KEY` + `SENDGRID_FROM_EMAIL` must be set.
- **Engagement analytics + open/click conditions need:** the SendGrid **Event
  Webhook** (Settings → Mail Settings / Event Webhook) pointed at
  `https://<app>/api/webhooks/sendgrid/events?token=<SENDGRID_WEBHOOK_TOKEN>`, with
  the delivered/open/click/bounce events enabled. Set `SENDGRID_WEBHOOK_TOKEN` to a
  random secret and include it in that URL. Open/click tracking itself is enabled
  per-send in code (no dashboard toggle needed).
- **Reply-stop needs:** an MX record on the `reply.` subdomain → SendGrid Inbound
  Parse → the Django webhook (one-time infra, done).
- **Auto-enrollment needs:** migration `079` applied.
