// Auto-generated shape matching the Supabase schema.
// Re-run `supabase gen types typescript` after schema changes.

// Requisition module tables (migrations 032–039) live in dedicated files.
import type {
  User              as ReqUser,
  UserInsert        as ReqUserInsert,
  UserUpdate        as ReqUserUpdate,
  OrgMember,
  OrgMemberInsert,
  OrgMemberUpdate,
  Department,
  DepartmentInsert,
  DepartmentUpdate,
  Location          as ReqLocation,
  LocationInsert,
  LocationUpdate,
  CompensationBand,
  CompensationBandInsert,
  CompensationBandUpdate,
  Opening,
  OpeningInsert,
  OpeningUpdate,
  Job               as ReqJob,
  JobInsert,
  JobUpdate,
  JobOpening,
  JobPosting,
  JobPostingInsert,
  JobPostingUpdate,
  HiringTeam,
  HiringTeamInsert,
  HiringTeamUpdate,
  HiringTeamMember,
  HiringTeamMemberInsert,
  CustomFieldDefinition,
  CustomFieldDefinitionInsert,
  CustomFieldDefinitionUpdate,
} from './requisitions'
import type {
  ApprovalChain,
  ApprovalChainInsert,
  ApprovalChainUpdate,
  ApprovalChainStep,
  ApprovalChainStepInsert,
  ApprovalChainStepUpdate,
  Approval,
  ApprovalInsert,
  ApprovalUpdate,
  ApprovalStep,
  ApprovalStepInsert,
  ApprovalStepUpdate,
  ApprovalAuditLog,
  ApprovalAuditLogInsert,
} from './approvals'
import type {
  WebhookSubscription,
  WebhookSubscriptionInsert,
  WebhookSubscriptionUpdate,
  WebhookDelivery,
  WebhookDeliveryInsert,
} from './webhooks'
import type {
  UserIntegration,
  UserIntegrationInsert,
  UserIntegrationUpdate,
} from './integrations'
import type {
  ApprovalGroup,
  ApprovalGroupInsert,
  ApprovalGroupUpdate,
  ApprovalGroupMember,
  ApprovalGroupMemberInsert,
} from './approval-groups'

export type CandidateStatus =
  | 'active'
  | 'on_hold'
  | 'inactive'
  | 'interviewing'
  | 'offer_extended'
  | 'hired'
  | 'rejected'

export type RoleStatus = 'draft' | 'active' | 'paused' | 'closed'

// Person — the canonical universal human record (identity that follows a human
// across the apply → employee lifecycle). See docs/canonical-data-model.md.
export interface Person {
  id: string
  org_id: string
  name: string
  email: string
  phone: string | null
  linkedin_url: string | null
  created_at: string
  updated_at: string
}

export interface PersonInsert
  extends Omit<Person, 'id' | 'created_at' | 'updated_at' | 'phone' | 'linkedin_url'> {
  id?: string
  created_at?: string
  updated_at?: string
  phone?: string | null
  linkedin_url?: string | null
}

export interface PersonUpdate extends Partial<PersonInsert> {}

// Employee Profile — a Person in their employee role. Created (PENDING) when a
// candidacy is dispositioned hired, flips to ACTIVE when they join the org. The
// same person_id spans candidate → employee. See docs/hire-to-employee-research.md.
export type EmployeeStatus = 'pending' | 'active' | 'terminated'

export interface EmployeeProfile {
  id: string
  org_id: string
  person_id: string
  candidate_id: string | null
  application_id: string | null
  department_id: string | null
  manager_id: string | null
  user_id: string | null
  status: EmployeeStatus
  hired_at: string | null
  start_date: string | null
  joined_at: string | null
  terminated_at: string | null
  // Payroll v1 (migration 058): per-employee tax regime override.
  // Defaults to 'new' to match the govt default since FY 2023-24.
  tax_regime: 'new' | 'old'
  // Migration 059: optional DOB. Used by Payroll v1.2 to derive the 80DDB
  // senior flag automatically when the patient is 60+; also future age-cohort
  // analytics + retirement workflows.
  date_of_birth: string | null
  created_at: string
  updated_at: string
}

// Per-employee audit log: every employment transition becomes a row here. New
// event_types extend the lifecycle (comp_changed, transferred, etc.) without
// adding new columns. See migration 048.
export type EmploymentEventType =
  | 'hired'
  | 'joined'
  | 'manager_changed'
  | 'terminated'
  | 'note'
  | 'comp_changed'
  | 'time_off_requested'
  | 'time_off_approved'
  | 'time_off_rejected'
  | 'time_off_cancelled'

export interface EmploymentEvent {
  id: string
  org_id: string
  employee_id: string
  event_type: EmploymentEventType
  details: Record<string, unknown> | null
  occurred_at: string
  recorded_by: string | null
  created_at: string
}

export interface EmploymentEventInsert
  extends Omit<EmploymentEvent, 'id' | 'created_at' | 'details' | 'occurred_at' | 'recorded_by'> {
  id?: string
  created_at?: string
  details?: Record<string, unknown> | null
  occurred_at?: string
  recorded_by?: string | null
}

export interface EmploymentEventUpdate extends Partial<EmploymentEventInsert> {}

// Compensation records — immutable history. The current comp is the most
// recent record by effective_date. Each insert auto-writes a comp_changed
// event onto employee_events (via DB trigger; see migration 049).
export type PayFrequency = 'annual' | 'monthly' | 'hourly'

export interface CompensationRecord {
  id: string
  org_id: string
  employee_id: string
  effective_date: string                 // ISO date (YYYY-MM-DD)
  base_salary: number
  currency: string                       // 3-letter ISO
  pay_frequency: PayFrequency
  bonus_amount: number | null
  equity_notes: string | null
  variable_pay_notes: string | null
  reason: string | null
  recorded_at: string
  recorded_by: string | null
  created_at: string
}

export interface CompensationRecordInsert
  extends Omit<CompensationRecord, 'id' | 'created_at' | 'recorded_at' | 'currency' | 'pay_frequency' | 'bonus_amount' | 'equity_notes' | 'variable_pay_notes' | 'reason' | 'recorded_by'> {
  id?: string
  created_at?: string
  recorded_at?: string
  currency?: string
  pay_frequency?: PayFrequency
  bonus_amount?: number | null
  equity_notes?: string | null
  variable_pay_notes?: string | null
  reason?: string | null
  recorded_by?: string | null
}

export interface CompensationRecordUpdate extends Partial<CompensationRecordInsert> {}

// Time-off requests — lightweight per-request approval, NOT routed through the
// formal approvals engine. Approver is auto-resolved at create time to the
// requester's manager via employee_profiles.user_id (bridge from migration 050).
export type TimeOffRequestType = 'vacation' | 'sick' | 'personal' | 'unpaid'
export type TimeOffStatus      = 'pending' | 'approved' | 'rejected' | 'cancelled'

export interface TimeOffRequest {
  id: string
  org_id: string
  employee_id: string
  request_type: TimeOffRequestType
  start_date: string                    // YYYY-MM-DD
  end_date: string                      // YYYY-MM-DD
  hours_total: number | null
  reason: string | null
  status: TimeOffStatus
  approver_user_id: string | null
  decided_at: string | null
  decided_by: string | null
  decided_note: string | null
  requested_at: string
  requested_by: string | null
  created_at: string
  updated_at: string
}

export interface TimeOffRequestInsert
  extends Omit<TimeOffRequest, 'id' | 'created_at' | 'updated_at' | 'requested_at' | 'hours_total' | 'reason' | 'status' | 'approver_user_id' | 'decided_at' | 'decided_by' | 'decided_note' | 'requested_by'> {
  id?: string
  created_at?: string
  updated_at?: string
  requested_at?: string
  hours_total?: number | null
  reason?: string | null
  status?: TimeOffStatus
  approver_user_id?: string | null
  decided_at?: string | null
  decided_by?: string | null
  decided_note?: string | null
  requested_by?: string | null
}

export interface TimeOffRequestUpdate extends Partial<TimeOffRequestInsert> {}

// Onboarding — template + instance model (mirrors approval_chains shape).
// Templates are reusable per-org checklists; plans are instantiated per new
// hire from a template with tasks snapshotted at creation time (so editing the
// template later doesn't mutate in-flight plans). See migration 052.
export type OnboardingAssigneeRole = 'new_hire' | 'admin'
export type OnboardingPlanStatus = 'in_progress' | 'completed' | 'cancelled'
export type OnboardingTaskStatus = 'pending' | 'completed'

export interface OnboardingTemplate {
  id: string
  org_id: string
  name: string
  description: string | null
  is_default: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}
export interface OnboardingTemplateInsert
  extends Omit<OnboardingTemplate, 'id' | 'created_at' | 'updated_at' | 'description' | 'is_default' | 'is_active'> {
  id?: string
  created_at?: string
  updated_at?: string
  description?: string | null
  is_default?: boolean
  is_active?: boolean
}
export interface OnboardingTemplateUpdate extends Partial<OnboardingTemplateInsert> {}

export interface OnboardingTemplateTask {
  id: string
  template_id: string
  sort_order: number
  title: string
  description: string | null
  assignee_role: OnboardingAssigneeRole
  due_offset_days: number
  created_at: string
}
export interface OnboardingTemplateTaskInsert
  extends Omit<OnboardingTemplateTask, 'id' | 'created_at' | 'description'> {
  id?: string
  created_at?: string
  description?: string | null
}
export interface OnboardingTemplateTaskUpdate extends Partial<OnboardingTemplateTaskInsert> {}

export interface OnboardingPlan {
  id: string
  org_id: string
  employee_id: string
  template_id: string | null
  template_name: string
  start_date: string                           // YYYY-MM-DD
  status: OnboardingPlanStatus
  started_at: string
  completed_at: string | null
  started_by: string | null
  created_at: string
  updated_at: string
}
export interface OnboardingPlanInsert
  extends Omit<OnboardingPlan, 'id' | 'created_at' | 'updated_at' | 'started_at' | 'status' | 'completed_at' | 'started_by' | 'template_id'> {
  id?: string
  created_at?: string
  updated_at?: string
  started_at?: string
  status?: OnboardingPlanStatus
  completed_at?: string | null
  started_by?: string | null
  template_id?: string | null
}
export interface OnboardingPlanUpdate extends Partial<OnboardingPlanInsert> {}

export interface OnboardingTask {
  id: string
  org_id: string
  plan_id: string
  sort_order: number
  title: string
  description: string | null
  assignee_role: OnboardingAssigneeRole
  due_date: string | null                      // YYYY-MM-DD
  status: OnboardingTaskStatus
  completed_at: string | null
  completed_by: string | null
  created_at: string
  updated_at: string
}
export interface OnboardingTaskInsert
  extends Omit<OnboardingTask, 'id' | 'created_at' | 'updated_at' | 'description' | 'due_date' | 'status' | 'completed_at' | 'completed_by'> {
  id?: string
  created_at?: string
  updated_at?: string
  description?: string | null
  due_date?: string | null
  status?: OnboardingTaskStatus
  completed_at?: string | null
  completed_by?: string | null
}
export interface OnboardingTaskUpdate extends Partial<OnboardingTaskInsert> {}

// HR cases — lightweight helpdesk with an AI first-responder. On creation the
// HRIS sub-agent attempts to answer from unified data; ai_attempted_at marks
// whether it ran. Only genuinely-human cases escalate. See migration 053.
export type HrCaseCategory =
  | 'leave' | 'comp' | 'benefits' | 'docs' | 'manager' | 'onboarding' | 'other'
export type HrCaseStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
export type HrCaseAuthorRole = 'employee' | 'hr' | 'agent' | 'system'

export interface HrCase {
  id: string
  org_id: string
  requester_user_id: string
  requester_employee_id: string | null
  category: HrCaseCategory
  subject: string
  body: string
  status: HrCaseStatus
  assigned_to_user_id: string | null
  sla_due_at: string
  ai_attempted_at: string | null
  resolved_at: string | null
  resolved_by_user_id: string | null
  satisfaction_rating: number | null
  created_at: string
  updated_at: string
}

export interface HrCaseInsert
  extends Omit<HrCase, 'id' | 'created_at' | 'updated_at' | 'status' | 'assigned_to_user_id' | 'ai_attempted_at' | 'resolved_at' | 'resolved_by_user_id' | 'satisfaction_rating' | 'requester_employee_id'> {
  id?: string
  created_at?: string
  updated_at?: string
  status?: HrCaseStatus
  assigned_to_user_id?: string | null
  ai_attempted_at?: string | null
  resolved_at?: string | null
  resolved_by_user_id?: string | null
  satisfaction_rating?: number | null
  requester_employee_id?: string | null
}
export interface HrCaseUpdate extends Partial<HrCaseInsert> {}

export interface HrCaseMessage {
  id: string
  org_id: string
  case_id: string
  author_user_id: string | null
  author_role: HrCaseAuthorRole
  body: string
  created_at: string
}
export interface HrCaseMessageInsert
  extends Omit<HrCaseMessage, 'id' | 'created_at' | 'author_user_id'> {
  id?: string
  created_at?: string
  author_user_id?: string | null
}
export interface HrCaseMessageUpdate extends Partial<HrCaseMessageInsert> {}

// HR documents (link-based v1) — metadata + a URL. employee_id NULL = org-level.
// Categories employees can self-upload (vs HR-only) are enforced in domain code.
export type HrDocumentCategory =
  | 'offer_letter' | 'id_proof' | 'contract' | 'certification'
  | 'policy' | 'payslip' | 'tax_form' | 'other'
export type HrDocumentVisibility = 'employee' | 'admin'
export type HrDocumentUploaderRole = 'admin' | 'employee'

export interface HrDocument {
  id: string
  org_id: string
  employee_id: string | null
  title: string
  description: string | null
  category: HrDocumentCategory
  url: string
  visibility: HrDocumentVisibility
  uploaded_by_user_id: string | null
  uploaded_by_role: HrDocumentUploaderRole
  expires_at: string | null
  created_at: string
  updated_at: string
}

export interface HrDocumentInsert
  extends Omit<HrDocument, 'id' | 'created_at' | 'updated_at' | 'description' | 'visibility' | 'expires_at' | 'employee_id' | 'uploaded_by_user_id'> {
  id?: string
  created_at?: string
  updated_at?: string
  description?: string | null
  visibility?: HrDocumentVisibility
  expires_at?: string | null
  employee_id?: string | null
  uploaded_by_user_id?: string | null
}

export interface HrDocumentUpdate extends Partial<HrDocumentInsert> {}

// Leave policies (annual-grant) + holidays. Balances are computed at read time
// (sum of approved+pending time-off days for the current year against the grant),
// not stored — see migration 055.
export interface LeavePolicy {
  id: string
  org_id: string
  leave_type: TimeOffRequestType
  annual_days: number
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}
export interface LeavePolicyInsert
  extends Omit<LeavePolicy, 'id' | 'created_at' | 'updated_at' | 'description' | 'is_active'> {
  id?: string
  created_at?: string
  updated_at?: string
  description?: string | null
  is_active?: boolean
}
export interface LeavePolicyUpdate extends Partial<LeavePolicyInsert> {}

export interface Holiday {
  id: string
  org_id: string
  date: string
  name: string
  country: string | null
  created_at: string
}
export interface HolidayInsert
  extends Omit<Holiday, 'id' | 'created_at' | 'country'> {
  id?: string
  created_at?: string
  country?: string | null
}
export interface HolidayUpdate extends Partial<HolidayInsert> {}

// OKRs — per-employee Objectives + Key Results. Objective progress is computed
// at read time as the average of its KRs' progress. Cycle is free-text so each
// org can pick its own convention ('2026-Q3', '2026-H1', etc.).
export type OkrStatus = 'draft' | 'active' | 'achieved' | 'missed' | 'abandoned'

export interface Okr {
  id: string
  org_id: string
  owner_employee_id: string
  title: string
  description: string | null
  cycle: string
  status: OkrStatus
  sort_order: number
  created_at: string
  updated_at: string
}
export interface OkrInsert
  extends Omit<Okr, 'id' | 'created_at' | 'updated_at' | 'description' | 'status' | 'sort_order'> {
  id?: string
  created_at?: string
  updated_at?: string
  description?: string | null
  status?: OkrStatus
  sort_order?: number
}
export interface OkrUpdate extends Partial<OkrInsert> {}

export interface OkrKeyResult {
  id: string
  org_id: string
  okr_id: string
  title: string
  description: string | null
  progress: number
  target_metric: string | null
  sort_order: number
  created_at: string
  updated_at: string
}
export interface OkrKeyResultInsert
  extends Omit<OkrKeyResult, 'id' | 'created_at' | 'updated_at' | 'description' | 'progress' | 'target_metric' | 'sort_order'> {
  id?: string
  created_at?: string
  updated_at?: string
  description?: string | null
  progress?: number
  target_metric?: string | null
  sort_order?: number
}
export interface OkrKeyResultUpdate extends Partial<OkrKeyResultInsert> {}

// Payroll — payslip ledger (migration 057). We do NOT compute payroll here in
// v0; the org runs payroll wherever they already do and stores the resulting
// payslips here. `breakdown` is freeform jsonb so this works in any country
// without baking statutory rules; v1 can switch to a typed payslip_lines table
// additively.
export type PayrollRunStatus = 'draft' | 'finalized'

export interface PayrollRun {
  id:           string
  org_id:       string
  period_start: string                   // YYYY-MM-DD
  period_end:   string                   // YYYY-MM-DD
  pay_date:     string | null
  currency:     string                   // 'INR' default
  status:       PayrollRunStatus
  notes:        string | null
  finalized_at: string | null
  finalized_by: string | null
  created_at:   string
  updated_at:   string
}
export interface PayrollRunInsert
  extends Omit<PayrollRun, 'id' | 'created_at' | 'updated_at' | 'currency' | 'status' | 'pay_date' | 'notes' | 'finalized_at' | 'finalized_by'> {
  id?:           string
  created_at?:   string
  updated_at?:   string
  currency?:     string
  status?:       PayrollRunStatus
  pay_date?:     string | null
  notes?:        string | null
  finalized_at?: string | null
  finalized_by?: string | null
}
export interface PayrollRunUpdate extends Partial<PayrollRunInsert> {}

export interface PayslipBreakdownLine {
  label:  string
  amount: number
}
export interface PayslipBreakdown {
  earnings?:   PayslipBreakdownLine[]
  deductions?: PayslipBreakdownLine[]
}

export interface Payslip {
  id:                      string
  org_id:                  string
  run_id:                  string
  employee_id:             string
  employee_name_snapshot:  string | null
  employee_email_snapshot: string | null
  gross:                   number
  deductions_total:        number
  net:                     number
  breakdown:               PayslipBreakdown
  notes:                   string | null
  created_at:              string
  updated_at:              string
}
export interface PayslipInsert
  extends Omit<Payslip, 'id' | 'created_at' | 'updated_at' | 'employee_name_snapshot' | 'employee_email_snapshot' | 'gross' | 'deductions_total' | 'net' | 'breakdown' | 'notes'> {
  id?:                       string
  created_at?:               string
  updated_at?:               string
  employee_name_snapshot?:   string | null
  employee_email_snapshot?:  string | null
  gross?:                    number
  deductions_total?:         number
  net?:                      number
  breakdown?:                PayslipBreakdown
  notes?:                    string | null
}
export interface PayslipUpdate extends Partial<PayslipInsert> {}

// Payroll v1 — country tax engine (migration 058).
// v1 ships one engine (India, FY 2026-27, both regimes). Future country engines
// plug into the same TaxEngine interface in src/modules/payroll/domain/tax/
// without schema changes.
export type TaxRegime  = 'new' | 'old'
export type CountryCode = 'IN' | 'SG'                            // expand as engines land

export interface PayrollOrgSettings {
  org_id:                   string
  country_code:             CountryCode
  default_state:            string                              // ISO subdivision (KA, MH, TN, DL, …)
  default_tax_regime:       TaxRegime
  metro:                    boolean
  basic_pct:                number                              // 0.5 = 50% of monthly gross is Basic
  hra_pct_metro:            number                              // 0.5 = HRA is 50% of Basic in metros
  hra_pct_non_metro:        number                              // 0.4 = HRA is 40% of Basic non-metro
  pf_employee_pct:          number                              // 0.12 = 12% of Basic
  pf_wage_ceiling_enabled:  boolean
  pf_wage_ceiling:          number                              // 15000 default per Budget 2026
  esi_threshold:            number                              // 21000 — gross at/below pays ESI
  esi_employee_pct:         number                              // 0.0075 = 0.75%
  notes:                    string | null
  created_at:               string
  updated_at:               string
}
export interface PayrollOrgSettingsInsert
  extends Partial<Omit<PayrollOrgSettings, 'org_id' | 'created_at' | 'updated_at'>> {
  org_id: string
}
export interface PayrollOrgSettingsUpdate extends Partial<PayrollOrgSettingsInsert> {}

export interface EmployeeTaxDeclaration {
  id:                       string
  org_id:                   string
  employee_id:              string
  fy:                       string                              // '2026-27'
  rent_paid_annual:         number
  section_80c:              number
  section_80d:              number
  section_80ccd_1b:         number
  other_exemptions:         Record<string, number>
  notes:                    string | null
  created_at:               string
  updated_at:               string
}
export interface EmployeeTaxDeclarationInsert
  extends Omit<EmployeeTaxDeclaration, 'id' | 'created_at' | 'updated_at' | 'rent_paid_annual' | 'section_80c' | 'section_80d' | 'section_80ccd_1b' | 'other_exemptions' | 'notes'> {
  id?:                       string
  created_at?:               string
  updated_at?:               string
  rent_paid_annual?:         number
  section_80c?:              number
  section_80d?:              number
  section_80ccd_1b?:         number
  other_exemptions?:         Record<string, number>
  notes?:                    string | null
}
export interface EmployeeTaxDeclarationUpdate extends Partial<EmployeeTaxDeclarationInsert> {}

export interface EmployeeProfileInsert
  extends Omit<EmployeeProfile, 'id' | 'created_at' | 'updated_at' | 'candidate_id' | 'application_id' | 'department_id' | 'manager_id' | 'user_id' | 'hired_at' | 'start_date' | 'joined_at' | 'terminated_at' | 'status'> {
  id?: string
  created_at?: string
  updated_at?: string
  status?: EmployeeStatus
  candidate_id?: string | null
  application_id?: string | null
  department_id?: string | null
  manager_id?: string | null
  user_id?: string | null
  hired_at?: string | null
  start_date?: string | null
  joined_at?: string | null
  terminated_at?: string | null
}

export interface EmployeeProfileUpdate extends Partial<EmployeeProfileInsert> {}

// `candidates` holds the candidate *profile* (resume, skills, status, ai_*) and
// links to its Person via person_id. Identity fields (name/email/phone/linkedin)
// are mirrored here for now but are owned by `people`.
export interface Candidate {
  id: string
  org_id: string
  person_id: string | null
  name: string
  email: string
  phone: string | null
  resume_url: string | null
  skills: string[]
  experience_years: number
  current_title: string | null
  location: string | null
  linkedin_url: string | null
  status: CandidateStatus
  ai_summary: string | null
  ai_summary_generated_at: string | null
  created_at: string
  updated_at: string
}

export interface CandidateInsert
  extends Omit<Candidate, 'id' | 'created_at' | 'updated_at' | 'ai_summary' | 'ai_summary_generated_at' | 'phone' | 'resume_url' | 'current_title' | 'location' | 'linkedin_url' | 'person_id'> {
  id?: string
  created_at?: string
  updated_at?: string
  person_id?: string | null
  ai_summary?: string | null
  ai_summary_generated_at?: string | null
  phone?: string | null
  resume_url?: string | null
  current_title?: string | null
  location?: string | null
  linkedin_url?: string | null
}

export interface CandidateUpdate extends Partial<CandidateInsert> {}

// Candidate enriched with aggregated pipeline data — used by the list page
export interface CandidateListItem extends Candidate {
  active_applications_count: number
}

export interface Role {
  id: string
  org_id: string
  job_title: string
  required_skills: string[]
  min_experience: number
  location: string | null
  salary_min: number | null
  salary_max: number | null
  status: RoleStatus
  auto_advance_threshold: number | null
  auto_reject_threshold: number | null
  created_at: string
  updated_at: string
}

export interface RoleInsert extends Omit<Role, 'id' | 'created_at' | 'updated_at'> {
  id?: string
  created_at?: string
  updated_at?: string
}

export interface RoleUpdate extends Partial<RoleInsert> {}

// ── Hiring Request ────────────────────────────────────────────────────────

// ── Scoring Criteria ──────────────────────────────────────────────────────────
// Stored as JSONB on hiring_requests.scoring_criteria
// All weights should be integers (%) that sum to 100.
export interface ScoringCriterion {
  id:          string         // stable identifier (nanoid / slug)
  name:        string         // e.g. "Technical Skills"
  weight:      number         // integer 1–100; sum across all criteria = 100
  description: string | null  // optional hint shown to interviewers
}

export type HiringRequestStatus =
  | 'intake_pending'
  | 'intake_submitted'
  | 'jd_generated'
  | 'jd_sent'
  | 'jd_approved'
  | 'posted'
  | 'active'
  | 'closed'

export interface HiringRequest {
  id: string
  org_id: string
  ticket_number: string | null
  position_title: string
  department: string | null
  hiring_manager_name: string
  hiring_manager_email: string | null
  hiring_manager_slack: string | null
  intake_token: string
  apply_link_token: string | null  // public apply form token
  status: HiringRequestStatus
  filled_by_recruiter: boolean
  team_context: string | null
  level: string | null
  headcount: number
  location: string | null
  remote_ok: boolean
  key_requirements: string | null
  nice_to_haves: string | null
  target_companies: string | null
  budget_min: number | null
  budget_max: number | null
  target_start_date: string | null
  additional_notes: string | null
  generated_jd: string | null
  intake_sent_at: string | null
  intake_submitted_at: string | null
  jd_sent_at: string | null
  created_at: string
  updated_at: string
  // Autopilot settings (migration 006)
  auto_advance_score:       number | null
  auto_reject_score:        number | null
  auto_advance_stage_id:    string | null
  auto_email_rejection:     boolean
  autopilot_recruiter_name: string | null
  autopilot_company_name:   string | null
  // Weighted scoring rubric (migration 017)
  scoring_criteria:         ScoringCriterion[] | null
}

// ── Pipeline ──────────────────────────────────────────────────────────────

export type StageColor = 'slate' | 'blue' | 'violet' | 'amber' | 'emerald' | 'green' | 'red' | 'pink'

export interface PipelineStage {
  id: string
  org_id: string
  // Exactly one parent (migration 066): legacy hiring_request OR canonical job.
  hiring_request_id: string | null
  job_id: string | null
  name: string
  order_index: number
  color: StageColor
  created_at: string
}

// ── Applications ──────────────────────────────────────────────────────────

export type ApplicationStatus = 'active' | 'on_hold' | 'rejected' | 'withdrawn' | 'hired'

export type ApplicationReviewStatus = 'unreviewed' | 'reviewed' | 'yes' | 'no' | 'maybe'
export type ApplicationSource = 'manual' | 'applied' | 'imported' | 'sourced' | 'referral'
export type AiRecommendation = 'strong_yes' | 'yes' | 'maybe' | 'no'

export interface Application {
  id: string
  org_id: string
  candidate_id: string
  hiring_request_id: string
  // Canonical links (migration 064, Slice 3). Nullable; populated for
  // applications created against a canonical job pipeline. Legacy apply flow
  // leaves these null and uses hiring_request_id only.
  job_id: string | null
  opening_id: string | null
  stage_id: string | null
  status: ApplicationStatus
  review_status: ApplicationReviewStatus
  source: ApplicationSource
  source_detail: string | null
  resume_url: string | null
  cover_letter: string | null
  applied_at: string
  created_at: string
  // AI scoring (null until scored)
  ai_score:          number | null
  ai_recommendation: AiRecommendation | null
  ai_strengths:      string[]
  ai_gaps:           string[]
  ai_scored_at:           string | null
  ai_criterion_scores:    { name: string; rating: number; weight: number }[] | null
  // Attribution (migration 019)
  credited_to:            string | null
  // Screening answers (migration 072). screening_answers is visible to the
  // hiring team; eeo_answers is the separate hidden compliance bucket.
  screening_answers: ScreeningAnswer[]
  eeo_answers:       ScreeningAnswer[]
  knockout_failed:   boolean
  // Joined
  candidate?: Candidate
  stage?: PipelineStage
  hiring_request?: Pick<HiringRequest, 'id' | 'position_title' | 'department' | 'ticket_number'>
}

// ── Screening questions / application-form builder (migration 072) ────────

export type ScreeningFieldType =
  | 'short_text'
  | 'long_text'
  | 'yes_no'
  | 'single_select'
  | 'multi_select'
  | 'number'
  | 'date'
  | 'file'
  | 'url'

export type ScreeningOperator = 'eq' | 'neq' | 'in' | 'not_in'

// A reusable question in the org-level library (screening_questions table).
export interface ScreeningQuestion {
  id:         string
  org_id:     string
  label:      string
  help_text:  string | null
  field_type: ScreeningFieldType
  options:    string[]
  is_eeo:     boolean
  archived:   boolean
  created_at: string
  updated_at: string
}

// A disqualifying-answer rule: if the answer matches, the candidate is knocked out.
export interface ScreeningKnockout {
  operator: ScreeningOperator
  value:    string | string[]
}

// A conditional-visibility rule: show this field only when an earlier field matches.
export interface ScreeningVisibility {
  field_id: string
  operator: ScreeningOperator
  value:    string | string[]
}

// One field within a form (org template, or per-job at jobs.custom_fields.screening).
export interface ScreeningField {
  id:           string
  question_id:  string | null
  label:        string
  help_text:    string | null
  field_type:   ScreeningFieldType
  options:      string[]
  required:     boolean
  is_eeo:       boolean
  knockout:     ScreeningKnockout | null
  visible_when: ScreeningVisibility | null
}

// The org default form (screening_form_templates table) and the per-job shape.
export interface ScreeningForm {
  fields: ScreeningField[]
}

// A candidate's answer to one field, stored on applications.screening_answers / eeo_answers.
export interface ScreeningAnswer {
  field_id: string
  label:    string
  value:    string | string[] | null
}

// ── Application Events ────────────────────────────────────────────────────

export type ApplicationEventType =
  | 'applied'
  | 'stage_moved'
  | 'note_added'
  | 'status_changed'
  | 'email_sent'

export interface ApplicationEvent {
  id: string
  org_id: string
  application_id: string
  event_type: string
  from_stage: string | null
  to_stage: string | null
  note: string | null
  metadata: Record<string, unknown>
  created_by: string
  created_at: string
}

// ── Job (hiring_request + pipeline data) ─────────────────────────────────

export interface JobWithPipeline extends HiringRequest {
  pipeline_stages: PipelineStage[]
  applications: Application[]
}

export interface JobListItem extends HiringRequest {
  total_candidates: number
  stage_counts: { stage_id: string; stage_name: string; color: StageColor; count: number }[]
}

// ── Scorecards ────────────────────────────────────────────────────────────

export type ScorecardRecommendation = 'strong_yes' | 'yes' | 'maybe' | 'no'

export interface ScorecardScore {
  criterion: string
  rating:    1 | 2 | 3 | 4
  notes:     string
}

export interface Scorecard {
  id:               string
  org_id:           string
  application_id:   string
  interviewer_name: string
  stage_name:       string | null
  recommendation:   ScorecardRecommendation
  scores:           ScorecardScore[]
  overall_notes:    string | null
  created_at:       string
}

// ── Interviews ────────────────────────────────────────────────────────────────

export type InterviewType   = 'video' | 'phone' | 'in_person' | 'panel' | 'technical' | 'assessment'
export type InterviewStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show' | 'rescheduled'

export interface Interview {
  id:                       string
  org_id:                   string
  application_id:           string
  candidate_id:             string
  hiring_request_id:        string
  stage_id:                 string | null
  interviewer_name:         string
  interview_type:           InterviewType
  scheduled_at:             string
  duration_minutes:         number
  location:                 string | null
  notes:                    string | null
  status:                   InterviewStatus
  self_schedule_token:      string | null
  self_schedule_expires_at: string | null
  created_at:               string
  updated_at:               string
  candidate?:               Pick<Candidate, 'name' | 'email'>
  hiring_request?:          Pick<HiringRequest, 'position_title' | 'ticket_number'>
}

export interface InterviewInsert extends Omit<Interview, 'id' | 'created_at' | 'updated_at' | 'candidate' | 'hiring_request'> {
  id?: string
  created_at?: string
  updated_at?: string
}

export interface InterviewUpdate extends Partial<InterviewInsert> {}

// ── Offers ────────────────────────────────────────────────────────────────────

export type OfferStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'sent'
  | 'accepted'
  | 'declined'
  | 'withdrawn'
  | 'expired'

export interface Offer {
  id:                string
  org_id:            string
  application_id:    string
  candidate_id:      string
  hiring_request_id: string
  position_title:    string
  base_salary:       number | null
  bonus:             number | null
  equity:            string | null
  start_date:        string | null
  expiry_date:       string | null
  notes:             string | null
  offer_letter_text: string | null
  status:            OfferStatus
  created_by:        string | null
  approved_by:       string | null
  approved_at:       string | null
  sent_at:           string | null
  responded_at:      string | null
  created_at:        string
  updated_at:        string
  candidate?:        Pick<Candidate, 'name' | 'email'>
  hiring_request?:   Pick<HiringRequest, 'position_title' | 'ticket_number'>
}

export interface OfferInsert extends Omit<Offer, 'id' | 'created_at' | 'updated_at' | 'candidate' | 'hiring_request' | 'approved_by' | 'approved_at' | 'sent_at' | 'responded_at' | 'created_by' | 'notes' | 'offer_letter_text' | 'base_salary' | 'bonus' | 'equity' | 'start_date' | 'expiry_date'> {
  id?: string
  created_at?: string
  updated_at?: string
  approved_by?: string | null
  approved_at?: string | null
  sent_at?: string | null
  responded_at?: string | null
  created_by?: string | null
  notes?: string | null
  offer_letter_text?: string | null
  base_salary?: number | null
  bonus?: number | null
  equity?: string | null
  start_date?: string | null
  expiry_date?: string | null
}

export interface OfferUpdate extends Partial<OfferInsert> {}

// ── Candidate Tasks ───────────────────────────────────────────────────────────
// Added in migration 019

export type TaskStatus = 'to_do' | 'in_progress' | 'done' | 'blocked'

export interface CandidateTask {
  id:             string
  org_id:         string
  candidate_id:   string
  application_id: string | null
  title:          string
  description:    string | null
  due_date:       string | null  // DATE stored as ISO string YYYY-MM-DD
  assignee_name:  string | null
  status:         TaskStatus
  completed_at:   string | null
  created_by:     string
  created_at:     string
}

// ── Candidate Tags ─────────────────────────────────────────────────────────────

export interface CandidateTag {
  id:           string
  org_id:       string
  candidate_id: string
  tag:          string
  created_at:   string
}

// ── Candidate Referrals ────────────────────────────────────────────────────────

export interface CandidateReferral {
  id:             string
  org_id:         string
  candidate_id:   string
  application_id: string | null
  referrer_name:  string
  referrer_email: string | null
  note:           string | null
  created_at:     string
}

// ── Match ─────────────────────────────────────────────────────────────────

export type MatchRecommendation = 'strong_yes' | 'yes' | 'maybe' | 'no'

export interface Match {
  id: string
  candidate_id: string
  role_id: string
  score: number
  strengths: string[]
  gaps: string[]
  reasoning: string
  recommendation: MatchRecommendation
  created_at: string
}

export interface MatchWithRelations extends Match {
  candidates: Candidate
  roles: Role
}

// ── Notifications ────────────────────────────────────────────────────────────

export interface Notification {
  id: string
  org_id: string
  user_id: string | null
  type: string
  title: string
  body: string | null
  resource_type: string | null
  resource_id: string | null
  read: boolean
  created_at: string
}

export interface NotificationInsert extends Omit<Notification, 'id' | 'created_at'> {
  id?: string
  created_at?: string
}

export interface NotificationUpdate {
  read?: boolean
}

// ── Org Settings ─────────────────────────────────────────────────────────────

export type CompanySize = '1-10' | '11-50' | '51-200' | '201-1000' | '1000+'
export type AgentKey = 'drafter' | 'scout' | 'sifter' | 'scheduler' | 'closer'

export interface OrgSettings {
  org_id: string
  slack_webhook_url: string | null
  slack_bot_token: string | null
  slack_team_id: string | null
  slack_team_name: string | null
  google_oauth_access_token: string | null
  google_oauth_refresh_token: string | null
  google_oauth_token_expiry: string | null
  google_connected_email: string | null
  zoom_account_id: string | null
  zoom_access_token: string | null
  zoom_refresh_token: string | null
  zoom_token_expiry: string | null
  zoom_connected_email: string | null
  ms_tenant_id: string | null
  ms_access_token: string | null
  ms_refresh_token: string | null
  ms_token_expiry: string | null
  ms_connected_email: string | null
  // Onboarding-captured (migration 041)
  company_name: string | null
  company_size: CompanySize | null
  industry: string | null
  website: string | null
  enabled_agents: AgentKey[]
  // Careers page branding (migration 071)
  careers_slug: string | null
  careers_public: boolean
  logo_url: string | null
  hero_image_url: string | null
  brand_color: string | null
  accent_color: string | null
  brand_font: string | null
  tagline: string | null
  about: string | null
  updated_at: string
}

export interface OrgSettingsInsert extends Partial<Omit<OrgSettings, 'org_id'>> {
  org_id: string
}

export interface OrgSettingsUpdate extends Partial<Omit<OrgSettings, 'org_id'>> {}

// ── Email Templates ──────────────────────────────────────────────────────────

export interface EmailTemplate {
  id: string
  org_id: string
  name: string
  subject: string
  body: string
  created_by: string | null
  created_at: string
}

export interface EmailTemplateInsert extends Omit<EmailTemplate, 'id' | 'created_at'> {
  id?: string
  created_at?: string
}

export interface EmailTemplateUpdate {
  name?: string
  subject?: string
  body?: string
}

// ── Email Drafts ─────────────────────────────────────────────────────────────

export interface EmailDraft {
  id: string
  org_id: string
  application_id: string
  name: string
  to_emails: string[]
  cc_emails: string[]
  bcc_emails: string[]
  subject: string
  body: string
  created_by: string | null
  updated_at: string
  created_at: string
}

export interface EmailDraftInsert extends Omit<EmailDraft, 'id' | 'updated_at' | 'created_at'> {
  id?: string
  updated_at?: string
  created_at?: string
}

export interface EmailDraftUpdate extends Partial<Omit<EmailDraftInsert, 'org_id' | 'application_id'>> {}

// ── Leads ────────────────────────────────────────────────────────────────────

export interface Lead {
  id: string
  email: string
  source: string
  created_at: string
}

export interface LeadInsert extends Omit<Lead, 'id' | 'created_at'> {
  id?: string
  created_at?: string
}

// ── Job Queue ────────────────────────────────────────────────────────────────

export type JobQueueStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'dead'

export interface JobQueueItem {
  id: string
  org_id: string
  job_type: string
  payload: Record<string, unknown>
  status: JobQueueStatus
  attempts: number
  max_attempts: number
  error: string | null
  scheduled_at: string
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface JobQueueInsert extends Omit<JobQueueItem, 'id' | 'created_at' | 'status' | 'attempts' | 'error' | 'started_at' | 'completed_at'> {
  id?: string
  created_at?: string
  status?: JobQueueStatus
  attempts?: number
  error?: string | null
  started_at?: string | null
  completed_at?: string | null
}

export interface JobQueueUpdate {
  status?: JobQueueStatus
  attempts?: number
  error?: string | null
  started_at?: string | null
  completed_at?: string | null
}

// ── Voice Calls ──────────────────────────────────────────────────────────────

export interface VoiceCall {
  id: string
  org_id: string
  candidate_id: string | null
  hiring_request_id: string | null
  application_id: string | null
  direction: string
  phone_number: string | null
  status: string
  agent_type: string
  duration_seconds: number | null
  started_at: string | null
  ended_at: string | null
  transcript: Record<string, unknown>[] | null
  summary: string | null
  ai_score: number | null
  ai_recommendation: string | null
  recording_url: string | null
  vobiz_call_id: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface VoiceCallInsert extends Omit<VoiceCall, 'id' | 'created_at' | 'updated_at'> {
  id?: string
  created_at?: string
  updated_at?: string
}

export interface VoiceCallUpdate extends Partial<VoiceCallInsert> {}

// ── Insert/Update variants for tables that were missing them ─────────────────

export interface HiringRequestInsert extends Omit<HiringRequest, 'id' | 'created_at' | 'updated_at'> {
  id?: string
  created_at?: string
  updated_at?: string
}

export interface HiringRequestUpdate extends Partial<HiringRequestInsert> {}

export interface PipelineStageInsert extends Omit<PipelineStage, 'id' | 'created_at' | 'hiring_request_id' | 'job_id'> {
  id?: string
  created_at?: string
  hiring_request_id?: string | null
  job_id?: string | null
}

export interface PipelineStageUpdate extends Partial<PipelineStageInsert> {}

// Application Row type (without optional joined relations)
type ApplicationRow = Omit<Application, 'candidate' | 'stage' | 'hiring_request'>

export interface ApplicationInsert extends Omit<ApplicationRow, 'id' | 'created_at' | 'applied_at' | 'resume_url' | 'cover_letter' | 'ai_score' | 'ai_recommendation' | 'ai_strengths' | 'ai_gaps' | 'ai_scored_at' | 'ai_criterion_scores' | 'source_detail' | 'credited_to' | 'stage_id' | 'review_status' | 'job_id' | 'opening_id' | 'hiring_request_id' | 'screening_answers' | 'eeo_answers' | 'knockout_failed'> {
  id?: string
  created_at?: string
  applied_at?: string
  hiring_request_id?: string | null
  job_id?: string | null
  opening_id?: string | null
  resume_url?: string | null
  cover_letter?: string | null
  ai_score?: number | null
  ai_recommendation?: AiRecommendation | null
  ai_strengths?: string[]
  ai_gaps?: string[]
  ai_scored_at?: string | null
  ai_criterion_scores?: { name: string; rating: number; weight: number }[] | null
  source_detail?: string | null
  credited_to?: string | null
  stage_id?: string | null
  review_status?: ApplicationReviewStatus
  screening_answers?: ScreeningAnswer[]
  eeo_answers?: ScreeningAnswer[]
  knockout_failed?: boolean
}

export interface ApplicationUpdate extends Partial<ApplicationInsert> {}

export interface ApplicationEventInsert extends Omit<ApplicationEvent, 'id' | 'created_at' | 'metadata' | 'from_stage' | 'to_stage' | 'note'> {
  id?: string
  created_at?: string
  metadata?: Record<string, unknown>
  from_stage?: string | null
  to_stage?: string | null
  note?: string | null
}

export interface ApplicationEventUpdate extends Partial<ApplicationEventInsert> {}

// Interview Row type (without optional joined relations)
type InterviewRow = Omit<Interview, 'candidate' | 'hiring_request'>

export interface ScorecardInsert extends Omit<Scorecard, 'id' | 'created_at'> {
  id?: string
  created_at?: string
}

export interface ScorecardUpdate extends Partial<ScorecardInsert> {}

// Offer Row type (without optional joined relations)
type OfferRow = Omit<Offer, 'candidate' | 'hiring_request'>

export interface CandidateTaskInsert extends Omit<CandidateTask, 'id' | 'created_at' | 'status' | 'completed_at' | 'description' | 'due_date' | 'assignee_name' | 'application_id'> {
  id?: string
  created_at?: string
  status?: TaskStatus
  completed_at?: string | null
  description?: string | null
  due_date?: string | null
  assignee_name?: string | null
  application_id?: string | null
}

export interface CandidateTaskUpdate extends Partial<CandidateTaskInsert> {}

export interface CandidateTagInsert extends Omit<CandidateTag, 'id' | 'created_at'> {
  id?: string
  created_at?: string
}

export interface CandidateReferralInsert extends Omit<CandidateReferral, 'id' | 'created_at'> {
  id?: string
  created_at?: string
}

export interface MatchInsert extends Omit<Match, 'id' | 'created_at'> {
  id?: string
  created_at?: string
}

// Sequence Row types (without optional computed/joined fields)
type SequenceRow = Omit<Sequence, 'stages' | 'stage_count' | 'enrollment_count' | 'reply_count'>

export interface SequenceInsert extends Omit<SequenceRow, 'id' | 'created_at' | 'updated_at'> {
  id?: string
  created_at?: string
  updated_at?: string
}

export interface SequenceUpdate extends Partial<SequenceInsert> {}

export interface SequenceStageInsert extends Omit<SequenceStage, 'id' | 'created_at' | 'updated_at'> {
  id?: string
  created_at?: string
  updated_at?: string
}

export interface SequenceStageUpdate extends Partial<SequenceStageInsert> {}

// SequenceEnrollment Row type (without optional computed fields)
type SequenceEnrollmentRow = Omit<SequenceEnrollment, 'candidate_name' | 'candidate_email' | 'sequence_name'>

export interface SequenceEnrollmentInsert extends Omit<SequenceEnrollmentRow, 'id' | 'created_at'> {
  id?: string
  created_at?: string
}

export interface SequenceEnrollmentUpdate extends Partial<SequenceEnrollmentInsert> {}

export interface SequenceEmailInsert extends Omit<SequenceEmail, 'id' | 'created_at'> {
  id?: string
  created_at?: string
}

export interface SequenceEmailUpdate extends Partial<SequenceEmailInsert> {}

// ── Supabase Database shape for typed client ─────────────────────────────────

// Utility: converts an interface into a type with an implicit index signature.
// TypeScript interfaces don't have index signatures, which prevents them from
// satisfying Record<string, unknown>.  Supabase's GenericTable requires
// Row / Insert / Update to extend Record<string, unknown>, so we map each
// interface through this helper to add the implicit index signature.
type Indexify<T> = { [K in keyof T]: T[K] }

export type Database = {
  public: {
    Tables: {
      people: {
        Row: Indexify<Person>
        Insert: Indexify<PersonInsert>
        Update: Indexify<PersonUpdate>
        Relationships: []
      }
      employee_profiles: {
        Row: Indexify<EmployeeProfile>
        Insert: Indexify<EmployeeProfileInsert>
        Update: Indexify<EmployeeProfileUpdate>
        Relationships: []
      }
      employee_events: {
        Row: Indexify<EmploymentEvent>
        Insert: Indexify<EmploymentEventInsert>
        Update: Indexify<EmploymentEventUpdate>
        Relationships: []
      }
      compensation_records: {
        Row: Indexify<CompensationRecord>
        Insert: Indexify<CompensationRecordInsert>
        Update: Indexify<CompensationRecordUpdate>
        Relationships: []
      }
      time_off_requests: {
        Row: Indexify<TimeOffRequest>
        Insert: Indexify<TimeOffRequestInsert>
        Update: Indexify<TimeOffRequestUpdate>
        Relationships: []
      }
      onboarding_templates: {
        Row: Indexify<OnboardingTemplate>
        Insert: Indexify<OnboardingTemplateInsert>
        Update: Indexify<OnboardingTemplateUpdate>
        Relationships: []
      }
      onboarding_template_tasks: {
        Row: Indexify<OnboardingTemplateTask>
        Insert: Indexify<OnboardingTemplateTaskInsert>
        Update: Indexify<OnboardingTemplateTaskUpdate>
        Relationships: []
      }
      onboarding_plans: {
        Row: Indexify<OnboardingPlan>
        Insert: Indexify<OnboardingPlanInsert>
        Update: Indexify<OnboardingPlanUpdate>
        Relationships: []
      }
      onboarding_tasks: {
        Row: Indexify<OnboardingTask>
        Insert: Indexify<OnboardingTaskInsert>
        Update: Indexify<OnboardingTaskUpdate>
        Relationships: []
      }
      hr_cases: {
        Row: Indexify<HrCase>
        Insert: Indexify<HrCaseInsert>
        Update: Indexify<HrCaseUpdate>
        Relationships: []
      }
      hr_case_messages: {
        Row: Indexify<HrCaseMessage>
        Insert: Indexify<HrCaseMessageInsert>
        Update: Indexify<HrCaseMessageUpdate>
        Relationships: []
      }
      hr_documents: {
        Row: Indexify<HrDocument>
        Insert: Indexify<HrDocumentInsert>
        Update: Indexify<HrDocumentUpdate>
        Relationships: []
      }
      leave_policies: {
        Row: Indexify<LeavePolicy>
        Insert: Indexify<LeavePolicyInsert>
        Update: Indexify<LeavePolicyUpdate>
        Relationships: []
      }
      holidays: {
        Row: Indexify<Holiday>
        Insert: Indexify<HolidayInsert>
        Update: Indexify<HolidayUpdate>
        Relationships: []
      }
      okrs: {
        Row: Indexify<Okr>
        Insert: Indexify<OkrInsert>
        Update: Indexify<OkrUpdate>
        Relationships: []
      }
      okr_key_results: {
        Row: Indexify<OkrKeyResult>
        Insert: Indexify<OkrKeyResultInsert>
        Update: Indexify<OkrKeyResultUpdate>
        Relationships: []
      }
      payroll_runs: {
        Row: Indexify<PayrollRun>
        Insert: Indexify<PayrollRunInsert>
        Update: Indexify<PayrollRunUpdate>
        Relationships: []
      }
      payslips: {
        Row: Indexify<Payslip>
        Insert: Indexify<PayslipInsert>
        Update: Indexify<PayslipUpdate>
        Relationships: []
      }
      payroll_org_settings: {
        Row: Indexify<PayrollOrgSettings>
        Insert: Indexify<PayrollOrgSettingsInsert>
        Update: Indexify<PayrollOrgSettingsUpdate>
        Relationships: []
      }
      employee_tax_declarations: {
        Row: Indexify<EmployeeTaxDeclaration>
        Insert: Indexify<EmployeeTaxDeclarationInsert>
        Update: Indexify<EmployeeTaxDeclarationUpdate>
        Relationships: []
      }
      candidates: {
        Row: Indexify<Candidate>
        Insert: Indexify<CandidateInsert>
        Update: Indexify<CandidateUpdate>
        Relationships: []
      }
      roles: {
        Row: Indexify<Role>
        Insert: Indexify<RoleInsert>
        Update: Indexify<RoleUpdate>
        Relationships: []
      }
      hiring_requests: {
        Row: Indexify<HiringRequest>
        Insert: Indexify<HiringRequestInsert>
        Update: Indexify<HiringRequestUpdate>
        Relationships: []
      }
      pipeline_stages: {
        Row: Indexify<PipelineStage>
        Insert: Indexify<PipelineStageInsert>
        Update: Indexify<PipelineStageUpdate>
        Relationships: []
      }
      applications: {
        Row: Indexify<ApplicationRow>
        Insert: Indexify<ApplicationInsert>
        Update: Indexify<ApplicationUpdate>
        Relationships: []
      }
      application_events: {
        Row: Indexify<ApplicationEvent>
        Insert: Indexify<ApplicationEventInsert>
        Update: Indexify<ApplicationEventUpdate>
        Relationships: []
      }
      interviews: {
        Row: Indexify<InterviewRow>
        Insert: Indexify<InterviewInsert>
        Update: Indexify<InterviewUpdate>
        Relationships: []
      }
      offers: {
        Row: Indexify<OfferRow>
        Insert: Indexify<OfferInsert>
        Update: Indexify<OfferUpdate>
        Relationships: []
      }
      scorecards: {
        Row: Indexify<Scorecard>
        Insert: Indexify<ScorecardInsert>
        Update: Indexify<ScorecardUpdate>
        Relationships: []
      }
      candidate_tasks: {
        Row: Indexify<CandidateTask>
        Insert: Indexify<CandidateTaskInsert>
        Update: Indexify<CandidateTaskUpdate>
        Relationships: []
      }
      candidate_tags: {
        Row: Indexify<CandidateTag>
        Insert: Indexify<CandidateTagInsert>
        Update: Indexify<Partial<CandidateTagInsert>>
        Relationships: []
      }
      candidate_referrals: {
        Row: Indexify<CandidateReferral>
        Insert: Indexify<CandidateReferralInsert>
        Update: Indexify<Partial<CandidateReferralInsert>>
        Relationships: []
      }
      matches: {
        Row: Indexify<Match>
        Insert: Indexify<MatchInsert>
        Update: Indexify<Partial<MatchInsert>>
        Relationships: []
      }
      notifications: {
        Row: Indexify<Notification>
        Insert: Indexify<NotificationInsert>
        Update: Indexify<NotificationUpdate>
        Relationships: []
      }
      org_settings: {
        Row: Indexify<OrgSettings>
        Insert: Indexify<OrgSettingsInsert>
        Update: Indexify<OrgSettingsUpdate>
        Relationships: []
      }
      email_templates: {
        Row: Indexify<EmailTemplate>
        Insert: Indexify<EmailTemplateInsert>
        Update: Indexify<EmailTemplateUpdate>
        Relationships: []
      }
      email_drafts: {
        Row: Indexify<EmailDraft>
        Insert: Indexify<EmailDraftInsert>
        Update: Indexify<EmailDraftUpdate>
        Relationships: []
      }
      leads: {
        Row: Indexify<Lead>
        Insert: Indexify<LeadInsert>
        Update: Indexify<Partial<LeadInsert>>
        Relationships: []
      }
      job_queue: {
        Row: Indexify<JobQueueItem>
        Insert: Indexify<JobQueueInsert>
        Update: Indexify<JobQueueUpdate>
        Relationships: []
      }
      voice_calls: {
        Row: Indexify<VoiceCall>
        Insert: Indexify<VoiceCallInsert>
        Update: Indexify<VoiceCallUpdate>
        Relationships: []
      }
      sequences: {
        Row: Indexify<SequenceRow>
        Insert: Indexify<SequenceInsert>
        Update: Indexify<SequenceUpdate>
        Relationships: []
      }
      sequence_stages: {
        Row: Indexify<SequenceStage>
        Insert: Indexify<SequenceStageInsert>
        Update: Indexify<SequenceStageUpdate>
        Relationships: []
      }
      sequence_enrollments: {
        Row: Indexify<SequenceEnrollmentRow>
        Insert: Indexify<SequenceEnrollmentInsert>
        Update: Indexify<SequenceEnrollmentUpdate>
        Relationships: []
      }
      sequence_emails: {
        Row: Indexify<SequenceEmail>
        Insert: Indexify<SequenceEmailInsert>
        Update: Indexify<SequenceEmailUpdate>
        Relationships: []
      }
      user_preferences: {
        Row: { id: string; user_id: string; org_id: string; key: string; value: unknown; updated_at: string; created_at: string }
        Insert: { user_id: string; org_id: string; key: string; value: unknown; updated_at?: string }
        Update: { value?: unknown; updated_at?: string }
        Relationships: []
      }
      // ── Requisition module (migrations 032–039) ──
      users: {
        Row: Indexify<ReqUser>
        Insert: Indexify<ReqUserInsert>
        Update: Indexify<ReqUserUpdate>
        Relationships: []
      }
      org_members: {
        Row: Indexify<OrgMember>
        Insert: Indexify<OrgMemberInsert>
        Update: Indexify<OrgMemberUpdate>
        Relationships: []
      }
      departments: {
        Row: Indexify<Department>
        Insert: Indexify<DepartmentInsert>
        Update: Indexify<DepartmentUpdate>
        Relationships: []
      }
      locations: {
        Row: Indexify<ReqLocation>
        Insert: Indexify<LocationInsert>
        Update: Indexify<LocationUpdate>
        Relationships: []
      }
      compensation_bands: {
        Row: Indexify<CompensationBand>
        Insert: Indexify<CompensationBandInsert>
        Update: Indexify<CompensationBandUpdate>
        Relationships: []
      }
      openings: {
        Row: Indexify<Opening>
        Insert: Indexify<OpeningInsert>
        Update: Indexify<OpeningUpdate>
        Relationships: []
      }
      jobs: {
        Row: Indexify<ReqJob>
        Insert: Indexify<JobInsert>
        Update: Indexify<JobUpdate>
        Relationships: []
      }
      job_openings: {
        Row: Indexify<JobOpening>
        Insert: Indexify<JobOpening>
        Update: Indexify<Partial<JobOpening>>
        Relationships: []
      }
      job_postings: {
        Row: Indexify<JobPosting>
        Insert: Indexify<JobPostingInsert>
        Update: Indexify<JobPostingUpdate>
        Relationships: []
      }
      hiring_teams: {
        Row: Indexify<HiringTeam>
        Insert: Indexify<HiringTeamInsert>
        Update: Indexify<HiringTeamUpdate>
        Relationships: []
      }
      hiring_team_members: {
        Row: Indexify<HiringTeamMember>
        Insert: Indexify<HiringTeamMemberInsert>
        Update: Indexify<Partial<HiringTeamMemberInsert>>
        Relationships: []
      }
      approval_chains: {
        Row: Indexify<ApprovalChain>
        Insert: Indexify<ApprovalChainInsert>
        Update: Indexify<ApprovalChainUpdate>
        Relationships: []
      }
      approval_chain_steps: {
        Row: Indexify<ApprovalChainStep>
        Insert: Indexify<ApprovalChainStepInsert>
        Update: Indexify<ApprovalChainStepUpdate>
        Relationships: []
      }
      approvals: {
        Row: Indexify<Approval>
        Insert: Indexify<ApprovalInsert>
        Update: Indexify<ApprovalUpdate>
        Relationships: []
      }
      approval_steps: {
        Row: Indexify<ApprovalStep>
        Insert: Indexify<ApprovalStepInsert>
        Update: Indexify<ApprovalStepUpdate>
        Relationships: []
      }
      approval_audit_log: {
        Row: Indexify<ApprovalAuditLog>
        Insert: Indexify<ApprovalAuditLogInsert>
        Update: Indexify<Partial<ApprovalAuditLogInsert>>
        Relationships: []
      }
      custom_field_definitions: {
        Row: Indexify<CustomFieldDefinition>
        Insert: Indexify<CustomFieldDefinitionInsert>
        Update: Indexify<CustomFieldDefinitionUpdate>
        Relationships: []
      }
      webhook_subscriptions: {
        Row: Indexify<WebhookSubscription>
        Insert: Indexify<WebhookSubscriptionInsert>
        Update: Indexify<WebhookSubscriptionUpdate>
        Relationships: []
      }
      webhook_deliveries: {
        Row: Indexify<WebhookDelivery>
        Insert: Indexify<WebhookDeliveryInsert>
        Update: Indexify<Partial<WebhookDeliveryInsert>>
        Relationships: []
      }
      user_integrations: {
        Row: Indexify<UserIntegration>
        Insert: Indexify<UserIntegrationInsert>
        Update: Indexify<UserIntegrationUpdate>
        Relationships: []
      }
      approval_groups: {
        Row: Indexify<ApprovalGroup>
        Insert: Indexify<ApprovalGroupInsert>
        Update: Indexify<ApprovalGroupUpdate>
        Relationships: []
      }
      approval_group_members: {
        Row: Indexify<ApprovalGroupMember>
        Insert: Indexify<ApprovalGroupMemberInsert>
        Update: Indexify<Partial<ApprovalGroupMemberInsert>>
        Relationships: []
      }
      whatsapp_accounts: {
        Row: Indexify<WhatsAppAccount>
        Insert: Indexify<WhatsAppAccountInsert>
        Update: Indexify<WhatsAppAccountUpdate>
        Relationships: []
      }
      whatsapp_conversations: {
        Row: Indexify<WhatsAppConversation>
        Insert: Indexify<WhatsAppConversationInsert>
        Update: Indexify<WhatsAppConversationUpdate>
        Relationships: []
      }
      whatsapp_messages: {
        Row: Indexify<WhatsAppMessage>
        Insert: Indexify<WhatsAppMessageInsert>
        Update: Indexify<WhatsAppMessageUpdate>
        Relationships: []
      }
    }
    Views: Record<never, never>
    Functions: Record<never, never>
    Enums: {
      candidate_status: CandidateStatus
      role_status: RoleStatus
      hiring_request_status: HiringRequestStatus
      application_status: ApplicationStatus
      application_source: ApplicationSource
      interview_type: InterviewType
      interview_status: InterviewStatus
      offer_status: OfferStatus
      task_status: TaskStatus
      stage_color: StageColor
      scorecard_recommendation: ScorecardRecommendation
      ai_recommendation: AiRecommendation
      sequence_status: SequenceStatus
      enrollment_status: EnrollmentStatus
      sequence_email_status: SequenceEmailStatus
      job_queue_status: JobQueueStatus
    }
    CompositeTypes: Record<never, never>
  }
}

// ── Email Sequences ─────────────────────────────────────────────────────────

export type SequenceStatus = 'draft' | 'active' | 'archived'

export type EnrollmentStatus =
  | 'active'
  | 'completed'
  | 'replied'
  | 'bounced'
  | 'paused'
  | 'cancelled'

export type SequenceEmailStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'replied'
  | 'bounced'
  | 'failed'

export interface Sequence {
  id: string
  name: string
  description: string | null
  status: SequenceStatus
  created_by: string | null
  created_at: string
  updated_at: string
  stages?: SequenceStage[]
  stage_count?: number
  enrollment_count?: number
  reply_count?: number
}

export type SequenceChannel = 'email' | 'whatsapp' | 'sms' | 'linkedin'
export type StageCondition = 'no_reply' | 'no_open' | 'no_click'

export interface SequenceStage {
  id: string
  sequence_id: string
  order_index: number
  delay_days: number
  delay_minutes: number              // fine-grained delay (added to delay_days)
  subject: string
  body: string
  send_on_behalf_of: string | null
  send_on_behalf_email: string | null
  channel: SequenceChannel
  send_at: string | null             // exact datetime to send (overrides delay if set)
  send_at_time: string | null        // "HH:MM:SS" or null (legacy)
  send_timezone: string              // e.g. "America/New_York"
  delay_business_days: boolean
  condition: StageCondition | null   // null = unconditional
  created_at: string
  updated_at: string
}

export interface SequenceEnrollment {
  id: string
  sequence_id: string
  candidate_id: string
  application_id: string | null
  enrolled_by: string | null
  status: EnrollmentStatus
  current_stage_index: number
  next_send_at: string | null
  started_at: string
  completed_at: string | null
  created_at: string
  candidate_name?: string
  candidate_email?: string
  sequence_name?: string
}

export interface SequenceEmail {
  id: string
  enrollment_id: string
  stage_id: string
  candidate_id: string
  to_email: string
  subject: string
  body: string
  sendgrid_message_id: string | null
  status: SequenceEmailStatus
  sent_at: string | null
  opened_at: string | null
  clicked_at: string | null
  replied_at: string | null
  bounced_at: string | null
  open_count: number
  click_count: number
  created_at: string
}

export interface SequenceAnalytics {
  sequence_id: string
  sequence_name: string
  total_enrollments: number
  enrollment_statuses: Record<string, number>
  overall: {
    total_sent: number
    total_opened: number
    total_replied: number
    total_bounced: number
  }
  stages: StageAnalytics[]
}

export interface StageAnalytics {
  stage_id: string
  order_index: number
  subject: string
  delay_days: number
  sent: number
  delivered: number
  opened: number
  clicked: number
  replied: number
  bounced: number
}

// ── WhatsApp ─────────────────────────────────────────────────────────────────
// Two-way conversational messaging via Meta Cloud API (direct) or Vobiz (BSP).
// Accounts hold per-org credentials (access_token/app_secret encrypted via
// lib/crypto). Conversations track the 24h customer-service window via
// last_inbound_at. Column mapping per provider is documented in migration 063.

export type WhatsAppProvider = 'meta' | 'vobiz'
export type WhatsAppAccountStatus = 'connected' | 'disconnected' | 'error'
export type WhatsAppConversationStatus = 'active' | 'opted_out' | 'closed' | 'escalated'
export type WhatsAppMessageDirection = 'inbound' | 'outbound'
export type WhatsAppMessageStatus =
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'received'

export interface WhatsAppAccount {
  id: string
  org_id: string
  provider: WhatsAppProvider
  phone_number_id: string         // meta: phone number id · vobiz: channel_id
  waba_id: string | null          // meta only
  auth_id: string | null          // vobiz X-Auth-ID
  display_phone: string | null
  access_token: string            // encrypted at rest (meta: Graph token · vobiz: X-Auth-Token)
  app_secret: string | null       // encrypted at rest (meta webhook HMAC only)
  outreach_template: string | null
  template_language: string
  status: WhatsAppAccountStatus
  last_error: string | null
  created_at: string
  updated_at: string
}

export interface WhatsAppAccountInsert
  extends Omit<WhatsAppAccount, 'id' | 'created_at' | 'updated_at' | 'provider'> {
  id?: string
  created_at?: string
  updated_at?: string
  provider?: WhatsAppProvider
}

export interface WhatsAppAccountUpdate extends Partial<WhatsAppAccountInsert> {}

export interface WhatsAppConversation {
  id: string
  org_id: string
  person_id: string | null
  candidate_id: string | null
  application_id: string | null
  wa_phone: string                // E.164 with leading '+'
  status: WhatsAppConversationStatus
  agent_enabled: boolean
  last_inbound_at: string | null  // anchors Meta's 24h customer-service window
  last_outbound_at: string | null
  agent_turns: number
  context: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface WhatsAppConversationInsert
  extends Omit<
    WhatsAppConversation,
    | 'id'
    | 'created_at'
    | 'updated_at'
    | 'person_id'
    | 'candidate_id'
    | 'application_id'
    | 'status'
    | 'agent_enabled'
    | 'last_inbound_at'
    | 'last_outbound_at'
    | 'agent_turns'
    | 'context'
  > {
  id?: string
  created_at?: string
  updated_at?: string
  person_id?: string | null
  candidate_id?: string | null
  application_id?: string | null
  status?: WhatsAppConversationStatus
  agent_enabled?: boolean
  last_inbound_at?: string | null
  last_outbound_at?: string | null
  agent_turns?: number
  context?: Record<string, unknown>
}

export interface WhatsAppConversationUpdate extends Partial<WhatsAppConversationInsert> {}

export interface WhatsAppMessage {
  id: string
  conversation_id: string
  org_id: string
  direction: WhatsAppMessageDirection
  body: string | null
  template_name: string | null
  wa_message_id: string | null    // Meta wamid.* — webhook idempotency key
  status: WhatsAppMessageStatus
  sender: string | null           // 'candidate' | 'agent:scout' | 'agent:responder' | user id
  error: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface WhatsAppMessageInsert
  extends Omit<
    WhatsAppMessage,
    'id' | 'created_at' | 'body' | 'template_name' | 'wa_message_id' | 'status' | 'sender' | 'error' | 'metadata'
  > {
  id?: string
  created_at?: string
  body?: string | null
  template_name?: string | null
  wa_message_id?: string | null
  status?: WhatsAppMessageStatus
  sender?: string | null
  error?: string | null
  metadata?: Record<string, unknown>
}

export interface WhatsAppMessageUpdate extends Partial<WhatsAppMessageInsert> {}
