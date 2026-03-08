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
  created_at: string
  updated_at: string
}

export interface CandidateInsert
  extends Omit<Candidate, 'id' | 'created_at' | 'updated_at'> {
  id?: string
  created_at?: string
  updated_at?: string
}

export interface CandidateUpdate extends Partial<CandidateInsert> {}

// Candidate enriched with aggregated pipeline data — used by the list page
export interface CandidateListItem extends Candidate {
  active_applications_count: number
}

export interface Role {
  id: string
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

export type HiringRequestStatus =
  | 'intake_pending'
  | 'intake_submitted'
  | 'jd_generated'
  | 'jd_sent'
  | 'jd_approved'
  | 'posted'

export interface HiringRequest {
  id: string
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
}

// ── Pipeline ──────────────────────────────────────────────────────────────

export type StageColor = 'slate' | 'blue' | 'violet' | 'amber' | 'emerald' | 'green' | 'red' | 'pink'

export interface PipelineStage {
  id: string
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
  ai_scored_at:      string | null
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
  application_id: string
  event_type: ApplicationEventType
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
  application_id:   string
  interviewer_name: string
  stage_name:       string | null
  recommendation:   ScorecardRecommendation
  scores:           ScorecardScore[]
  overall_notes:    string | null
  created_at:       string
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

// Supabase Database shape for typed client
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
    }
    Views: Record<never, never>
    Functions: Record<never, never>
    Enums: {
      candidate_status: CandidateStatus
      role_status: RoleStatus
    }
    CompositeTypes: Record<never, never>
  }
}
