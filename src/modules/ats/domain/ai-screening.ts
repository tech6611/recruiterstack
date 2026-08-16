import type { SupabaseClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import type { Database } from '@/lib/types/database'
import type { ScreeningQuestion, ScreeningAnswer, ScreeningResult } from '@/lib/ai/screening'

type Supabase = SupabaseClient<Database>
// screening_sessions (migration 112) isn't in generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

export interface ScreeningSession {
  id: string
  org_id: string
  job_id: string | null
  application_id: string | null
  candidate_id: string | null
  icp_version: number | null
  token: string
  status: 'pending' | 'completed' | 'expired'
  questions: ScreeningQuestion[]
  answers: ScreeningAnswer[]
  result: ScreeningResult | null
  created_at: string
  completed_at: string | null
}

export async function createScreeningSession(
  supabase: Supabase,
  orgId: string,
  params: {
    jobId: string | null
    applicationId: string | null
    candidateId: string | null
    icpVersion: number | null
    questions: ScreeningQuestion[]
    createdBy?: string | null
  },
): Promise<ScreeningSession> {
  const token = randomBytes(20).toString('hex')
  const { data, error } = await (supabase as unknown as LooseSb)
    .from('screening_sessions')
    .insert({
      org_id: orgId,
      job_id: params.jobId,
      application_id: params.applicationId,
      candidate_id: params.candidateId,
      icp_version: params.icpVersion,
      token,
      status: 'pending',
      questions: params.questions,
      created_by: params.createdBy ?? null,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as ScreeningSession
}

/** Public lookup by candidate token (no org scope — the token IS the credential). */
export async function getScreeningByToken(supabase: Supabase, token: string): Promise<ScreeningSession | null> {
  const { data, error } = await (supabase as unknown as LooseSb)
    .from('screening_sessions')
    .select('*')
    .eq('token', token)
    .maybeSingle()
  if (error) throw error
  return (data ?? null) as ScreeningSession | null
}

export async function completeScreening(
  supabase: Supabase,
  token: string,
  answers: ScreeningAnswer[],
  result: ScreeningResult,
): Promise<void> {
  const { error } = await (supabase as unknown as LooseSb)
    .from('screening_sessions')
    .update({ answers, result, status: 'completed', completed_at: new Date().toISOString() })
    .eq('token', token)
  if (error) throw error
}

/** The latest screen for an application (recruiter surface). Defensive: returns
 *  null if the table isn't there yet (pre-migration), so the deploy never breaks. */
export async function getLatestScreeningForApplication(
  supabase: Supabase,
  orgId: string,
  applicationId: string,
): Promise<ScreeningSession | null> {
  try {
    const { data, error } = await (supabase as unknown as LooseSb)
      .from('screening_sessions')
      .select('*')
      .eq('org_id', orgId)
      .eq('application_id', applicationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) return null
    return (data ?? null) as ScreeningSession | null
  } catch {
    return null
  }
}
