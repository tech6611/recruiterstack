import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Database } from '@/lib/types/database'
import type { JobTemplate, JobTemplatePosting, JobTemplateIntake } from '@/lib/types/requisitions'
import type { PlanTemplate } from '@/lib/pipeline/plan-templates'
import { applyPlanTemplateToJob } from '@/modules/ats/domain/plan-templates'
import { logger } from '@/lib/logger'

type Supabase = SupabaseClient<Database>
// job_templates (migration 143) isn't in the generated Supabase types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

// Full job templates (Ashby parity): job fields + JD + comp + a linked
// interview-plan template + a draft posting. Picked from the New Job drawer;
// the created job is a plain job afterwards (no live link back to the template).
//
// Reads tolerate the table not existing yet (pre-migration-143 database):
// list returns [] and get returns null instead of throwing, so the New Job
// drawer and the Job templates page degrade to "no templates".

// ── Zod schemas ──────────────────────────────────────────────

const nullableStr = (max: number) => z.string().trim().max(max).nullable().optional()
const uuidOrNull = z.preprocess(
  v => (v === '' || v === undefined ? null : v),
  z.string().uuid().nullable(),
)
const numOrNull = z.preprocess(
  v => (v === '' || v === undefined || v === null ? null : Number(v)),
  z.number().min(0).nullable(),
)

export const jobTemplatePostingSchema = z.object({
  title:       nullableStr(200),
  description: z.string().trim().max(50000).nullable().optional(),
  channel:     z.enum(['careers_page', 'linkedin', 'indeed', 'glassdoor', 'custom']).optional(),
  visibility:  z.enum(['listed', 'unlisted']).optional(),
})

export const jobTemplateIntakeSchema = z.object({
  team_context:     z.string().max(20000).nullable().optional(),
  key_requirements: z.string().max(20000).nullable().optional(),
  nice_to_have:     z.string().max(20000).nullable().optional(),
  target_companies: z.array(z.string().trim().max(200)).max(50).optional(),
  notes:            z.string().max(5000).nullable().optional(),
}).passthrough()

export const jobTemplateCreateSchema = z.object({
  name:             z.string().trim().min(1).max(120),
  description:      nullableStr(500),
  title:            nullableStr(200),
  department_id:    uuidOrNull.optional(),
  location_id:      uuidOrNull.optional(),
  employment_type:  nullableStr(50),
  work_model:       z.enum(['remote', 'hybrid', 'onsite']).nullable().optional(),
  level:            nullableStr(50),
  confidentiality:  z.enum(['public', 'confidential']).optional(),
  comp_min:         numOrNull.optional(),
  comp_max:         numOrNull.optional(),
  comp_currency:    z.preprocess(v => (v === '' ? null : v), z.string().trim().length(3).nullable()).optional(),
  jd:               z.string().max(50000).nullable().optional(),
  intake:           jobTemplateIntakeSchema.optional(),
  custom_fields:    z.record(z.string(), z.unknown()).optional(),
  plan_template_id: uuidOrNull.optional(),
  posting:          jobTemplatePostingSchema.nullable().optional(),
  is_active:        z.boolean().optional(),
})

export const jobTemplateUpdateSchema = jobTemplateCreateSchema.partial()

export const jobTemplateFromJobSchema = z.object({
  job_id:      z.string().uuid(),
  name:        z.string().trim().min(1).max(120),
  description: nullableStr(500),
})

export type JobTemplateCreateInput = z.infer<typeof jobTemplateCreateSchema>
export type JobTemplateUpdateInput = z.infer<typeof jobTemplateUpdateSchema>

// ── Reads ────────────────────────────────────────────────────

/** Postgres "relation does not exist" (42P01) → the migration isn't applied yet. */
function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42P01') return true
  const msg = error.message ?? ''
  return /job_templates/.test(msg) && /does not exist|schema cache/.test(msg)
}

export async function listJobTemplates(
  supabase: Supabase, orgId: string, opts: { includeInactive?: boolean } = {},
): Promise<JobTemplate[]> {
  let q = (supabase as unknown as LooseSb)
    .from('job_templates').select('*').eq('org_id', orgId).order('updated_at', { ascending: false })
  if (!opts.includeInactive) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) {
    if (isMissingTable(error)) return []
    throw error
  }
  return (data ?? []) as JobTemplate[]
}

export async function getJobTemplate(supabase: Supabase, orgId: string, id: string): Promise<JobTemplate | null> {
  const { data, error } = await (supabase as unknown as LooseSb)
    .from('job_templates').select('*').eq('org_id', orgId).eq('id', id).maybeSingle()
  if (error) {
    if (isMissingTable(error)) return null
    throw error
  }
  return (data ?? null) as JobTemplate | null
}

// ── Writes ───────────────────────────────────────────────────

function toRow(input: JobTemplateCreateInput | JobTemplateUpdateInput): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue
    row[k] = v
  }
  return row
}

export async function createJobTemplate(
  supabase: Supabase, orgId: string, input: JobTemplateCreateInput, createdBy: string | null = null,
): Promise<JobTemplate> {
  const { data, error } = await (supabase as unknown as LooseSb)
    .from('job_templates')
    .insert({ org_id: orgId, created_by: createdBy, ...toRow(input) })
    .select('*').single()
  if (error) throw error
  return data as JobTemplate
}

export async function updateJobTemplate(
  supabase: Supabase, orgId: string, id: string, input: JobTemplateUpdateInput,
): Promise<JobTemplate | null> {
  const row = toRow(input)
  if (Object.keys(row).length === 0) return getJobTemplate(supabase, orgId, id)
  const { data, error } = await (supabase as unknown as LooseSb)
    .from('job_templates').update(row).eq('org_id', orgId).eq('id', id).select('*').maybeSingle()
  if (error) throw error
  return (data ?? null) as JobTemplate | null
}

/** Soft-delete: the template disappears from pickers but past jobs keep their
 *  source_template reference intact. */
export async function deactivateJobTemplate(supabase: Supabase, orgId: string, id: string): Promise<boolean> {
  const { data, error } = await (supabase as unknown as LooseSb)
    .from('job_templates').update({ is_active: false }).eq('org_id', orgId).eq('id', id).select('id').maybeSingle()
  if (error) throw error
  return !!data
}

// ── Snapshot a job → template ────────────────────────────────

type JobSnapshotRow = {
  id: string
  title: string
  department_id: string | null
  description: string | null
  confidentiality: 'public' | 'confidential'
  custom_fields: Record<string, unknown> | null
  location_id?: string | null
  comp_min?: number | null
  comp_max?: number | null
  comp_currency?: string | null
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)

/** Normalise a free-typed work model ("Remote", "on-site", "hybrid") to the enum. */
function toWorkModel(v: unknown): JobTemplate['work_model'] {
  if (typeof v !== 'string') return null
  const s = v.trim().toLowerCase().replace(/[\s-]/g, '')
  if (s === 'remote') return 'remote'
  if (s === 'hybrid') return 'hybrid'
  if (s === 'onsite' || s === 'office' || s === 'inoffice') return 'onsite'
  return null
}

/** Save a job's current setup as a reusable template: title, department,
 *  location, comp, confidentiality, JD, the intake pieces (team context,
 *  requirements, target companies, level/work model/employment type) and the
 *  job's first posting (as a draft-posting recipe). Throws JOB_NOT_FOUND. */
export async function createJobTemplateFromJob(
  supabase: Supabase, orgId: string, jobId: string, name: string, createdBy: string | null = null,
  opts: { description?: string | null } = {},
): Promise<JobTemplate> {
  const sb = supabase as unknown as LooseSb
  let jobRes = await sb.from('jobs')
    .select('id, title, department_id, description, confidentiality, custom_fields, location_id, comp_min, comp_max, comp_currency')
    .eq('id', jobId).eq('org_id', orgId).maybeSingle()
  // Pre-migration-143 database: retry without the new columns.
  if (jobRes.error?.code === '42703') {
    jobRes = await sb.from('jobs')
      .select('id, title, department_id, description, confidentiality, custom_fields')
      .eq('id', jobId).eq('org_id', orgId).maybeSingle()
  }
  if (jobRes.error) throw jobRes.error
  const job = jobRes.data as JobSnapshotRow | null
  if (!job) throw new Error('JOB_NOT_FOUND')

  const cf = (job.custom_fields ?? {}) as Record<string, unknown>
  const intakeSrc = (cf.intake && typeof cf.intake === 'object' ? cf.intake : {}) as Record<string, unknown>

  const intake: JobTemplateIntake = {}
  if (str(intakeSrc.team_context))     intake.team_context     = intakeSrc.team_context as string
  if (str(intakeSrc.key_requirements)) intake.key_requirements = intakeSrc.key_requirements as string
  if (str(intakeSrc.nice_to_have))     intake.nice_to_have     = intakeSrc.nice_to_have as string
  if (Array.isArray(intakeSrc.target_companies)) {
    intake.target_companies = (intakeSrc.target_companies as unknown[]).filter((x): x is string => typeof x === 'string')
  }
  if (str(intakeSrc.notes)) intake.notes = intakeSrc.notes as string

  // Everything on custom_fields other than the intake payload + HM contact
  // (HM is per-job, never templated).
  const customFields: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(cf)) {
    if (k === 'intake' || k === 'hiring_manager_name' || k === 'hiring_manager_email') continue
    customFields[k] = v
  }

  // First posting on the job (if any) becomes the template's draft-posting recipe.
  let posting: JobTemplatePosting | null = null
  const { data: firstPosting } = await sb.from('job_postings')
    .select('title, description, channel, visibility')
    .eq('job_id', jobId).order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (firstPosting) {
    const p = firstPosting as { title: string; description: string | null; channel: JobTemplatePosting['channel']; visibility?: 'listed' | 'unlisted' }
    posting = {
      title:       p.title === job.title ? null : p.title,   // same-as-job → follow the new job's title
      description: p.description ?? null,
      channel:     p.channel ?? 'careers_page',
      visibility:  p.visibility ?? 'listed',
    }
  }

  const tpl = await createJobTemplate(supabase, orgId, {
    name,
    description:     opts.description ?? null,
    title:           job.title,
    department_id:   job.department_id ?? null,
    location_id:     job.location_id ?? null,
    employment_type: str(intakeSrc.employment_type),
    work_model:      toWorkModel(intakeSrc.work_model),
    level:           str(intakeSrc.level),
    confidentiality: job.confidentiality ?? 'public',
    comp_min:        job.comp_min ?? null,
    comp_max:        job.comp_max ?? null,
    comp_currency:   job.comp_currency ?? null,
    jd:              job.description ?? null,
    intake,
    custom_fields:   customFields,
    posting,
  }, createdBy)
  // Record provenance separately so the create schema stays user-facing.
  const { data } = await sb.from('job_templates').update({ source_job_id: jobId })
    .eq('id', tpl.id).eq('org_id', orgId).select('*').maybeSingle()
  return (data ?? tpl) as JobTemplate
}

// ── Apply a template → job ───────────────────────────────────

/**
 * Apply the template's linked pieces to an already-created job:
 *  1. the interview-plan template (if plan_template_id is set), via
 *     applyPlanTemplateToJob;
 *  2. a draft posting from template.posting (is_live false; title defaults to
 *     the job's title).
 * The scalar job fields (title, comp, JD …) are the caller's job — the New Job
 * drawer prefills them client-side so the recruiter can edit before creating.
 * Each step is best-effort: a failure is logged and the next step still runs.
 */
export async function applyJobTemplateToJob(
  supabase: Supabase, orgId: string, jobId: string, template: JobTemplate, createdBy: string | null = null,
): Promise<{ planApplied: boolean; postingId: string | null }> {
  const sb = supabase as unknown as LooseSb
  let planApplied = false
  let postingId: string | null = null

  if (template.plan_template_id) {
    try {
      const { data: plan, error } = await sb.from('plan_templates')
        .select('*').eq('org_id', orgId).eq('id', template.plan_template_id).maybeSingle()
      if (error) throw error
      if (plan) {
        await applyPlanTemplateToJob(supabase, orgId, jobId, plan as PlanTemplate)
        planApplied = true
      } else {
        logger.warn('[job-templates] linked plan template missing', { templateId: template.id, planTemplateId: template.plan_template_id })
      }
    } catch (err) {
      logger.warn('[job-templates] apply plan template failed', { templateId: template.id, jobId, err })
    }
  }

  if (template.posting) {
    try {
      const { data: job } = await sb.from('jobs').select('title').eq('id', jobId).eq('org_id', orgId).maybeSingle()
      const title = str(template.posting.title) ?? (job?.title as string | undefined) ?? template.title ?? 'Untitled posting'
      const base = {
        job_id:         jobId,
        title,
        description:    template.posting.description ?? template.jd ?? null,
        channel:        template.posting.channel ?? 'careers_page',
        channel_config: {},
        is_live:        false,
        created_by:     createdBy,
      }
      let ins = await sb.from('job_postings')
        .insert({ ...base, visibility: template.posting.visibility ?? 'listed' }).select('id').single()
      // Pre-migration-143 database: retry without `visibility`.
      if (ins.error?.code === '42703') ins = await sb.from('job_postings').insert(base).select('id').single()
      if (ins.error) throw ins.error
      postingId = (ins.data?.id as string) ?? null
    } catch (err) {
      logger.warn('[job-templates] create draft posting failed', { templateId: template.id, jobId, err })
    }
  }

  return { planApplied, postingId }
}
