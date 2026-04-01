// Auto-generated shape matching the Supabase schema.
// Re-run `supabase gen types typescript` after schema changes.

export type CandidateStatus =
  | 'active'
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
  extends Omit<Candidate, 'id' | 'created_at' | 'updated_at' | 'ai_summary' | 'ai_summary_generated_at'> {
  id?: string
  created_at?: string
  updated_at?: string
  ai_summary?: string | null
  ai_summary_generated_at?: string | null
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

export type ApplicationStatus = 'active' | 'rejected' | 'withdrawn' | 'hired'
export type ApplicationSource = 'manual' | 'applied' | 'imported' | 'sourced' | 'referral'
export type AiRecommendation = 'strong_yes' | 'yes' | 'maybe' | 'no'

export interface Application {
  id: string
  org_id: string
  candidate_id: string
  hiring_request_id: string
  stage_id: string | null
  status: ApplicationStatus
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

export interface OfferInsert extends Omit<Offer, 'id' | 'created_at' | 'updated_at' | 'candidate' | 'hiring_request'> {
  id?: string
  created_at?: string
  updated_at?: string
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

export interface JobQueueInsert extends Omit<JobQueueItem, 'id' | 'created_at' | 'status' | 'attempts'> {
  id?: string
  created_at?: string
  status?: JobQueueStatus
  attempts?: number
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

export interface ApplicationInsert extends Omit<ApplicationRow, 'id' | 'created_at' | 'applied_at'> {
  id?: string
  created_at?: string
  applied_at?: string
}

export interface ApplicationUpdate extends Partial<ApplicationInsert> {}

export interface ApplicationEventInsert extends Omit<ApplicationEvent, 'id' | 'created_at'> {
  id?: string
  created_at?: string
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

export interface CandidateTaskInsert extends Omit<CandidateTask, 'id' | 'created_at'> {
  id?: string
  created_at?: string
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

export type Database = {
  public: {
    Tables: {
      candidates: {
        Row: Candidate
        Insert: CandidateInsert
        Update: CandidateUpdate
        Relationships: []
      }
      roles: {
        Row: Role
        Insert: RoleInsert
        Update: RoleUpdate
        Relationships: []
      }
      hiring_requests: {
        Row: HiringRequest
        Insert: HiringRequestInsert
        Update: HiringRequestUpdate
        Relationships: []
      }
      pipeline_stages: {
        Row: PipelineStage
        Insert: PipelineStageInsert
        Update: PipelineStageUpdate
        Relationships: []
      }
      applications: {
        Row: ApplicationRow
        Insert: ApplicationInsert
        Update: ApplicationUpdate
        Relationships: []
      }
      application_events: {
        Row: ApplicationEvent
        Insert: ApplicationEventInsert
        Update: ApplicationEventUpdate
        Relationships: []
      }
      interviews: {
        Row: InterviewRow
        Insert: InterviewInsert
        Update: InterviewUpdate
        Relationships: []
      }
      offers: {
        Row: OfferRow
        Insert: OfferInsert
        Update: OfferUpdate
        Relationships: []
      }
      scorecards: {
        Row: Scorecard
        Insert: ScorecardInsert
        Update: ScorecardUpdate
        Relationships: []
      }
      candidate_tasks: {
        Row: CandidateTask
        Insert: CandidateTaskInsert
        Update: CandidateTaskUpdate
        Relationships: []
      }
      candidate_tags: {
        Row: CandidateTag
        Insert: CandidateTagInsert
        Update: Partial<CandidateTagInsert>
        Relationships: []
      }
      candidate_referrals: {
        Row: CandidateReferral
        Insert: CandidateReferralInsert
        Update: Partial<CandidateReferralInsert>
        Relationships: []
      }
      matches: {
        Row: Match
        Insert: MatchInsert
        Update: Partial<MatchInsert>
        Relationships: []
      }
      notifications: {
        Row: Notification
        Insert: NotificationInsert
        Update: NotificationUpdate
        Relationships: []
      }
      org_settings: {
        Row: OrgSettings
        Insert: OrgSettingsInsert
        Update: OrgSettingsUpdate
        Relationships: []
      }
      email_templates: {
        Row: EmailTemplate
        Insert: EmailTemplateInsert
        Update: EmailTemplateUpdate
        Relationships: []
      }
      email_drafts: {
        Row: EmailDraft
        Insert: EmailDraftInsert
        Update: EmailDraftUpdate
        Relationships: []
      }
      leads: {
        Row: Lead
        Insert: LeadInsert
        Update: Partial<LeadInsert>
        Relationships: []
      }
      job_queue: {
        Row: JobQueueItem
        Insert: JobQueueInsert
        Update: JobQueueUpdate
        Relationships: []
      }
      voice_calls: {
        Row: VoiceCall
        Insert: VoiceCallInsert
        Update: VoiceCallUpdate
        Relationships: []
      }
      sequences: {
        Row: SequenceRow
        Insert: SequenceInsert
        Update: SequenceUpdate
        Relationships: []
      }
      sequence_stages: {
        Row: SequenceStage
        Insert: SequenceStageInsert
        Update: SequenceStageUpdate
        Relationships: []
      }
      sequence_enrollments: {
        Row: SequenceEnrollmentRow
        Insert: SequenceEnrollmentInsert
        Update: SequenceEnrollmentUpdate
        Relationships: []
      }
      sequence_emails: {
        Row: SequenceEmail
        Insert: SequenceEmailInsert
        Update: SequenceEmailUpdate
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
  subject: string
  body: string
  send_on_behalf_of: string | null
  send_on_behalf_email: string | null
  channel: SequenceChannel
  send_at_time: string | null        // "HH:MM:SS" or null
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
