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
