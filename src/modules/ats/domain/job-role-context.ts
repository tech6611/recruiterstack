/**
 * Role context for the "niche recruiter" ICP (Phase 1): the facts that let the model
 * decide WHICH specialist recruiter it is for a search — the hiring MARKET (structured
 * location + work model) and the hiring COMPANY (org profile). Both already existed in
 * the DB but never reached a prompt: the ICP generator only ever saw the job's own
 * fields, and the location only as the site nickname ("Bangalore Back Office").
 *
 * `roleContextFromRows` is PURE + tested; `getJobRoleContext` does the two reads.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { htmlToPromptText } from '@/modules/ats/domain/job-pipelines'

type Supabase = SupabaseClient<Database>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

export interface MarketContext {
  /** The org's display name for the site, e.g. "Bangalore Back Office". */
  site: string | null
  city: string | null
  state: string | null
  /** ISO 3166-1 alpha-2, e.g. "IN". */
  country: string | null
  timezone: string | null
  /** 'onsite' | 'remote' | 'hybrid' — intake work_model wins over the location default. */
  work_model: string | null
}

export interface CompanyContext {
  name: string | null
  industry: string | null
  /** One of '1-10','11-50','51-200','201-1000','1000+' (org_settings constraint). */
  size: string | null
  website: string | null
  /** Plain-text "about", truncated for the prompt. */
  about: string | null
}

export interface JobRoleContext {
  market: MarketContext | null
  company: CompanyContext | null
}

export interface JobRoleContextJobRow {
  custom_fields?: Record<string, unknown> | null
  location?: {
    name?: string | null
    city?: string | null
    state?: string | null
    country?: string | null
    timezone?: string | null
    remote_type?: string | null
  } | null
}

export interface JobRoleContextOrgRow {
  company_name?: string | null
  industry?: string | null
  company_size?: string | null
  website?: string | null
  about?: string | null
}

const ABOUT_MAX = 600

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** Build the role context from the raw rows. PURE. A job with neither a linked
 *  location nor an intake location/work model yields market:null; an org with no
 *  profile fields yields company:null — the prompt then says "Not provided". */
export function roleContextFromRows(job: JobRoleContextJobRow | null, org: JobRoleContextOrgRow | null): JobRoleContext {
  const intake = ((job?.custom_fields ?? {}) as { intake?: Record<string, unknown> }).intake ?? {}
  const loc = job?.location ?? null

  const intakeWorkModel = text(intake.work_model)
  const work_model =
    intakeWorkModel ??
    (typeof intake.remote_ok === 'boolean' ? (intake.remote_ok ? 'remote' : null) : null) ??
    text(loc?.remote_type)

  const marketRaw: MarketContext = {
    site: text(loc?.name) ?? text(intake.location),
    city: text(loc?.city),
    state: text(loc?.state),
    country: text(loc?.country),
    timezone: text(loc?.timezone),
    work_model,
  }
  const market = Object.values(marketRaw).some(Boolean) ? marketRaw : null

  const about = htmlToPromptText(text(org?.about))
  const companyRaw: CompanyContext = {
    name: text(org?.company_name),
    industry: text(org?.industry),
    size: text(org?.company_size),
    website: text(org?.website),
    about: about ? (about.length > ABOUT_MAX ? about.slice(0, ABOUT_MAX).trimEnd() + '…' : about) : null,
  }
  const company = Object.values(companyRaw).some(Boolean) ? companyRaw : null

  return { market, company }
}

/** Await a Supabase query, swallowing errors — PostgREST builders are thenable but
 *  have no .catch, so a plain try/await is the only safe way to "never throw". */
async function safe<T>(q: PromiseLike<{ data: T | null }>): Promise<T | null> {
  try {
    return (await q).data ?? null
  } catch {
    return null
  }
}

/** Read the job's linked location + intake work model and the org's profile. Never
 *  throws — a failed read just leaves that half of the context null. */
export async function getJobRoleContext(supabase: Supabase, orgId: string, jobId: string): Promise<JobRoleContext> {
  const sb = supabase as unknown as LooseSb
  const [job, org] = await Promise.all([
    safe<JobRoleContextJobRow>(
      sb
        .from('jobs')
        .select('custom_fields, location:locations(name, city, state, country, timezone, remote_type)')
        .eq('id', jobId)
        .eq('org_id', orgId)
        .maybeSingle(),
    ),
    safe<JobRoleContextOrgRow>(
      sb
        .from('org_settings')
        .select('company_name, industry, company_size, website, about')
        .eq('org_id', orgId)
        .maybeSingle(),
    ),
  ])
  return roleContextFromRows(job, org)
}
