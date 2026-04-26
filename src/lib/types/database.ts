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

export interface Candidate {
  id: string
  org_id: string
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
  extends Omit<Candidate, 'id' | 'created_at' | 'updated_at' | 'ai_summary' | 'ai_summary_generated_at' | 'phone' | 'resume_url' | 'current_title' | 'location' | 'linkedin_url'> {
  id?: string
  created_at?: string
  updated_at?: string
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
  hiring_request_id: string
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
  // Joined
  candidate?: Candidate
  stage?: PipelineStage
  hiring_request?: Pick<HiringRequest, 'id' | 'position_title' | 'department' | 'ticket_number'>
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

export interface PipelineStageInsert extends Omit<PipelineStage, 'id' | 'created_at'> {
  id?: string
  created_at?: string
}

export interface PipelineStageUpdate extends Partial<PipelineStageInsert> {}

// Application Row type (without optional joined relations)
type ApplicationRow = Omit<Application, 'candidate' | 'stage' | 'hiring_request'>

export interface ApplicationInsert extends Omit<ApplicationRow, 'id' | 'created_at' | 'applied_at' | 'resume_url' | 'cover_letter' | 'ai_score' | 'ai_recommendation' | 'ai_strengths' | 'ai_gaps' | 'ai_scored_at' | 'ai_criterion_scores' | 'source_detail' | 'credited_to' | 'stage_id' | 'review_status'> {
  id?: string
  created_at?: string
  applied_at?: string
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
