import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Application,
  Candidate,
  Database,
  HiringRequest,
  HiringRequestStatus,
  PipelineStage,
  ScreeningField,
  ScreeningFieldType,
  ScreeningVisibility,
  StageColor,
} from '@/lib/types/database'
import { getOrgScreeningTemplate } from '@/modules/ats/domain/screening'
import { captureApprovedSubstance } from '@/lib/jobs/substance'

type Supabase = SupabaseClient<Database>

// Public-safe view of a screening field for the apply page: rendering metadata
// plus the conditional-visibility rule (the page needs it to show/hide fields).
// Knockout rules stay server-side — they're evaluated on submit and never sent
// to the candidate.
export interface PublicScreeningField {
  id: string
  label: string
  help_text: string | null
  field_type: ScreeningFieldType
  options: string[]
  required: boolean
  is_eeo: boolean
  visible_when: ScreeningVisibility | null
}

export interface LegacyJobPipelineSummary extends HiringRequest {
  total_candidates: number
  // How many requisitions (openings) this job is linked to. 0 means the job has
  // no approved requisition behind it — surfaced as a warning badge on the board
  // (every job is now supposed to trace back to an approved requisition).
  opening_count: number
  stage_counts: {
    stage_id: string
    stage_name: string
    color: StageColor
    count: number
  }[]
}

export interface LegacyJobPipelineDetail extends HiringRequest {
  pipeline_stages: PipelineStage[]
  applications: (Application & { candidate: Candidate })[]
}

export interface LegacyJobScoringContext {
  job: HiringRequest
  stages: PipelineStage[]
  applications: (Application & { candidate: Candidate })[]
}

export interface LegacyCandidateJobContext {
  candidate: {
    name: string
    email: string
    current_title?: string | null
    location?: string | null
  }
  job: {
    position_title: string
    ticket_number?: string | null
  }
}

// ── Canonical apply (migration 068) — keyed on jobs.apply_token ──────────────

export interface CanonicalApplyJob {
  id: string
  org_id: string
  title: string
  status: string
}

/** Org branding shown on the apply page so the candidate journey stays on-brand
 *  (Publish JD Phase 2c). Subset of the careers-page branding — no hero/about. */
export interface ApplyBranding {
  company_name: string | null
  logo_url: string | null
  brand_color: string | null
  accent_color: string | null
  brand_font: string | null
}

export interface CanonicalApplyJobPreview {
  position_title: string
  department: string | null
  location: string | null
  // Work arrangement + seniority read from custom_fields.intake, shown as meta
  // chips on the apply page. `remote_ok` maps to a Remote/On-site work-type chip.
  remote_ok: boolean | null
  level: string | null
  employment_type: string | null
  generated_jd: string | null
  // Structured JD sections, read from custom_fields.intake (Publish JD Phase 1).
  // Candidate-safe only — internal intake (HM contact, budget, notes) is excluded.
  responsibilities: string | null
  requirements: string | null
  nice_to_have: string | null
  // The job's org branding (Publish JD Phase 2c). Null when the org hasn't set
  // any branding up.
  branding: ApplyBranding | null
  // Custom screening questions for this job (Publish JD Phase 3c). Empty when the
  // job (and the org default) define no questions.
  screening: { fields: PublicScreeningField[] }
  status: string
}

// ── Canonical board reads (Phase 3 / C4) ─────────────────────────────────────
// Adapter reads that return the EXISTING legacy board shapes
// (LegacyJobPipelineSummary / LegacyJobPipelineDetail) mapped from canonical
// `jobs`, so the /jobs board UI + /api/jobs routes are unchanged. Canonical jobs
// lack most legacy HiringRequest fields (ticket_number, hiring_manager_name,
// budget, generated_jd, …); we map what exists (jobs.title → position_title,
// department_id → departments.name, status, created_at) and fill the rest with
// null / sensible defaults. Stages come from pipeline_stages WHERE job_id and
// applications from applications WHERE job_id (migrations 066/068). The client is
// cast to `any` for not-yet-typed canonical columns, as in rbac.ts.

interface CanonicalJobRow {
  id: string
  org_id: string
  title: string
  status: string
  created_at: string | null
  apply_token?: string | null
  department: { name: string } | null
  // Board-only data not yet in dedicated columns lives in custom_fields:
  // scoring_criteria + hiring_manager_* (written via the repointed board writers).
  custom_fields?: Record<string, unknown> | null
}

/** Map a canonical `jobs` row into the legacy HiringRequest-ish shape the board
 *  UI expects. Legacy-only fields are null / sensible defaults, EXCEPT
 *  scoring_criteria + hiring_manager_* which are surfaced from custom_fields so
 *  the board shows the values the repointed writers persist (Phase 3 / C6.1). */
function canonicalJobToHiringRequest(row: CanonicalJobRow): HiringRequest {
  const cf = (row.custom_fields ?? {}) as Record<string, unknown>
  return {
    id: row.id,
    org_id: row.org_id,
    ticket_number: null,
    position_title: row.title,
    department: row.department?.name ?? null,
    hiring_manager_name: (cf.hiring_manager_name as string | undefined) ?? '',
    hiring_manager_email: (cf.hiring_manager_email as string | undefined) ?? null,
    hiring_manager_slack: (cf.hiring_manager_slack as string | undefined) ?? null,
    intake_token: '',
    // Only surface the public apply token once the job is open — pre-open jobs
    // must not expose a shareable (but non-functional) apply link. (migration 070)
    apply_link_token: row.status === 'open' ? (row.apply_token ?? null) : null,
    status: row.status as HiringRequestStatus,
    filled_by_recruiter: true,
    team_context: null,
    level: null,
    headcount: 1,
    location: null,
    remote_ok: false,
    key_requirements: null,
    nice_to_haves: null,
    target_companies: null,
    budget_min: null,
    budget_max: null,
    target_start_date: null,
    additional_notes: null,
    generated_jd: null,
    intake_sent_at: null,
    intake_submitted_at: null,
    jd_sent_at: null,
    created_at: row.created_at ?? '',
    updated_at: row.created_at ?? '',
    auto_advance_score: null,
    auto_reject_score: null,
    auto_advance_stage_id: null,
    auto_email_rejection: false,
    autopilot_recruiter_name: null,
    autopilot_company_name: null,
    scoring_criteria: (cf.scoring_criteria as HiringRequest['scoring_criteria'] | undefined) ?? null,
  }
}

/** Board summaries over canonical `jobs` (Phase 3 / C4). Mirrors
 *  listLegacyJobPipelineSummaries: per job, total_candidates = count of
 *  applications WHERE job_id, and stage_counts from pipeline_stages WHERE job_id
 *  (active apps per stage). Returns the LegacyJobPipelineSummary shape. */
export async function listCanonicalJobBoardSummaries(
  supabase: Supabase,
  orgId: string,
): Promise<LegacyJobPipelineSummary[]> {
  // job_id columns / apply_token are not yet in generated types (migrations
  // 066/068); cast the client as in rbac.ts.
  const [jobsRes, stagesRes, appsRes, linksRes] = await Promise.all([
    (supabase as any)
      .from('jobs')
      .select('id, org_id, title, status, created_at, custom_fields, department:departments(name)')
      .eq('org_id', orgId)
      // DELETE is a soft-archive (status='archived'); keep deleted jobs off the board.
      .neq('status', 'archived')
      .order('created_at', { ascending: false }),
    (supabase as any)
      .from('pipeline_stages')
      .select('id, job_id, name, color, order_index')
      .eq('org_id', orgId)
      .not('job_id', 'is', null),
    (supabase as any)
      .from('applications')
      .select('id, job_id, stage_id, status')
      .eq('org_id', orgId)
      .not('job_id', 'is', null),
    // Linked requisitions per job — used to flag req-less jobs on the board.
    (supabase as any)
      .from('job_openings')
      .select('job_id'),
  ])

  if (jobsRes.error) throw jobsRes.error
  if (stagesRes.error) throw stagesRes.error
  if (appsRes.error) throw appsRes.error
  if (linksRes.error) throw linksRes.error

  const stages = (stagesRes.data ?? []) as Array<
    Pick<PipelineStage, 'id' | 'job_id' | 'name' | 'color' | 'order_index'>
  >
  const apps = (appsRes.data ?? []) as Array<
    Pick<Application, 'id' | 'job_id' | 'stage_id' | 'status'>
  >
  const openingCountByJob = new Map<string, number>()
  for (const l of (linksRes.data ?? []) as Array<{ job_id: string }>) {
    openingCountByJob.set(l.job_id, (openingCountByJob.get(l.job_id) ?? 0) + 1)
  }

  return ((jobsRes.data ?? []) as CanonicalJobRow[]).map(row => {
    const jobStages = stages
      .filter(s => s.job_id === row.id)
      .sort((a, b) => a.order_index - b.order_index)
    const jobApps = apps.filter(a => a.job_id === row.id)
    const activeApps = jobApps.filter(a => a.status === 'active')

    return {
      ...canonicalJobToHiringRequest(row),
      total_candidates: jobApps.length,
      opening_count: openingCountByJob.get(row.id) ?? 0,
      stage_counts: jobStages.map(s => ({
        stage_id: s.id,
        stage_name: s.name,
        color: s.color,
        count: activeApps.filter(a => a.stage_id === s.id).length,
      })),
    }
  })
}

/** Board detail over a canonical `jobs` row (Phase 3 / C4). Mirrors
 *  getLegacyJobPipelineDetail: the job mapped into the HiringRequest-ish shape,
 *  pipeline_stages WHERE job_id (ordered), and applications WHERE job_id with
 *  their candidate. Candidate identity lives on `people`, so we join
 *  candidates(*, person:people(...)) and flatten name/email onto the candidate so
 *  the returned shape matches the legacy detail (candidate.name / candidate.email). */
export async function getCanonicalJobBoardDetail(
  supabase: Supabase,
  orgId: string,
  jobId: string,
): Promise<LegacyJobPipelineDetail | null> {
  // job_id columns are not yet in generated types (migration 066); cast as rbac.ts.
  const [jobRes, stagesRes, appsRes] = await Promise.all([
    (supabase as any)
      .from('jobs')
      .select('id, org_id, title, status, created_at, apply_token, custom_fields, department:departments(name)')
      .eq('id', jobId)
      .eq('org_id', orgId)
      .maybeSingle(),
    (supabase as any)
      .from('pipeline_stages')
      .select('*')
      .eq('job_id', jobId)
      .eq('org_id', orgId)
      .order('order_index'),
    (supabase as any)
      .from('applications')
      .select(
        '*, ai_score, ai_recommendation, ai_strengths, ai_gaps, ai_criterion_scores, ai_scored_at, candidate:candidates(*, person:people(name, email, phone, linkedin_url))',
      )
      .eq('job_id', jobId)
      .eq('org_id', orgId)
      .order('applied_at', { ascending: true }),
  ])

  if (jobRes.error) throw jobRes.error
  if (stagesRes.error) throw stagesRes.error
  if (appsRes.error) throw appsRes.error
  if (!jobRes.data) return null

  // Flatten the people join onto each candidate so name/email/phone/linkedin
  // are present at candidate.* (identity is owned by `people`), matching the
  // shape the legacy detail returns via candidates(*).
  const applications = ((appsRes.data ?? []) as any[]).map(app => {
    const candidate = app.candidate
    const person = candidate?.person ?? null
    return {
      ...app,
      candidate: candidate
        ? {
            ...candidate,
            name: person?.name ?? candidate.name ?? '',
            email: person?.email ?? candidate.email ?? '',
            phone: person?.phone ?? candidate.phone ?? null,
            linkedin_url: person?.linkedin_url ?? candidate.linkedin_url ?? null,
          }
        : candidate,
    }
  }) as unknown as (Application & { candidate: Candidate })[]

  return {
    ...canonicalJobToHiringRequest(jobRes.data as CanonicalJobRow),
    pipeline_stages: (stagesRes.data ?? []) as PipelineStage[],
    applications,
  }
}

/** Public-safe preview for the canonical apply page, keyed on jobs.apply_token.
 *  Mirrors getLegacyApplyJobPreview but reads canonical `jobs` (joining the
 *  department name). A canonical job has no dedicated location/JD column yet,
 *  so location is null and the description doubles as the public JD. */
export async function getCanonicalApplyJobPreview(
  supabase: Supabase,
  token: string,
): Promise<CanonicalApplyJobPreview | null> {
  // apply_token is not in generated types yet (migration 068); cast as in rbac.ts.
  const { data, error } = await (supabase as any)
    .from('jobs')
    .select('org_id, title, description, status, custom_fields, department:departments(name)')
    .eq('apply_token', token)
    .maybeSingle()

  if (error) {
    if (error.code === 'PGRST116' || error.message === 'Not found') return null
    throw error
  }
  if (!data) return null

  const row = data as {
    org_id: string
    title: string
    description: string | null
    status: string
    custom_fields: Record<string, unknown> | null
    department: { name: string } | null
  }
  // The public apply page only exists for open jobs. Treat any non-open job as
  // not found so a stale/leaked link shows "not found" rather than a fillable
  // form the POST would later reject. (migration 070)
  if (row.status !== 'open') return null
  const intake = (row.custom_fields?.intake ?? {}) as Record<string, unknown>
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null)

  // Pull the org's branding so the apply page can render on-brand (Phase 2c).
  // Independent of the careers_public toggle — that gates only the listing page.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: brandRow } = await (supabase as any)
    .from('org_settings')
    .select('company_name, logo_url, brand_color, accent_color, brand_font')
    .eq('org_id', row.org_id)
    .maybeSingle()
  const branding: ApplyBranding | null = brandRow
    ? {
        company_name: brandRow.company_name ?? null,
        logo_url: brandRow.logo_url ?? null,
        brand_color: brandRow.brand_color ?? null,
        accent_color: brandRow.accent_color ?? null,
        brand_font: brandRow.brand_font ?? null,
      }
    : null

  // Resolve this job's screening form: the per-job override on
  // custom_fields.screening, else the org default template (inherit-then-override,
  // Phase 3c). Strip to a public-safe shape — no knockout/conditional rules.
  const jobScreening = (row.custom_fields?.screening ?? null) as { fields?: ScreeningField[] } | null
  const screeningFields: ScreeningField[] =
    jobScreening && Array.isArray(jobScreening.fields)
      ? jobScreening.fields
      : (await getOrgScreeningTemplate(supabase, row.org_id)).fields
  const publicScreening: PublicScreeningField[] = screeningFields.map(f => ({
    id: f.id,
    label: f.label,
    help_text: f.help_text,
    field_type: f.field_type,
    options: f.options,
    required: f.required,
    is_eeo: f.is_eeo,
    visible_when: f.visible_when,
  }))

  return {
    position_title: row.title,
    department: row.department?.name ?? null,
    location: text(intake.location),
    remote_ok: typeof intake.remote_ok === 'boolean' ? intake.remote_ok : null,
    level: text(intake.level),
    employment_type: text(intake.employment_type),
    generated_jd: row.description,
    responsibilities: text(intake.team_context),
    requirements: text(intake.key_requirements),
    nice_to_have: text(intake.nice_to_have),
    branding,
    screening: { fields: publicScreening },
    status: row.status,
  }
}

// ── Public careers page (Publish JD — Phase 2b) ──────────────────────────────
// Resolve an org's branded careers page + its open jobs by the public
// careers_slug (migration 071). Public-safe: only orgs that have switched the
// page on (careers_public = true) resolve, and only open jobs (which have a live
// apply_token) are listed. org_settings.careers_* columns are not in the
// generated Database types yet; cast the client as elsewhere in this module.

export interface CareersNavLink {
  label: string
  url: string
}

// Custom content blocks shown below "About" on the public page (migration 078).
export interface CareersTextSection {
  id: string
  type: 'text'
  title?: string
  body: string
}
export interface CareersBenefitsSection {
  id: string
  type: 'benefits'
  title?: string
  card_color?: string
  items: { title: string; body?: string; image_url?: string }[]
}
export type CareersImageAlign = 'left' | 'right' | 'center'
export interface CareersStorySection {
  id: string
  type: 'story'
  title?: string
  body?: string
  image_url?: string
  image_width?: string
  image_align?: CareersImageAlign
  link_label?: string
  link_url?: string
}
export interface CareersCtaSection {
  id: string
  type: 'cta'
  headline: string
  subtext?: string
  button_label?: string
  button_url?: string
}
export type CareersContentSection =
  | CareersTextSection | CareersBenefitsSection | CareersStorySection | CareersCtaSection

export interface CareersPageBranding {
  company_name: string | null
  tagline: string | null
  about: string | null
  logo_url: string | null
  hero_image_url: string | null
  brand_color: string | null
  accent_color: string | null
  brand_font: string | null
  hero_headline: string | null
  hero_subheadline: string | null
  nav_links: CareersNavLink[]
  nav_cta_label: string | null
  nav_cta_url: string | null
  show_powered_by: boolean
  content_sections: CareersContentSection[]
}

export interface CareersPageJob {
  title: string
  department: string | null
  location: string | null
  employment_type: string | null
  remote_ok: boolean | null
  level: string | null
  apply_token: string
}

export interface CareersPage {
  branding: CareersPageBranding
  jobs: CareersPageJob[]
}

// Coerce the stored nav_links JSON into a clean {label,url}[]. Validation blocks
// bad entries on write, but this guards render too (older rows, unsafe schemes).
function sanitizeNavLinks(raw: unknown): CareersNavLink[] {
  if (!Array.isArray(raw)) return []
  const links: CareersNavLink[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const label = (item as Record<string, unknown>).label
    const url = (item as Record<string, unknown>).url
    if (typeof label !== 'string' || typeof url !== 'string') continue
    if (!label.trim() || !url.trim()) continue
    if (/^\s*(javascript|data|vbscript):/i.test(url)) continue
    links.push({ label: label.trim(), url: url.trim() })
    if (links.length >= 6) break
  }
  return links
}

// Coerce stored content_sections JSON into clean typed blocks. Like nav links,
// validation guards writes; this also guards render against old/bad rows and
// strips unsafe link schemes. Unknown block types are dropped.
function str(v: unknown): string { return typeof v === 'string' ? v.trim() : '' }
function safeUrl(v: unknown): string {
  const s = str(v)
  return /^\s*(javascript|data|vbscript):/i.test(s) ? '' : s
}
// True when an HTML string has no visible text/image — used to drop blocks that
// look empty even though Tiptap wrote an empty "<p></p>".
function htmlEmpty(s: string): boolean {
  if (!s) return true
  if (/<img\b/i.test(s)) return false
  return s.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim() === ''
}
function rich(v: unknown): string {
  const s = str(v)
  return htmlEmpty(s) ? '' : s
}
// A hex colour or ''. Guards the stored card fill against junk values.
function hex(v: unknown): string {
  const s = str(v)
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s) ? s : ''
}
// "60%" or "320px" (or '' for auto). Anything else is dropped.
function imgWidth(v: unknown): string {
  const s = str(v)
  return /^\d{1,4}(px|%)$/.test(s) ? s : ''
}
function imgAlign(v: unknown): CareersImageAlign | undefined {
  return v === 'left' || v === 'right' || v === 'center' ? v : undefined
}
function sanitizeContentSections(raw: unknown): CareersContentSection[] {
  if (!Array.isArray(raw)) return []
  const out: CareersContentSection[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const id = str(o.id) || `s${out.length}`
    switch (o.type) {
      case 'text': {
        const body = rich(o.body)
        if (!body) continue
        out.push({ id, type: 'text', title: rich(o.title) || undefined, body })
        break
      }
      case 'benefits': {
        const items = Array.isArray(o.items)
          ? o.items
              .map(it => (it && typeof it === 'object' ? it as Record<string, unknown> : {}))
              .map(it => ({ title: rich(it.title), body: rich(it.body) || undefined, image_url: safeUrl(it.image_url) || undefined }))
              .filter(it => it.title || it.body || it.image_url)
              .slice(0, 12)
          : []
        if (items.length === 0) continue
        out.push({ id, type: 'benefits', title: rich(o.title) || undefined, card_color: hex(o.card_color) || undefined, items })
        break
      }
      case 'story': {
        const body = rich(o.body)
        const image = safeUrl(o.image_url)
        const title = rich(o.title)
        if (!body && !image && !title) continue
        out.push({
          id, type: 'story',
          title: title || undefined,
          body: body || undefined,
          image_url: image || undefined,
          image_width: image ? (imgWidth(o.image_width) || undefined) : undefined,
          image_align: image ? imgAlign(o.image_align) : undefined,
          link_label: str(o.link_label) || undefined,
          link_url: safeUrl(o.link_url) || undefined,
        })
        break
      }
      case 'cta': {
        const headline = rich(o.headline)
        if (!headline) continue
        out.push({
          id, type: 'cta', headline,
          subtext: rich(o.subtext) || undefined,
          button_label: str(o.button_label) || undefined,
          button_url: safeUrl(o.button_url) || undefined,
        })
        break
      }
      default: continue
    }
    if (out.length >= 20) break
  }
  return out
}

export async function getCareersPageBySlug(
  supabase: Supabase,
  slug: string,
): Promise<CareersPage | null> {
  // careers_* columns are not in the generated types yet (migration 071); cast.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: org, error: orgErr } = await (supabase as any)
    .from('org_settings')
    .select('org_id, careers_public, company_name, tagline, about, logo_url, hero_image_url, brand_color, accent_color, brand_font, hero_headline, hero_subheadline, nav_links, nav_cta_label, nav_cta_url, show_powered_by, content_sections')
    .ilike('careers_slug', slug)
    .maybeSingle()

  if (orgErr) {
    if (orgErr.code === 'PGRST116' || orgErr.message === 'Not found') return null
    throw orgErr
  }
  // No such slug, or the page is switched off — treat both as "not found" so a
  // toggled-off page is hidden rather than showing an empty shell.
  if (!org || !org.careers_public) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: jobRows, error: jobsErr } = await (supabase as any)
    .from('jobs')
    .select('title, apply_token, custom_fields, department:departments(name)')
    .eq('org_id', org.org_id)
    .eq('status', 'open')
    .not('apply_token', 'is', null)
    .order('created_at', { ascending: false })

  if (jobsErr) throw jobsErr

  const jobs: CareersPageJob[] = ((jobRows ?? []) as Array<{
    title: string
    apply_token: string | null
    custom_fields: Record<string, unknown> | null
    department: { name: string } | null
  }>)
    .filter(r => !!r.apply_token)
    .map(r => {
      const intake = (r.custom_fields?.intake ?? {}) as Record<string, unknown>
      const loc = intake.location
      const empType = intake.employment_type
      const lvl = intake.level
      const remote = intake.remote_ok
      return {
        title: r.title,
        department: r.department?.name ?? null,
        location: typeof loc === 'string' && loc.trim() ? loc : null,
        employment_type: typeof empType === 'string' && empType.trim() ? empType : null,
        remote_ok: typeof remote === 'boolean' ? remote : null,
        level: typeof lvl === 'string' && lvl.trim() ? lvl : null,
        apply_token: r.apply_token as string,
      }
    })

  return {
    branding: {
      company_name: org.company_name ?? null,
      tagline: org.tagline ?? null,
      about: org.about ?? null,
      logo_url: org.logo_url ?? null,
      hero_image_url: org.hero_image_url ?? null,
      brand_color: org.brand_color ?? null,
      accent_color: org.accent_color ?? null,
      brand_font: org.brand_font ?? null,
      hero_headline: org.hero_headline ?? null,
      hero_subheadline: org.hero_subheadline ?? null,
      nav_links: sanitizeNavLinks(org.nav_links),
      nav_cta_label: org.nav_cta_label ?? null,
      nav_cta_url: org.nav_cta_url ?? null,
      show_powered_by: org.show_powered_by ?? true,
      content_sections: sanitizeContentSections(org.content_sections),
    },
    jobs,
  }
}

/** Resolve a canonical job by its public apply_token, or null. Mirrors
 *  getLegacyApplyJobByToken. A canonical job accepts applications when
 *  status = 'open' (there is no 'posted'/'active', so no auto-transition). */
export async function getCanonicalApplyJobByToken(
  supabase: Supabase,
  token: string,
): Promise<CanonicalApplyJob | null> {
  // apply_token is not in generated types yet (migration 068); cast as in rbac.ts.
  const { data, error } = await (supabase as any)
    .from('jobs')
    .select('id, org_id, title, status')
    .eq('apply_token', token)
    .maybeSingle()

  if (error) {
    if (error.code === 'PGRST116' || error.message === 'Not found') return null
    throw error
  }
  return (data as CanonicalApplyJob) ?? null
}

/** Token-population fields for a legacy job, by hiring_request_id. Used by the
 *  sequence-email handler. Matches the original inline read: looked up by id
 *  only (no org filter in scope there), missing/error → null. */
export async function getLegacyJobTokens(
  supabase: Supabase,
  hiringRequestId: string,
): Promise<Pick<HiringRequest, 'position_title' | 'autopilot_company_name' | 'autopilot_recruiter_name'> | null> {
  const { data } = await supabase
    .from('hiring_requests')
    .select('position_title, autopilot_company_name, autopilot_recruiter_name')
    .eq('id', hiringRequestId)
    .maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any) ?? null
}

// ── Canonical job stages (migration 066) — keyed on jobs.id via pipeline_stages.job_id ──

/** Ordered stages for a canonical job (Phase 3 / C1). */
export async function listJobStages(
  supabase: Supabase,
  orgId: string,
  jobId: string,
): Promise<Pick<PipelineStage, 'id' | 'name' | 'order_index'>[]> {
  const { data, error } = await supabase
    .from('pipeline_stages')
    .select('id, name, order_index')
    .eq('job_id', jobId)
    .eq('org_id', orgId)
    .order('order_index')

  if (error) throw error
  return (data ?? []) as Pick<PipelineStage, 'id' | 'name' | 'order_index'>[]
}

/** First stage ('Applied') of a canonical job — the entry stage for new applications. */
export async function getFirstJobStage(
  supabase: Supabase,
  orgId: string,
  jobId: string,
): Promise<Pick<PipelineStage, 'id' | 'name'> | null> {
  const { data, error } = await supabase
    .from('pipeline_stages')
    .select('id, name')
    .eq('job_id', jobId)
    .eq('org_id', orgId)
    .order('order_index')
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data as Pick<PipelineStage, 'id' | 'name'> | null
}

// Lookup a single pipeline stage by id within the org (move_application_to_stage
// + bulk_move_to_stage agent tools). Returns null when the stage does not exist
// in this org; callers emit their own not-found message.
// Source-agnostic: pipeline_stages are looked up by id+org, so this resolves a
// stage whether it belongs to a canonical job or a legacy hiring_request.
export async function getPipelineStageById(
  supabase: Supabase,
  orgId: string,
  stageId: string,
): Promise<Pick<PipelineStage, 'id' | 'name'> | null> {
  const { data, error } = await supabase
    .from('pipeline_stages')
    .select('id, name')
    .eq('id', stageId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return (data as Pick<PipelineStage, 'id' | 'name'>) ?? null
}

// ── Canonical agent lookups (Phase 3 / C5) ───────────────────────────────────
// Mirror the legacy agent helpers (findLegacyJobsForAgent / countLegacyJobs) over
// canonical `jobs`, so the copilot job tools resolve jobs from the canonical spine
// instead of `hiring_requests`. job columns are not yet in the generated Database
// types; cast the client as elsewhere in this module.

export interface CanonicalAgentJob {
  id: string
  title: string
  status: string
}

/** Lookup for get_job_pipeline over canonical `jobs`: by id, or fuzzy by title
 *  for disambiguation. Mirrors findLegacyJobsForAgent. */
export async function findCanonicalJobsForAgent(
  supabase: Supabase,
  orgId: string,
  opts: { jobId?: string; titleQuery?: string; limit?: number },
): Promise<CanonicalAgentJob[]> {
  // jobs columns are not yet in the generated types; cast as in rbac.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any)
    .from('jobs')
    .select('id, title, status')
    .eq('org_id', orgId)

  if (opts.jobId) q = q.eq('id', opts.jobId)
  else if (opts.titleQuery) q = q.ilike('title', `%${opts.titleQuery}%`)

  const { data, error } = await q.limit(opts.limit ?? 5)
  if (error) throw error
  return (data ?? []) as CanonicalAgentJob[]
}

/** Total canonical job count for get_dashboard_stats. Mirrors countLegacyJobs. */
export async function countCanonicalJobs(supabase: Supabase, orgId: string): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error } = await (supabase as any)
    .from('jobs')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)

  if (error) throw error
  return count ?? 0
}

// ── Canonical job creation (Phase 3 / C3) ────────────────────────────────────

export interface CreateCanonicalJobInput {
  title: string
  department_id?: string | null
  description?: string | null
}

/** Gate-enforcing job creation: a job may only be created from an APPROVED
 *  requisition (opening), mirroring POST /api/req-jobs (the single source of
 *  truth for that rule). Verifies the opening is approved, inserts the job as
 *  'draft', and links the two via job_openings. Throws 'OPENING_NOT_FOUND' or
 *  'OPENING_NOT_APPROVED' so callers can surface a precise, actionable message.
 *  linked_by is nullable (migration 035), so agent contexts without a userId
 *  pass null. */
export async function createCanonicalJobFromApprovedOpening(
  supabase: Supabase,
  orgId: string,
  openingId: string,
  input: CreateCanonicalJobInput,
  linkedBy?: string | null,
): Promise<{ id: string; title: string }> {
  const { data: opening, error: openingErr } = await supabase
    .from('openings')
    .select('id, status')
    .eq('id', openingId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (openingErr) throw openingErr
  if (!opening) throw new Error('OPENING_NOT_FOUND')
  if ((opening as { status: string }).status !== 'approved') {
    throw new Error('OPENING_NOT_APPROVED')
  }

  // cast: jobs columns are not yet in the generated Database types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('jobs')
    .insert({
      title:         input.title,
      department_id: input.department_id ?? null,
      description:   input.description ?? null,
      status:        'draft',
      org_id:        orgId,
      created_by:    linkedBy ?? null,
    })
    .select('id, title')
    .single()

  if (error) throw error
  const job = data as { id: string; title: string }

  // Link the approved requisition to the new job. Ignore a duplicate link
  // (composite PK) gracefully.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: linkErr } = await (supabase as any)
    .from('job_openings')
    .insert({ job_id: job.id, opening_id: openingId, linked_by: linkedBy ?? null })
  if (linkErr && linkErr.code !== '23505') throw linkErr

  return job
}

// ── Canonical intake creation (Phase 3 / C5.5) ───────────────────────────────
// Mirror of createLegacyIntakeRequest, but the intake IS a canonical `job`:
// an intake-pending job = status 'draft' (becomes 'open' on intake submit /
// approve). The migration-069 jobs-insert trigger auto-generates
// jobs.intake_token (mirrors the migration-068 apply_token trigger); migration
// 066 seeds the 6 default pipeline_stages keyed on job_id. The generated JD will
// land in jobs.description; structured intake fields live in jobs.custom_fields.
// Canonical jobs have no hiring-manager column, so HM name/email go into
// custom_fields for now. jobs.intake_token / custom_fields are not yet in the
// generated Database types; cast the client as elsewhere in this module.

export interface CreateCanonicalIntakeInput {
  title: string
  hiringManagerName?: string | null
  hiringManagerEmail?: string | null
  /** Internal users.id — jobs.created_by is NOT NULL. */
  createdBy: string
}

export async function createCanonicalIntakeJob(
  supabase: Supabase,
  orgId: string,
  input: CreateCanonicalIntakeInput,
): Promise<{ id: string; intake_token: string; title: string }> {
  // cast: jobs.intake_token / custom_fields are not yet in the generated types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('jobs')
    .insert({
      title:         input.title,
      status:        'draft',
      org_id:        orgId,
      created_by:    input.createdBy,
      custom_fields: {
        intake: {
          hiring_manager_name:  input.hiringManagerName ?? null,
          hiring_manager_email: input.hiringManagerEmail ?? null,
        },
      },
    })
    .select('id, intake_token, title')
    .single()

  if (error) throw error
  return data as { id: string; intake_token: string; title: string }
}

// ── Canonical intake reads/writes (Phase 3 / C5.5) ───────────────────────────
//
// Mirror the legacy hiring_requests intake reads/writes used by the three
// /api/intake/[token] routes, but operate on canonical `jobs` keyed by
// jobs.intake_token (migration 069). The HM-facing form data, the AI JD
// (jobs.description), and the structured intake fields (jobs.custom_fields.intake)
// all live on the job. An intake-pending job = status 'draft'; on submit/approve
// it goes live (status 'open' → apply-ready via the apply_token from 068).
// jobs.intake_token / custom_fields are not in the generated Database types yet;
// cast the client as elsewhere in this module.

/** Public-safe intake form data, keyed on jobs.intake_token. Mirrors the legacy
 *  hiring_requests intake GET shape consumed by /intake/[token]. */
export interface CanonicalIntakeJobForm {
  id: string
  position_title: string
  department: string | null
  hiring_manager_name: string | null
  status: string
  intake_submitted_at: string | null
  jd_sent_at: string | null
  created_at: string | null
}

/** Full canonical intake job row needed by the JD-generation + submit paths. */
export interface CanonicalIntakeJob {
  id: string
  org_id: string
  title: string
  status: string
  description: string | null
  department: string | null
  custom_fields: Record<string, unknown>
}

/** Structured intake fields the HM submits (stored in custom_fields.intake). */
export interface CanonicalIntakeFields {
  team_context?: string | null
  level?: string | null
  employment_type?: string | null
  headcount?: number | null
  location?: string | null
  remote_ok?: boolean | null
  key_requirements?: string | null
  nice_to_haves?: string | null
  target_companies?: string | null
  budget_min?: number | null
  budget_max?: number | null
  target_start_date?: string | null
  additional_notes?: string | null
}

function readIntakeBag(customFields: Record<string, unknown> | null): Record<string, unknown> {
  const cf = customFields ?? {}
  const intake = cf.intake
  return intake && typeof intake === 'object' ? (intake as Record<string, unknown>) : {}
}

/** Resolve a canonical intake job's form data by its intake_token, or null.
 *  Mirrors the legacy hiring_requests intake GET. The department name is read
 *  from the joined departments row; HM name + timestamps from custom_fields.intake. */
export async function getCanonicalIntakeJobByToken(
  supabase: Supabase,
  token: string,
): Promise<CanonicalIntakeJobForm | null> {
  // intake_token / custom_fields not in generated types yet (migration 069); cast.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('jobs')
    .select('id, title, status, created_at, custom_fields, department:departments(name)')
    .eq('intake_token', token)
    .maybeSingle()

  if (error) {
    if (error.code === 'PGRST116' || error.message === 'Not found') return null
    throw error
  }
  if (!data) return null

  const row = data as {
    id: string
    title: string
    status: string
    created_at: string | null
    custom_fields: Record<string, unknown> | null
    department: { name: string } | null
  }
  const bag = readIntakeBag(row.custom_fields)
  return {
    id: row.id,
    position_title: row.title,
    department: row.department?.name ?? null,
    hiring_manager_name: (bag.hiring_manager_name as string | undefined) ?? null,
    status: row.status,
    intake_submitted_at: (bag.intake_submitted_at as string | undefined) ?? null,
    jd_sent_at: (bag.jd_sent_at as string | undefined) ?? null,
    created_at: row.created_at,
  }
}

/** Resolve the full canonical intake job (incl. custom_fields) by intake_token,
 *  for the JD-generation + submit paths. Returns null when not found. */
export async function getCanonicalIntakeJobFull(
  supabase: Supabase,
  token: string,
): Promise<CanonicalIntakeJob | null> {
  // intake_token / custom_fields not in generated types yet (migration 069); cast.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('jobs')
    .select('id, org_id, title, status, description, custom_fields, department:departments(name)')
    .eq('intake_token', token)
    .maybeSingle()

  if (error) {
    if (error.code === 'PGRST116' || error.message === 'Not found') return null
    throw error
  }
  if (!data) return null

  const row = data as {
    id: string
    org_id: string
    title: string
    status: string
    description: string | null
    custom_fields: Record<string, unknown> | null
    department: { name: string } | null
  }
  return {
    id: row.id,
    org_id: row.org_id,
    title: row.title,
    status: row.status,
    description: row.description,
    department: row.department?.name ?? null,
    custom_fields: row.custom_fields ?? {},
  }
}

/** Persist the HM intake submission on the canonical job: writes the final JD to
 *  jobs.description, merges structured fields + timestamps into
 *  custom_fields.intake, and flips the job live (status 'open'). Mirrors the
 *  legacy hiring_requests submit, which set generated_jd + status 'jd_approved'.
 *  The optional title lets the HM rename the role. */
export async function submitCanonicalIntakeJob(
  supabase: Supabase,
  token: string,
  args: {
    positionTitle?: string | null
    finalJd: string
    fields: CanonicalIntakeFields
    existingCustomFields: Record<string, unknown>
  },
): Promise<void> {
  const now = new Date().toISOString()
  const intakeBag: Record<string, unknown> = {
    ...readIntakeBag(args.existingCustomFields),
    team_context: args.fields.team_context ?? null,
    level: args.fields.level ?? null,
    employment_type: args.fields.employment_type ?? null,
    headcount: args.fields.headcount ?? 1,
    location: args.fields.location ?? null,
    remote_ok: args.fields.remote_ok ?? false,
    key_requirements: args.fields.key_requirements ?? null,
    nice_to_haves: args.fields.nice_to_haves ?? null,
    target_companies: args.fields.target_companies ?? null,
    budget_min: args.fields.budget_min ?? null,
    budget_max: args.fields.budget_max ?? null,
    target_start_date: args.fields.target_start_date ?? null,
    additional_notes: args.fields.additional_notes ?? null,
    intake_submitted_at: now,
    jd_sent_at: now,
  }
  const customFields: Record<string, unknown> = {
    ...args.existingCustomFields,
    intake: intakeBag,
  }

  const update: Record<string, unknown> = {
    description: args.finalJd,
    custom_fields: customFields,
    status: 'open',
  }
  if (args.positionTitle?.trim()) update.title = args.positionTitle.trim()

  // intake_token / custom_fields not in generated types yet (migration 069); cast.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('jobs')
    .update(update)
    .eq('intake_token', token)

  if (error) throw error
}

/** Store the AI-generated JD on the canonical intake job's description without
 *  changing status (used by the generate-jd preview/persist path). */
export async function setCanonicalIntakeJobJd(
  supabase: Supabase,
  token: string,
  jd: string,
): Promise<void> {
  // intake_token not in generated types yet (migration 069); cast.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('jobs')
    .update({ description: jd })
    .eq('intake_token', token)

  if (error) throw error
}

/** Approve a canonical intake job (one-click email link): flips status to 'open'
 *  when it is still pending. Mirrors the legacy approve route, which set
 *  'jd_approved' from 'jd_sent'/'jd_generated'. Returns the job title, or null
 *  when the link is invalid / already actioned. */
export async function approveCanonicalIntakeJob(
  supabase: Supabase,
  token: string,
): Promise<{ position_title: string } | null> {
  // intake_token not in generated types yet (migration 069); cast.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('jobs')
    .update({ status: 'open' })
    .eq('intake_token', token)
    .in('status', ['draft', 'pending_approval', 'approved'])
    .select('id, title')
    .maybeSingle()

  if (error) {
    if (error.code === 'PGRST116' || error.message === 'Not found') return null
    throw error
  }
  if (!data) return null
  // This one-click path IS the approval for an intake job, so baseline the
  // approved snapshot here too (the engine path captures it in applyApprovedToTarget).
  await captureApprovedSubstance(supabase, (data as { id: string }).id)
  return { position_title: (data as { title: string }).title }
}

// ── Canonical job read/update for the update_job agent tool (Phase 3 / C5.6 — agent B) ──
// Mirror getLegacyJobById / updateLegacyJob over canonical `jobs`. The copilot
// update_job tool only reads `position_title` (for its confirmation string) and
// writes a small set of fields; canonical jobs expose title/description/status,
// so we surface title→position_title and accept those three updatable columns.
// jobs columns are not yet in the generated Database types; cast the client as
// elsewhere in this module.

export interface CanonicalAgentJobRow {
  id: string
  org_id: string
  position_title: string
  status: string
  description: string | null
}

/** Resolve a canonical job by id within the org for the update_job tool, mapping
 *  title→position_title so the tool's confirmation string is unchanged. */
export async function getCanonicalJobById(
  supabase: Supabase,
  orgId: string,
  jobId: string,
): Promise<CanonicalAgentJobRow | null> {
  // jobs columns are not yet in the generated types; cast as in rbac.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('jobs')
    .select('id, org_id, title, status, description')
    .eq('id', jobId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const row = data as {
    id: string
    org_id: string
    title: string
    status: string
    description: string | null
  }
  return {
    id: row.id,
    org_id: row.org_id,
    position_title: row.title,
    status: row.status,
    description: row.description,
  }
}

/** Updatable canonical job columns for the update_job tool + the board writers
 *  repointed off the deleted /api/hiring-requests route (Phase 3 / C6.1).
 *  `custom_fields` is MERGED (shallow) into the existing jobs.custom_fields JSONB
 *  rather than overwriting it — board-only data (scoring_criteria, hiring_manager_*)
 *  lives there and must not clobber the intake bag. */
export interface CanonicalJobUpdate {
  title?: string
  description?: string
  status?: string
  custom_fields?: Record<string, unknown>
}

/** Partial update of a canonical job for update_job. Mirrors updateLegacyJob.
 *  When `custom_fields` is supplied it is shallow-merged into the row's existing
 *  custom_fields (read-then-write); all other fields are set directly. */
export async function updateCanonicalJob(
  supabase: Supabase,
  orgId: string,
  jobId: string,
  updates: CanonicalJobUpdate,
): Promise<void> {
  const { custom_fields, ...rest } = updates
  const patch: Record<string, unknown> = { ...rest }

  // Shallow-merge custom_fields into the existing JSONB so board writers
  // (scoring_criteria, hiring_manager_*) don't overwrite the intake bag.
  if (custom_fields !== undefined) {
    // jobs.custom_fields is not in the generated types yet; cast as in rbac.ts.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing, error: readErr } = await (supabase as any)
      .from('jobs')
      .select('custom_fields')
      .eq('id', jobId)
      .eq('org_id', orgId)
      .maybeSingle()
    if (readErr) throw readErr
    const current = (existing?.custom_fields ?? {}) as Record<string, unknown>
    patch.custom_fields = { ...current, ...custom_fields }
  }

  // jobs columns are not yet in the generated types; cast as in rbac.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('jobs')
    .update(patch)
    .eq('id', jobId)
    .eq('org_id', orgId)

  if (error) throw error
}

// ── Canonical scoring + candidate context (Phase 3 / C5.6) ───────────────────
// Mirror the legacy scoring/interview readers (getLegacyJobScoringContext /
// getLegacyCandidateJobContext) over the canonical spine so canonical-job
// candidacies (applications.job_id, hiring_request_id null) are visible to the
// bulk-scoring + interview-scheduling flows. The job is mapped into the legacy
// HiringRequest-ish shape via canonicalJobToHiringRequest (so callers reading
// job.position_title / scoring_criteria / auto_* are unchanged); stages come
// from pipeline_stages WHERE job_id and applications from applications WHERE
// job_id (migrations 066/068). Candidate identity lives on `people`, so we join
// candidates(*, person:people(...)) and flatten name/email/phone/linkedin onto
// the candidate, matching getCanonicalJobBoardDetail. job_id columns are not in
// the generated Database types yet; cast the client as elsewhere in this module.

/** Scoring context over a canonical `jobs` row (Phase 3 / C5.6). Mirrors
 *  getLegacyJobScoringContext: the job mapped into the legacy HiringRequest-ish
 *  shape, pipeline_stages WHERE job_id (ordered), and ACTIVE applications WHERE
 *  job_id with their candidate (identity flattened from people). */
export async function getCanonicalJobScoringContext(
  supabase: Supabase,
  orgId: string,
  jobId: string,
): Promise<LegacyJobScoringContext | null> {
  // job_id / people join columns not in generated types yet; cast as rbac.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [jobRes, stagesRes, appsRes] = await Promise.all([
    (supabase as any)
      .from('jobs')
      .select('id, org_id, title, status, created_at, custom_fields, department:departments(name)')
      .eq('id', jobId)
      .eq('org_id', orgId)
      .maybeSingle(),
    (supabase as any)
      .from('pipeline_stages')
      .select('*')
      .eq('job_id', jobId)
      .eq('org_id', orgId)
      .order('order_index'),
    (supabase as any)
      .from('applications')
      .select('*, candidate:candidates(*, person:people(name, email, phone, linkedin_url))')
      .eq('job_id', jobId)
      .eq('org_id', orgId)
      .eq('status', 'active'),
  ])

  if (jobRes.error) throw jobRes.error
  if (stagesRes.error) throw stagesRes.error
  if (appsRes.error) throw appsRes.error
  if (!jobRes.data) return null

  // Flatten the people join onto each candidate so name/email/phone/linkedin are
  // present at candidate.* (identity is owned by `people`), as in the board detail.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applications = ((appsRes.data ?? []) as any[]).map(app => {
    const candidate = app.candidate
    const person = candidate?.person ?? null
    return {
      ...app,
      candidate: candidate
        ? {
            ...candidate,
            name: person?.name ?? candidate.name ?? '',
            email: person?.email ?? candidate.email ?? '',
            phone: person?.phone ?? candidate.phone ?? null,
            linkedin_url: person?.linkedin_url ?? candidate.linkedin_url ?? null,
          }
        : candidate,
    }
  }) as unknown as (Application & { candidate: Candidate })[]

  return {
    job: canonicalJobToHiringRequest(jobRes.data as CanonicalJobRow),
    stages: (stagesRes.data ?? []) as PipelineStage[],
    applications,
  }
}

/** Candidate + job context for a canonical application (Phase 3 / C5.6). Mirrors
 *  getLegacyCandidateJobContext, but resolves both sides from the application:
 *  applications.job_id → the canonical job (title → position_title; canonical
 *  jobs have no ticket_number, so it is null), and applications.candidate_id →
 *  the candidate with identity flattened from people. Returns null when the
 *  application (or its job/candidate) is not found in this org. */
export async function getCanonicalCandidateJobContext(
  supabase: Supabase,
  orgId: string,
  applicationId: string,
): Promise<LegacyCandidateJobContext | null> {
  // job_id / people join columns not in generated types yet; cast as rbac.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('applications')
    .select(
      'job:jobs(title), candidate:candidates(current_title, location, person:people(name, email))',
    )
    .eq('id', applicationId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (error) {
    if (error.code === 'PGRST116' || error.message === 'Not found') return null
    throw error
  }
  if (!data) return null

  const row = data as {
    job: { title: string } | null
    candidate: {
      current_title: string | null
      location: string | null
      person: { name: string | null; email: string | null } | null
    } | null
  }
  if (!row.job || !row.candidate) return null

  const person = row.candidate.person
  return {
    candidate: {
      name: person?.name ?? '',
      email: person?.email ?? '',
      current_title: row.candidate.current_title ?? null,
      location: row.candidate.location ?? null,
    },
    job: {
      position_title: row.job.title,
      ticket_number: null,
    },
  }
}

// ── Canonical sequence-email token fields (Phase 3 / C5.6 — agent B) ─────────
// Resolve the token-population fields for an application's job, covering BOTH
// canonical (applications.job_id) and legacy (applications.hiring_request_id)
// candidacies. Replaces the handler's two-step getApplicationHiringRequestId →
// getLegacyJobTokens, which was blind to canonical-job applications. Canonical
// `jobs` expose only `title` (→ position_title); there is no canonical
// company/recruiter column, so those tokens come from the legacy job when the
// application is legacy, and are empty for canonical jobs. Returns null when the
// application has no resolvable job. job_id / canonical columns are not in the
// generated Database types yet; cast the client as elsewhere in this module.

export interface JobTokenFields {
  position_title: string | null
  autopilot_company_name: string | null
  autopilot_recruiter_name: string | null
}

export async function getApplicationJobTokens(
  supabase: Supabase,
  applicationId: string,
): Promise<JobTokenFields | null> {
  // job_id not in generated types yet (migration 066); cast as in rbac.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: app } = await (supabase as any)
    .from('applications')
    .select('job_id, hiring_request_id')
    .eq('id', applicationId)
    .maybeSingle()

  if (!app) return null
  const row = app as { job_id: string | null; hiring_request_id: string | null }

  // Canonical candidacy: read title from `jobs` (no company/recruiter columns).
  if (row.job_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: job } = await (supabase as any)
      .from('jobs')
      .select('title')
      .eq('id', row.job_id)
      .maybeSingle()
    if (!job) return null
    return {
      position_title: (job as { title: string }).title,
      autopilot_company_name: null,
      autopilot_recruiter_name: null,
    }
  }

  // Legacy candidacy: fall back to the legacy hiring_requests token fields.
  if (row.hiring_request_id) {
    const legacy = await getLegacyJobTokens(supabase, row.hiring_request_id)
    if (!legacy) return null
    return {
      position_title: legacy.position_title ?? null,
      autopilot_company_name: legacy.autopilot_company_name ?? null,
      autopilot_recruiter_name: legacy.autopilot_recruiter_name ?? null,
    }
  }

  return null
}
