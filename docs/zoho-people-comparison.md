# RecruiterStack HRIS vs Zoho People — feature inventory + the two-interface gap

You called out — correctly — that what we have isn't a real "people platform"
yet. You compared us to **Zoho People** (a mature, mid-market HRMS used by 45K+
businesses) and you flagged the architectural truth we hadn't named:

> **A people platform has TWO interfaces, not one** — one for HR / managers /
> relevant teams, and one for every employee (self-service).

We've been building only the first. That's not a minor gap — it's the
structural difference between an "HR tool" and a "people platform." This doc
inventories what Zoho People actually does, compares it honestly to where we
are, names the two-interface gap, and recommends what to actually build vs
what to deliberately not chase.

## TL;DR

- **Zoho People is feature-vast** — 10+ modules, 5 pricing tiers, ~$1.25–$4.50
  per user/month. It's the breadth-first incumbent for the SMB/mid-market HR
  software category. We will never out-feature them, and we shouldn't try.
- **Zoho People is also generic** — same HR product for an accounting firm and
  a SaaS startup. Their AI is bolted on; their unified-data story is weaker
  than ours; their ATS↔HRIS connection is partial (you still need Zoho Recruit
  + Zoho People, with a sync between them).
- **The right strategic move isn't to clone Zoho** — it's to (a) close the
  **two-interface gap** so we're actually a "people platform" not just an HR
  admin tool, (b) pick the ~5 HR modules that matter for the segment we
  realistically serve, and (c) sharpen what's structurally different: a single
  unified `people` record across ATS/CRM/HRIS, agentic-by-default UX.

## The two-interface insight (the bigger architectural point)

Every mature people platform splits into two distinct UIs that **share the same
underlying data** but expose completely different surfaces:

```
   ┌───────────────────────────┐         ┌────────────────────────────┐
   │   HR / Admin / Manager    │         │   Employee self-service    │
   │  (configure + manage)     │         │   (do my own stuff)        │
   ├───────────────────────────┤         ├────────────────────────────┤
   │ • Whole-org employee list │         │ • My profile               │
   │ • Approve leave / comp    │         │ • My leave (balance,       │
   │ • Run appraisal cycles    │         │   request, history)        │
   │ • Configure policies      │         │ • My payslip / comp        │
   │ • Org-wide analytics      │         │ • My team (if manager)     │
   │ • HR case routing         │         │ • My approvals (inbox)     │
   │ • Set up onboarding       │         │ • My tasks / onboarding    │
   │                           │         │ • My courses (LMS)         │
   │                           │         │ • My goals / OKRs          │
   │                           │         │ • Submit expense / case    │
   │                           │         │ • Directory + colleagues   │
   └──────────────┬────────────┘         └────────────┬───────────────┘
                  │                                    │
                  └──────────── ONE canonical people record ────────────┘
```

**What we have today is the LEFT column only** — `/hris/employees` (whole-org
list), `/hris/employees/[id]` (HR managing one record), `/hris/org-chart`. There
is no "me" surface. An employee can't log in and see *their own* leave balance,
their *own* compensation, *their own* timeline. The copilot can answer
questions about anyone — but there's no UI saying "this is yours."

**Why this is architectural, not cosmetic:**

1. **Auth shape** — today every API route returns *org-scoped* data filtered
   only by `org_id`. Self-service needs *user-scoped* filtering (by
   `requester_user_id` resolved to their `employee_profile`).
2. **Identity bridge** — we just built `employee_profiles.user_id` for
   manager-routed approvals (migration 050). That same bridge is what makes
   self-service possible: "who am I as an employee?" answers via
   `users.id → employee_profiles.user_id`.
3. **Permissions/RBAC** — admin vs manager vs employee see *different things*
   for the same data. An employee sees only their comp; a manager sees their
   reports' comp; admin sees all comp. We don't have role-based filtering yet.
4. **UI surface** — a `/me` (or `/my`) route family that mirrors the HR pages
   but filtered to "the requesting user's records."

Without this, calling RecruiterStack a "people platform" is generous. It's a
people-data backend with an HR admin UI.

## Zoho People — the complete feature inventory

What Zoho People actually ships, organized by module. (Tier in parens; "All" =
in every paid tier, "P" = Professional+, "Pr" = Premium+, "E" = Enterprise.)

### Core HR (All)
- Employee database / records with custom fields
- **Onboarding workflows** (forms, e-sign, checklists, IT provisioning hooks)
- **Offboarding workflows** (exit interviews, asset return, access revocation)
- **HR letters** (auto-generated, templated — offer, confirmation, experience)
- **Document management** (per-employee storage, expiry alerts, signature)
- Forms (custom employee/HR forms)
- Localization (system terminology, country-specific UI)

### Time & Attendance (Professional+)
- **Clock-in/clock-out** (web, mobile, biometric, facial recognition)
- **Geofencing & geo-tagging** (mark attendance only inside office range)
- **Shift planning & rotation** (multi-shift schedules per team)
- Real-time tracking — hours, overtime, breaks
- **Timesheets** (project time logging — useful for billable hours / consulting)

### Leave Management (All)
- Leave request + approval (✓ we have this)
- **Leave balance tracking** with accruals
- **Country/jurisdiction-specific leave types** (e.g., India sick/casual/earned)
- **Holiday calendars** per location
- Comp-off, carry-forward, encashment policies

### Performance Management (Premium+)
- **OKRs** (objectives + key results per employee/team)
- **360-degree feedback** (peer/manager/direct-report reviews)
- **Appraisal cycles** (configurable review periods, multi-stage)
- **Skill matrices / skill insights** (track skills per role/employee)
- Self-evaluation forms
- KRA (Key Result Area) tracking

### Learning Management — LMS (Enterprise; add-on lower tiers)
- **Course creation** (blended + self-paced)
- **Online tests** (question bank, random generator, auto-grading)
- **Skill-set integration** — completing a course auto-updates skill scores in
  the performance module. This integration is structurally interesting.
- Trainer feedback, certificates, learning paths

### HR Helpdesk / Case Management (Enterprise; add-on lower tiers)
- **Employee ticketing** — HR cases by category (leave query, payroll, policy)
- SLA tracking + escalation
- FAQs, assigned agents, employee satisfaction scoring on resolution

### Compensation & Benefits (new in 2026, Premium+)
- Comp records, salary tracking (✓ we have this)
- Historic revisions (✓ we have this)
- Pay tracking, benefits enrollment, loan tracking

### Expense Management (Professional+)
- Submit expense claims with receipts (mobile + web)
- Approval workflows, reimbursement tracking
- Categorize, attach to projects

### Engagement (Premium+)
- **eNPS surveys** (employee net promoter score, periodic)
- Announcements / company feed
- Peer recognition (kudos / shout-outs)
- Pulse polls

### Analytics (Premium+)
- HR dashboards (turnover, headcount, leave patterns)
- Custom report builder
- Workforce analytics

### Mobile App (All tiers)
- Self-service for everything — leave, attendance, payslip, profile, directory
- Field employees mark attendance with geo-restriction
- Notifications for approvals, tasks, announcements

### Integrations
- Zoho ecosystem (Recruit ATS, Payroll, Desk, Books) — separate products,
  sync'd. This is the architectural seam we already exploited: Zoho's
  ATS↔HRIS is *integration*, ours is *one record*.
- 100+ third-party (Slack, Teams, Google Workspace, Office 365)

## Pricing tiers — what's "table stakes" vs "premium"

| Tier         | $/user/mo | What unlocks                                          |
| ------------ | ---------:| ----------------------------------------------------- |
| Free         |    $0     | Up to 5 employees                                     |
| Essential HR |   $1.25   | Core HR + leave (basic)                               |
| Professional |   $2.00   | + Attendance, shift scheduling, timesheets, expenses  |
| Premium      |   $3.00   | + Performance (360, eNPS), analytics, compensation    |
| Enterprise   |   $4.50   | + Case management, LMS bundled                        |

What this tells us: **leave, attendance, expenses, comp, performance, LMS** are
each table-stakes for a "real" people platform — they show up at every tier
that markets itself as one. Helpdesk + LMS are the premium hooks.

## Brutally honest gap table — RecruiterStack today vs Zoho People

| Module                       | Zoho People | RecruiterStack today                     | Gap |
| ---------------------------- | ----------- | ---------------------------------------- | --- |
| Employee records             | ✅           | ✅ (`employee_profiles`)                  | shallow but present |
| Onboarding workflows         | ✅           | ❌ (we onboard *orgs*, not new hires)     | **big** |
| Offboarding                  | ✅           | partial (terminate flips status)         | medium |
| HR letters / docs            | ✅           | ❌                                        | **big** |
| Document storage             | ✅           | ❌                                        | **big** |
| Leave request/approve        | ✅           | ✅ (just shipped, slice 3)                | parity (lifecycle only) |
| Leave balances/accruals      | ✅           | ❌ (deliberately deferred)                | medium |
| Holiday calendars            | ✅           | ❌                                        | medium |
| Clock-in/out, attendance     | ✅           | ❌                                        | **big** |
| Shift scheduling             | ✅           | ❌                                        | **big** (segment-specific) |
| Timesheets                   | ✅           | ❌                                        | medium |
| Compensation history         | ✅           | ✅ (slice 2)                              | parity |
| Performance / OKRs           | ✅           | ❌                                        | **big** |
| 360 feedback / appraisals    | ✅           | ❌                                        | **big** |
| Skill matrices               | ✅           | ❌                                        | medium |
| LMS / courses                | ✅           | ❌                                        | **big** (heavy module) |
| HR helpdesk / cases          | ✅           | ❌                                        | **big** |
| Expense management           | ✅           | ❌                                        | medium |
| Engagement (eNPS, kudos)     | ✅           | ❌                                        | medium |
| Announcements / feed         | ✅           | ❌                                        | medium |
| HR analytics                 | ✅           | partial (recruiting only)                 | **big** for HR |
| Mobile self-service app      | ✅           | ❌                                        | **big** (or PWA) |
| Org chart                    | ✅           | ✅ (slice 1A)                             | parity |
| Reports-to / manager mgmt    | ✅           | ✅                                        | parity |
| Employee timeline            | partial     | ✅ (richer than Zoho's audit log)         | **us ahead** |
| **Two-interface UX**         | ✅           | ❌ (admin-only today)                     | **structural** |
| Unified ATS↔HRIS one record  | partial     | ✅                                        | **us ahead** |
| Unified CRM↔ATS↔HRIS         | ❌           | partial (CRM not migrated yet)            | **future moat** |
| Agentic-first interaction    | partial     | ✅                                        | **us ahead** |

**Summary read:** Zoho has us on **breadth** (especially onboarding, docs,
performance, LMS, helpdesk, mobile, self-service). We're at parity on the
slices we deliberately built. We're ahead on (a) unified data across ATS/HRIS
on one identity, (b) the employee timeline as a first-class object, (c)
agentic UX as the primary interaction model.

## What we should actually do (strategic recommendation)

Don't chase Zoho on breadth. Chase the **shape of a people platform** so we
stop being mistaken for an HR admin tool, then double down on what's
structurally ours.

### Tier 1 — must-have to be a "people platform" (the architectural gap)

These aren't features — they're the platform's shape. Without them we're not
in the category.

1. **Employee self-service UI surface (`/me/*`)** — my profile, my leave (with
   balance once we add it), my comp, my timeline, my approvals inbox, my team
   (if manager). This is the architectural fix to the two-interface gap. It
   reuses every API we have plus user-scoped filtering and role-based visibility.
2. **Role-based access control (RBAC)** — HR admin / manager / employee.
   Determines what each surface shows. Today we have `org_members.role` and
   `manager_id`; we need to actually enforce them on read APIs.
3. **Notifications inbox per user** — "X requested time off (approve)", "Your
   request was approved", "You have a comp adjustment". We have a
   `notifications` table from earlier work — needs wiring into HRIS events.

### Tier 2 — the next ~5 HR modules that genuinely matter

Pick a tight set; don't chase all 12 Zoho modules. The ones that map to your
target segment (modern startups / knowledge work, not factory floors):

1. **Onboarding** — first-day checklists, document collection, IT provisioning
   hooks (Clerk org invite, Slack invite, etc.). Closes the apply→hired→**onboarded** loop on the same identity. Visible, fast to demo.
2. **Documents** — per-employee storage with categories (offer letter, ID,
   signed agreements) and expiry alerts. Doesn't need DocuSign in v1 —
   storage + categorization is enough for most use cases.
3. **Leave balances + holiday calendars** — the obvious next step on time-off.
   Lightweight per-policy accrual rules. Country-specific is heavy; skip for v1.
4. **HR cases (lightweight helpdesk)** — employee raises a question/issue,
   routed to HR. This is where the agentic moat shines — the agent can answer
   most cases without a human, and HR only sees what's escalated. Genuinely
   differentiated UX.
5. **Performance — start with OKRs + 1:1s + simple skill tags.** Not full 360
   yet. OKRs are the most-used part of Zoho's performance module anyway, and
   they're a clean primitive on top of the existing identity.

### Tier 3 — deliberately defer or skip

- **LMS** — heavy module, niche outside enterprise. Partner/integrate later.
- **Shift scheduling / biometric** — wrong segment for us; that's manual labor /
  retail / factory. Knowledge-work startups don't need it.
- **Expense management** — partner (Expensify, Ramp, Brex) instead of building.
- **Mobile native app** — start with a responsive PWA on the self-service
  surface; native iOS/Android is a deferred decision.
- **Engagement (eNPS, kudos)** — nice-to-have; skip until we have customers
  asking for it.
- **Country-specific compliance** — only when we have multi-country customers
  actually paying.

### Tier 4 — the differentiators we own (sharpen, don't dilute)

These are where we *win*, not match:

1. **Unified ATS↔CRM↔HRIS on one `person_id`** — finish the CRM migration so
   the suite story is structurally complete (3 modules sharing one identity).
2. **Agentic-first everywhere** — every new module gets sub-agent tools as the
   primary surface, with the UI as the secondary view. Zoho retrofits AI;
   we're built that way.
3. **The employee timeline as the spine** — every HR event lands on it
   automatically (we do this; Zoho's audit log is per-module). Sell this.

## The honest reframe of where we are

Today, **we are not a people platform** — we are an HRIS *data layer* with an
HR admin UI. The architecture is right; the surface is half-built. The single
biggest move to actually become one is the **employee self-service interface**.
That's the next slice we should build.

After that, the order most likely is: onboarding → documents → leave balances
→ HR cases → OKRs. Each plays well with the agentic angle.

## Sources

- [Zoho People — features](https://www.zoho.com/people/features.html) ·
  [What's new 2026](https://www.zoho.com/people/whats-new.html) ·
  [Pricing](https://www.zoho.com/people/zohopeople-pricing.html) ·
  [Pricing tiers comparison](https://www.zoho.com/people/pricing-comparison.html)
- [Employee self-service](https://www.zoho.com/people/employee-self-service.html) ·
  [Employee management system](https://www.zoho.com/people/employee-management-system.html)
- [HR helpdesk / cases](https://www.zoho.com/people/hr-helpdesk-software.html) ·
  [Case management overview](https://help.zoho.com/portal/en/kb/people/administrator-guide/query-management/articles/cases-service-overview)
- [LMS](https://www.zoho.com/people/learning-management-system.html) ·
  [Mobile app](https://www.zoho.com/people/peopleapp.html)
- [Zoho People review 2026](https://www.linktly.com/hr-software/zoho-people-review/) ·
  [Zoho People pricing analysis](https://www.tinyteam.io/blog/zoho-people-pricing)
- Earlier RecruiterStack research:
  [HRIS architecture comparison](./hris-architecture-comparison.md) ·
  [Hire-to-employee research](./hire-to-employee-research.md) ·
  [Platform modular architecture](./platform-modular-architecture.md)
