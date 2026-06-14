# Per-Member RBAC — Build Plan

Granular, per-member access control for the centralized TA team: each member
gets access to specific **modules** at specific **action** levels, so e.g. OKRs
can be owned by one person and Payroll shared with a TA member + a Finance user,
without making everyone an org admin.

**Decisions (locked 2026-06-14):**
1. **Granularity:** module × action (`view` / `edit` / `approve`).
2. **Model:** hybrid — named **roles** (capability bundles) + per-member
   **overrides** (allow/deny on top of roles).
3. **Department scoping:** out of scope for v1 (org-wide module access). The
   existing relationship tiers (self / manager-of-direct-reports) stay as-is.

## Current state (what we build on)

Access today is **binary**, in `src/lib/rbac.ts`:
- `org_members.role` ∈ {`admin`, `recruiter`, `hiring_manager`, `interviewer`},
  but **only `admin` gates anything**. `getViewerScope` returns
  `{ isAdmin, employeeId, reportIds }`.
- Sidebar gates `People` / `Payroll` / `Admin` behind a single `adminOnly` flag
  via `/api/me`'s `is_admin`.
- HRIS endpoints already call `getViewerScope` + `canViewEmployee` /
  `canViewSensitive` — these are **relationship** checks (self / manager) and
  **stay**, orthogonal to module capabilities.

The gap: no way to grant a non-admin access to one module, or to split module
access across members. That's what this adds.

## Model

### Capabilities (the vocabulary)

A capability is `"<module>:<action>"`, defined as a fixed registry in code
(`src/lib/rbac/capabilities.ts`) so the app knows every capability that exists:

```
recruiting:view  recruiting:edit
openings:view    openings:edit    openings:approve
people:view      people:edit
onboarding:view  onboarding:edit
okrs:view        okrs:edit
documents:view   documents:edit
hr_cases:view    hr_cases:edit
leave:view       leave:approve
payroll:view     payroll:edit
analytics:view
approvals:view   approvals:approve
settings:view    settings:edit
```

`edit` implies create/update/delete within the module; `view` is read-only;
`approve` is the decision action (requisitions, leave, approval chains). The set
is intentionally small and module-grouped — extend as modules grow.

**Not capability-gated:** the `/me` self-service surface and a manager's view of
their own direct reports — those remain relationship-based (you can always see
your own record; a manager always sees their reports). Capabilities gate the
org/admin module surfaces only.

### Roles + overrides (hybrid)

- **Role** = an org-scoped, named bundle of capabilities (`is_system` for seeded
  ones, custom roles addable). Seeded system roles:
  - **Owner** — `*` (all capabilities) + manages roles/permissions; cannot be
    locked out (at least one Owner enforced).
  - **Administrator** — all module capabilities (no special owner powers).
  - **Recruiter** — `recruiting:*`, `openings:view`, `analytics:view`.
  - **Hiring Manager** — `recruiting:view`, `openings:view/approve`,
    `approvals:approve`.
  - **Interviewer** — `recruiting:view`.
  - (module-specific examples to create as custom roles: **Payroll Admin** =
    `payroll:*`; **OKR Manager** = `okrs:*`.)
- **Member overrides** — per-member `allow` / `deny` of individual capabilities
  on top of assigned roles, for one-off grants (your "give Priya OKRs" /
  "add the Finance user to Payroll" cases — either a custom role *or* an override).
- **Effective set** = `(∪ caps of assigned roles) ∪ (member allows) − (member denies)`.
  Precedence: **deny > allow > role**. Owner short-circuits to all.

## Schema (new migration)

```sql
CREATE TABLE roles (
  id UUID PK, org_id TEXT NOT NULL, name TEXT NOT NULL,
  description TEXT, is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
  UNIQUE(org_id, name)
);
CREATE TABLE role_capabilities (role_id UUID FK→roles, capability TEXT,
  PRIMARY KEY(role_id, capability));
CREATE TABLE member_roles (org_id TEXT, user_id TEXT, role_id UUID FK→roles,
  PRIMARY KEY(org_id, user_id, role_id));
CREATE TABLE member_capability_overrides (org_id TEXT, user_id TEXT,
  capability TEXT, effect TEXT CHECK (effect IN ('allow','deny')),
  PRIMARY KEY(org_id, user_id, capability));
-- RLS service_role_all to match convention.
```
`capability` values are validated against the code registry at write time, not
by an enum (keeps the vocabulary in one place).

## Central resolver (extends `src/lib/rbac.ts`)

- `getPermissionSet(supabase, orgId, userId): Promise<Set<Capability>>` — resolves
  roles + overrides into the effective set (one batched query); Owner → all.
- Extend `ViewerScope` with `capabilities: Set<string>` and `isOwner` so
  `getViewerScope` remains the single resolve point.
- `can(scope, cap): boolean` and `assertCan(scope, cap): NextResponse | null`
  (returns 403 to `return` as-is, mirroring the existing assert helpers).

## Enforcement (the four surfaces — all must agree)

1. **API routes** — each guarded endpoint calls `assertCan(scope, '<cap>')`. A
   route→capability map covers every HRIS / payroll / openings / approvals /
   settings / recruiting endpoint.
2. **Nav** — `/api/me` returns the capability set; each `NAV_SECTIONS` item gets
   a `requiredCapability`; the sidebar filters by it (replaces `adminOnly`).
3. **Agent layer** — the orchestrator + ATS/HRIS sub-agents check the acting
   user's capabilities before executing a tool (each tool maps to a capability).
   **Critical:** without this, a member with no Payroll access could just *ask
   the copilot* to read payroll.
4. *(Data/RLS, department scoping — deferred.)*

## Admin UI

A **"Team & Permissions"** screen (under Settings, gated by `settings:edit` /
Owner): member list with assigned roles, a role assignment editor, per-member
capability overrides, and a roles editor (create/edit a role via a
module × action capability grid). Enforce "≥1 Owner" and "can't remove your own
Owner" guards.

## Slices

| Slice | Goal | Notes |
| --- | --- | --- |
| **0 — Model & resolver** ✅ DONE (2026-06-14) | Migration 065 (`rbac_roles`/`rbac_role_capabilities`/`rbac_member_roles`/`rbac_member_overrides` — prefixed to avoid the legacy `roles` table); capability registry + pure resolver in `src/lib/permissions.ts`; `getPermissionSet`/`can`/`assertCan` in `rbac.ts` (standalone, **not** wired into `getViewerScope` yet); seed Owner + Recruiter per org; backfill admins→Owner, others→Recruiter. **No enforcement.** | Additive, reversible. Resolver dormant — deploy-safe before/after the migration. |
| **1 — Enforce at API** ✅ DONE (2026-06-14) | Capability gates on guarded routes via a multi-agent workflow (130 route-methods) + reviewed dispositions for 35 flagged routes (Slice 1b). Foundation: `getViewerScope` resolves capabilities; `assertCapability(scope,cap)`; `withCapability(cap,handler)` wrapper; `requireCapability(cap)` (auth-admin); `ensureDefaultMemberRole` on member creation. Open recruiter-UX reads + engine/relationship gates left as-is by review. | Behavior-preserving for Owner + Recruiter populations; 5/5 parity PASS, 362 tests, guard green. |
| **2 — Enforce at nav** | Capability-driven sidebar; `/api/me` returns caps; drop `adminOnly`. | Visible parity check against current sidebar. |
| **3 — Enforce in agent** | Orchestrator + sub-agent tools gate on the acting user's caps. | Closes the "ask the AI to bypass" hole. |
| **4 — Admin UI** | Team & Permissions screen (roles + assignments + overrides). | First point where access can actually be *customized*. Can be pulled earlier to configure before enforcing. |
| **5 — Cleanup** | Deprecate the legacy `org_members.role` coarse gating; tests for the resolver/precedence; optional drift note. | |

**Sequencing:** 0 first. Because Slice 0's backfill preserves current behavior,
1/2/3 can land in any order without breaking anyone (defaults = today). 4 needs
0; pull it before 1–3 if you want to configure roles before flipping enforcement.
**Recommended:** 0 → 1 → 2 → 3 → 4 → 5.

## Guardrails

- **Backfill must be behavior-preserving** — verify each existing member's
  effective set equals their current access before any enforcement slice ships.
- **Never lock out the org** — enforce ≥1 Owner; Owner bypasses all checks.
- **One source of truth** — capability registry in code; every surface (API,
  nav, agent) resolves through `getPermissionSet`/`can`, never ad-hoc role checks.
- **Reversible** — each migration has a documented rollback; enforcement slices
  revert by reverting the commit (schema stays).

## Risks

| Risk | Slice | Mitigation |
| --- | --- | --- |
| Backfill changes someone's effective access | 0 | Diff effective-set vs current `isAdmin`-derived access per member before enabling enforcement |
| Enforcement locks an admin out of a needed surface | 1–3 | Owner bypass + safe defaults; stage one surface at a time |
| Agent bypasses module gates | 3 | Tool→capability map; sub-agent executor asserts before run; test with a low-privilege user |
| Permission checks add latency (per-request resolve) | 1 | Resolve once per request into `ViewerScope`; cache on the request |
