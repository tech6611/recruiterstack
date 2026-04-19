// Approval engine types — hand-written to match migration 036.

// ── Condition DSL ────────────────────────────────────────────
// JSON-serializable boolean logic evaluated against a target object.
// See the ConditionEvaluator service (step 5).

export type ConditionOp =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'not_in'
  | 'contains'
  | 'exists'

export interface ConditionLeaf {
  field: string                              // dot-notation: 'comp_max' | 'location.country'
  op: ConditionOp
  value?: unknown
}

export interface ConditionAll  { all:  Condition[] }
export interface ConditionAny  { any:  Condition[] }
export interface ConditionNot  { not:  Condition }

export type Condition = ConditionLeaf | ConditionAll | ConditionAny | ConditionNot

// ── Approval target + status ─────────────────────────────────

export type ApprovalTargetType = 'opening' | 'job' | 'offer'
export type ApprovalStatus     = 'pending' | 'approved' | 'rejected' | 'cancelled'

export type ApprovalStepStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'skipped'
  | 'not_applicable'

export type ApproverType = 'user' | 'role' | 'hiring_team_member' | 'group'
export type ChainStepType = 'sequential' | 'parallel'

// Shape of approver_value JSONB — varies by approver_type.
export type ApproverValue =
  | { user_id: string }                                     // user
  | { role: string }                                        // role (org role) OR hiring_team_member (role-in-team)
  | { group_id: string }                                    // group

// Shape of approval_steps.approvers JSONB
export interface ResolvedApprover {
  user_id: string
}

// Shape of approval_steps.decisions JSONB
export interface ApprovalDecision {
  user_id: string
  decision: 'approved' | 'rejected'
  comment: string | null
  at: string                                                // ISO timestamp
}

// ── Chain (template) ─────────────────────────────────────────

export interface ApprovalChain {
  id: string
  org_id: string
  name: string
  description: string | null
  target_type: ApprovalTargetType
  scope_conditions: Condition | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ApprovalChainInsert extends Omit<ApprovalChain,
  'id' | 'created_at' | 'updated_at' | 'description' | 'scope_conditions' | 'is_active' | 'created_by'> {
  id?: string
  description?: string | null
  scope_conditions?: Condition | null
  is_active?: boolean
  created_by?: string | null
  created_at?: string
  updated_at?: string
}

export interface ApprovalChainUpdate extends Partial<ApprovalChainInsert> {}

// ── Chain Step (template) ────────────────────────────────────

export interface ApprovalChainStep {
  id: string
  chain_id: string
  step_index: number
  name: string
  step_type: ChainStepType
  parallel_group_id: string | null
  condition: Condition | null
  approver_type: ApproverType
  approver_value: ApproverValue
  min_approvals: number
  sla_hours: number | null
  created_at: string
}

export interface ApprovalChainStepInsert extends Omit<ApprovalChainStep,
  'id' | 'created_at' | 'step_type' | 'parallel_group_id' | 'condition' | 'min_approvals' | 'sla_hours'> {
  id?: string
  step_type?: ChainStepType
  parallel_group_id?: string | null
  condition?: Condition | null
  min_approvals?: number
  sla_hours?: number | null
  created_at?: string
}

export interface ApprovalChainStepUpdate extends Partial<ApprovalChainStepInsert> {}

// ── Approval (instance) ──────────────────────────────────────

export interface Approval {
  id: string
  org_id: string
  approval_chain_id: string
  target_type: ApprovalTargetType
  target_id: string
  status: ApprovalStatus
  current_step_index: number
  requested_by: string
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface ApprovalInsert extends Omit<Approval,
  'id' | 'created_at' | 'updated_at' | 'status' | 'current_step_index' | 'completed_at'> {
  id?: string
  status?: ApprovalStatus
  current_step_index?: number
  completed_at?: string | null
  created_at?: string
  updated_at?: string
}

export interface ApprovalUpdate extends Partial<ApprovalInsert> {}

// ── Approval Step (instance) ─────────────────────────────────

export interface ApprovalStep {
  id: string
  approval_id: string
  chain_step_id: string
  step_index: number
  parallel_group_id: string | null
  status: ApprovalStepStatus
  approvers: ResolvedApprover[]
  decisions: ApprovalDecision[]
  min_approvals: number
  due_at: string | null
  activated_at: string | null
  completed_at: string | null
  created_at: string
}

export interface ApprovalStepInsert extends Omit<ApprovalStep,
  'id' | 'created_at' | 'status' | 'approvers' | 'decisions' | 'due_at' | 'activated_at' | 'completed_at' | 'parallel_group_id' | 'min_approvals'> {
  id?: string
  status?: ApprovalStepStatus
  approvers?: ResolvedApprover[]
  decisions?: ApprovalDecision[]
  due_at?: string | null
  activated_at?: string | null
  completed_at?: string | null
  parallel_group_id?: string | null
  min_approvals?: number
  created_at?: string
}

export interface ApprovalStepUpdate extends Partial<ApprovalStepInsert> {}

// ── Audit Log ────────────────────────────────────────────────

export type AuditAction =
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'step_activated'
  | 'step_decided'
  | 'step_skipped'
  | 'edit_cancelled'
  | 'sla_breach'
  | 'auto_approved'

export interface ApprovalAuditLog {
  id: string
  org_id: string
  approval_id: string | null
  target_type: ApprovalTargetType | null
  target_id: string | null
  actor_user_id: string | null
  action: AuditAction | string              // allow string to avoid enum lock-in
  from_state: string | null
  to_state: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface ApprovalAuditLogInsert extends Omit<ApprovalAuditLog,
  'id' | 'created_at' | 'approval_id' | 'target_type' | 'target_id' | 'actor_user_id' | 'from_state' | 'to_state' | 'metadata'> {
  id?: string
  approval_id?: string | null
  target_type?: ApprovalTargetType | null
  target_id?: string | null
  actor_user_id?: string | null
  from_state?: string | null
  to_state?: string | null
  metadata?: Record<string, unknown>
  created_at?: string
}
