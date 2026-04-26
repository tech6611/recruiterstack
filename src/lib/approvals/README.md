# Approvals module

Engine + supporting helpers for the Requisition module's approval flows.
Targets: openings, jobs, offers (offer support is wired but the offer
module itself is out of scope).

## Files

| File | Role |
|------|------|
| `engine.ts` | `submitForApproval`, `decideOnStep`, `cancelApproval`. Block-aware (sequential + parallel). Auto-approves when requester is the sole approver. |
| `condition.ts` | JSON DSL evaluator: `eq`, `neq`, `gt`/`gte`/`lt`/`lte`, `in`, `not_in`, `contains`, `exists`. Supports `all`/`any`/`not` and dot-notation paths (`location.country`, `custom_fields.seniority`). |
| `chain-selector.ts` | Picks the most-specific matching active chain at submit time. Specificity = `scope_conditions` leaf count; ties broken by `updated_at` desc. |
| `approver-resolver.ts` | Resolves user/role/hiring_team_member/group approver types. Every resolved user passes through `applyDelegation` (OOO + deactivated → delegate). |
| `notifications.ts` | Best-effort email + Slack DM (with Block Kit interactive buttons) at every transition. Failures logged, never thrown. |
| `audit.ts` | `writeAudit` — never throws; non-critical persistence. |
| `sla-handler.ts` | Job-queue handler for `approval_sla_check`. Enqueued at step activation, fires at `due_at`. |

## State machine

```
Approval:  pending → (approved | rejected | cancelled)
Step:      pending → (approved | rejected | skipped | not_applicable)
```

No backward transitions. Every transition writes to `approval_audit_log`.

## Block model

A "block" is the unit of progress.

- A block contains all currently-pending steps that share a `parallel_group_id`.
- Sequential steps (`parallel_group_id IS NULL`) form singleton blocks.
- The block at the lowest `step_index` is "active".
- The active block completes only when *every* step in it is non-pending
  (approved, rejected, skipped, or not_applicable).
- A reject in **any** parallel step fails the entire approval immediately.
- Conditions are evaluated **at submit time** (`engine.submitForApproval`).
  Steps with a `false` condition start as `not_applicable` and are skipped
  for block-completion purposes.

## Chain selection

```
1. Fetch active chains for (org_id, target_type)
2. Filter to those whose scope_conditions evaluate true against the target
3. Pick the most specific (max scope_conditions leaf count)
4. Tie-break by updated_at desc
5. If no chain matches: ApprovalError(422, "No approval chain matches…")
```

## Approver resolution

- `user`               — fixed user_id
- `role`               — first user holding the org role (`admin`, `recruiter`, `hiring_manager`, `interviewer`)
- `hiring_team_member` — user with the given role on the linked Job's hiring team; falls back to `opening.hiring_manager_id` for `role='hiring_manager'` if no Job is linked yet
- `group`              — concrete `approval_group_members` membership

After raw resolution, every user_id passes through `applyDelegation`:
- if `out_of_office_until > now()` OR `deactivated_at IS NOT NULL` → swap with `delegate_user_id`
- recursive (delegate may also be OOO); bounded at 5 hops

## Notifications

Triggered by the engine at:
- step activation → email + Slack interactive DM to each resolved approver
- step decided → email + Slack to requester
- approval completed → email + Slack to requester
- SLA breach → email + Slack to approver(s) and requester (once per step,
  guarded by `approval_steps.sla_breach_notified_at`)

All notification calls are fire-and-forget — engine state mutations commit
before notifications dispatch.

## Webhooks

Outbound events emitted via `lib/webhooks/emit.ts` whenever the engine
transitions an approval, plus job publish:
- `opening.submitted/approved/rejected/cancelled`
- `job.submitted/approved/published`
- `approval.step.decided`
- `approval.completed`

Each subscription receives a delivery row + a `webhook_delivery` job. The
delivery handler signs the body with HMAC-SHA256 (`X-RecruiterStack-Signature`
header, `sha256=<hex>`) and POSTs. Non-2xx responses are retried via the
job_queue's exponential-backoff path.

## Adding a new approver type

1. Add the type to `ApproverType` in `src/lib/types/approvals.ts` + the DB
   `CHECK` constraint on `approval_chain_steps.approver_type`.
2. Implement raw resolution in `approver-resolver.ts → rawApproverIds`.
3. Update the chain builder UI (`components/approvals/ChainBuilder.tsx`) to
   render the picker for the new type.

## Adding a new condition operator

1. Add to `ConditionOp` in `src/lib/types/approvals.ts`.
2. Handle it in `condition.ts → apply`.
3. Add to the dropdown in `ChainBuilder.tsx`.
4. Add a unit test in `__tests__/condition.test.ts`.
