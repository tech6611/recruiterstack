import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ApplicationEventInsert,
  ApplicationInsert,
  Application,
  Database,
} from '@/lib/types/database'

type Supabase = SupabaseClient<Database>

export interface CreateApplicationInput {
  orgId: string
  candidateId: string
  hiringRequestId: string
  stageId?: string | null
  status?: Application['status']
  source: Application['source']
  sourceDetail?: string | null
  resumeUrl?: string | null
  coverLetter?: string | null
  creditedTo?: string | null
}

export async function createApplication(
  supabase: Supabase,
  input: CreateApplicationInput,
): Promise<Application> {
  const row: ApplicationInsert = {
    org_id: input.orgId,
    candidate_id: input.candidateId,
    hiring_request_id: input.hiringRequestId,
    stage_id: input.stageId ?? null,
    status: input.status ?? 'active',
    source: input.source,
    source_detail: input.sourceDetail ?? null,
    resume_url: input.resumeUrl ?? null,
    cover_letter: input.coverLetter ?? null,
    ai_score: null,
    ai_recommendation: null,
    ai_strengths: [],
    ai_gaps: [],
    ai_scored_at: null,
    ai_criterion_scores: null,
    credited_to: input.creditedTo ?? null,
  }

  const { data, error } = await supabase
    .from('applications')
    .insert(row as never)
    .select('*')
    .single()

  if (error) throw error
  return data as Application
}

export async function recordApplicationEvent(
  supabase: Supabase,
  input: ApplicationEventInsert,
): Promise<void> {
  const { error } = await supabase
    .from('application_events')
    .insert(input as never)

  if (error) throw error
}
