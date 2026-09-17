import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { formatCompensation, isUndefinedColumn, toNum } from '@/lib/postings/format'

type Supabase = SupabaseClient<Database>

/** Candidate-safe view of one posting, resolved by its public token
 *  (/apply/p/<token>). Only LIVE postings of OPEN, non-confidential jobs resolve;
 *  everything else is null so a stale link reads as "not found". Unlisted
 *  postings resolve — that is the whole point of the direct link. */
export interface PublicPosting {
  posting_id: string
  /** The job-level apply token the form submits against. */
  apply_token: string
  title: string
  /** Posting's own public JD (may be plain text or Tiptap HTML); null → use the job's. */
  description: string | null
  social_description: string | null
  /** Resolved location label: posting location → posting free text → job location → intake text. */
  location: string | null
  /** Public comp text when the posting shows compensation, else null. */
  compensation: string | null
  /** Structured comp for the apply page chip. `null` = hide; `undefined` = use the job's default. */
  salary: { min: number | null; max: number | null; currency: string | null } | null | undefined
  visibility: 'listed' | 'unlisted'
  company_name: string | null
}

interface PostingRow {
  id: string
  job_id: string
  title: string
  description: string | null
  location_text: string | null
  is_live: boolean
  visibility?: 'listed' | 'unlisted' | null
  location_id?: string | null
  show_compensation?: boolean | null
  comp_min?: number | string | null
  comp_max?: number | string | null
  comp_currency?: string | null
  social_description?: string | null
  public_token?: string | null
}

interface JobRow {
  id: string
  org_id: string
  status: string
  confidentiality: string | null
  apply_token: string | null
  custom_fields: Record<string, unknown> | null
  location_id?: string | null
  comp_min?: number | string | null
  comp_max?: number | string | null
  comp_currency?: string | null
}

/** Read the job's public-facing columns, tolerating a DB that predates
 *  migration 144 (no location_id / comp_* on jobs). */
export async function loadJobPublicRow(supabase: Supabase, jobId: string): Promise<JobRow | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  let res = await db.from('jobs')
    .select('id, org_id, status, confidentiality, apply_token, custom_fields, location_id, comp_min, comp_max, comp_currency')
    .eq('id', jobId).maybeSingle()
  if (res.error && isUndefinedColumn(res.error)) {
    res = await db.from('jobs')
      .select('id, org_id, status, confidentiality, apply_token, custom_fields')
      .eq('id', jobId).maybeSingle()
  }
  if (res.error) throw res.error
  return (res.data as JobRow | null) ?? null
}

/** Name of a location by id (null when unknown or the id is missing). */
export async function locationName(supabase: Supabase, id: string | null | undefined): Promise<string | null> {
  if (!id) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).from('locations').select('name').eq('id', id).maybeSingle()
  return (data as { name: string } | null)?.name ?? null
}

export async function getPublicPostingByToken(supabase: Supabase, token: string): Promise<PublicPosting | null> {
  if (!token || !/^[A-Za-z0-9_-]{6,80}$/.test(token)) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const { data: postingData, error } = await db
    .from('job_postings').select('*').eq('public_token', token).eq('is_live', true).maybeSingle()
  // No public_token column yet (pre-143 DB) → no posting links exist.
  if (error) {
    if (isUndefinedColumn(error) || error.code === 'PGRST116') return null
    throw error
  }
  const posting = postingData as PostingRow | null
  if (!posting || !posting.is_live) return null

  const job = await loadJobPublicRow(supabase, posting.job_id)
  if (!job || job.status !== 'open' || job.confidentiality === 'confidential' || !job.apply_token) return null

  const intake = (job.custom_fields?.intake ?? {}) as Record<string, unknown>
  const intakeLocation = typeof intake.location === 'string' && intake.location.trim() ? intake.location.trim() : null

  const location =
    (await locationName(supabase, posting.location_id)) ??
    (posting.location_text?.trim() || null) ??
    (await locationName(supabase, job.location_id)) ??
    intakeLocation

  // Compensation: posting override → job range; hidden entirely when the
  // posting says so. `undefined` lets the apply page keep its own default
  // (requisition comp) when neither the posting nor the job carries a range.
  const showComp = posting.show_compensation !== false
  let salary: PublicPosting['salary'] = undefined
  let compensation: string | null = null
  if (!showComp) {
    salary = null
  } else {
    const pMin = toNum(posting.comp_min), pMax = toNum(posting.comp_max)
    const jMin = toNum(job.comp_min),     jMax = toNum(job.comp_max)
    if (pMin != null || pMax != null) {
      salary = { min: pMin, max: pMax, currency: posting.comp_currency ?? job.comp_currency ?? null }
    } else if (jMin != null || jMax != null) {
      salary = { min: jMin, max: jMax, currency: job.comp_currency ?? null }
    }
    if (salary) compensation = formatCompensation(salary.min, salary.max, salary.currency)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: org } = await (supabase as any)
    .from('org_settings').select('company_name').eq('org_id', job.org_id).maybeSingle()

  return {
    posting_id: posting.id,
    apply_token: job.apply_token,
    title: posting.title,
    description: posting.description?.trim() ? posting.description : null,
    social_description: posting.social_description?.trim() ? posting.social_description : null,
    location,
    compensation,
    salary,
    visibility: posting.visibility === 'unlisted' ? 'unlisted' : 'listed',
    company_name: (org as { company_name: string | null } | null)?.company_name ?? null,
  }
}
