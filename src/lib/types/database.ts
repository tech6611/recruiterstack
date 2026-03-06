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
  hiring_manager_email: string | null   // nullable — optional when recruiter fills form
  hiring_manager_slack: string | null
  intake_token: string
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
// Must conform to GenericSchema expected by @supabase/supabase-js
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
