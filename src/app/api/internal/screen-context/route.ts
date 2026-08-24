/**
 * POST /api/internal/screen-context — machine-to-machine "phone-screen briefing".
 *
 * Assembles everything an AI phone-screen agent needs to conduct a targeted call:
 * the job's ICP competencies (approved / draft / generated on the fly), the real
 * salary band, a plain-text JD, and — when a candidate/application is named — the
 * candidate's CV claims + any prior per-competency assessment, folded into a
 * per-competency "what to probe" list.
 *
 * Auth is a shared secret (x-internal-secret === INTERNAL_API_SECRET), NOT Clerk —
 * there is no user session. All DB access therefore uses the SERVICE-ROLE admin
 * client (createAdminClient), which bypasses RLS.
 */

import { NextResponse } from 'next/server'
import { z, ZodError } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'
import { handleSupabaseError } from '@/lib/api/helpers'
import { getCurrentIcp, createIcpDraft } from '@/modules/ats/domain/icp'
import { getCanonicalJobScoringContext } from '@/modules/ats/domain/job-pipelines'
import { generateIcpWithReasoning } from '@/lib/ai/icp-generator'
import { logger } from '@/lib/logger'
import type { Icp, IcpCompetency } from '@/lib/types/icp'

// One deep reasoning-first Gemini pass may run when a job has no ICP yet.
export const maxDuration = 120

// Canonical / ICP tables (icps, jobs, openings, job_openings, compensation_bands,
// candidate_experiences, sourcing_matches, …) aren't in the generated Supabase
// types yet — use a loose handle, the same approach as the domain facades.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

const bodySchema = z.object({
  org_id: z.string().min(1),
  job_id: z.string().min(1),
  candidate_id: z.string().optional(),
  application_id: z.string().optional(),
})

const LOW_RATING = 2 // ratings are on a 1–4 scale; <=2 → weak, worth probing

// ── small pure helpers ────────────────────────────────────────────────────────

/** Strip HTML, decode a few common entities, collapse whitespace, cap length. */
function toPlainText(html: string | null | undefined, cap = 4000): string {
  if (!html) return ''
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, cap)
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function fmtMonth(d: string | null | undefined): string | null {
  if (!d) return null
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return String(d)
  return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
}

function dateRange(start: string | null, end: string | null, isCurrent: boolean): string {
  if (!start && !end && !isCurrent) return ''
  const s = fmtMonth(start) ?? '?'
  const e = isCurrent ? 'Present' : (fmtMonth(end) ?? '?')
  return `${s} – ${e}`
}

/** Loose keyword overlap between a screen-later requirement and a competency name. */
function relatesTo(requirement: string, competencyName: string): boolean {
  const words = competencyName.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3)
  const hay = requirement.toLowerCase()
  return words.some((w) => hay.includes(w))
}

type KnownAssessment = { competency: string; rating: number | null; evidence: string }

/** Build per-competency probe hints + priority flags from behaviours, the ICP's
 *  screen_later requirements, and any prior candidate assessment. PURE. */
function buildCompetencies(
  icp: Icp,
  known: KnownAssessment[],
): {
  id: string
  name: string
  weight: number
  behaviours: string[]
  anchors: IcpCompetency['anchors'] | null
  verbatim: string | null
  priorityProbe: boolean
  whatToProbe: string
}[] {
  const ratingByName = new Map(
    known.map((k) => [k.competency.trim().toLowerCase(), k.rating]),
  )
  const screenLater = (icp.sourcing_map?.requirement_decomposition ?? [])
    .filter((d) => d.bucket === 'screen_later')
    .map((d) => d.requirement)
    .filter(Boolean)

  return (icp.competencies ?? []).map((c) => {
    const behaviours = (c.behaviours ?? []).filter(Boolean)
    const hints = behaviours.slice(0, 3)
    const related = screenLater.filter((r) => relatesTo(r, c.name))
    const parts = [...hints, ...related]
    const whatToProbe = parts.length
      ? parts.join('; ').slice(0, 500)
      : `Probe ${c.name} with concrete, evidence-seeking examples.`

    // Low prior rating, or nothing known/verified → prioritise this competency.
    const prior = ratingByName.get(c.name.trim().toLowerCase())
    const priorityProbe = prior == null || prior <= LOW_RATING

    return {
      id: c.id,
      name: c.name,
      weight: c.weight,
      behaviours,
      anchors: c.anchors ?? null,
      verbatim: c.verbatim ?? null,
      priorityProbe,
      whatToProbe,
    }
  })
}

// ── route ─────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  // 1) shared-secret auth (no Clerk — this is server-to-server)
  const secret = req.headers.get('x-internal-secret')
  if (!process.env.INTERNAL_API_SECRET || secret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await req.json())
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid request body', details: err.issues }, { status: 400 })
    }
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { org_id, job_id, candidate_id, application_id } = body
  const serviceSb = createAdminClient()
  const sb = serviceSb as unknown as LooseSb

  try {
    // 2) JOB — canonical `jobs` first; fall back to a legacy hiring_request.
    let jobTitle = ''
    let department: string | null = null
    let jdSource = ''
    let employmentType: string | null = null
    let location: string | null = null
    let salary: { min: number | null; max: number | null; currency: string } | null = null
    let isCanonical = false

    const jobRes = await sb
      .from('jobs')
      .select('id, title, description, department:departments(name)')
      .eq('id', job_id)
      .eq('org_id', org_id)
      .maybeSingle()
    if (jobRes.error) throw jobRes.error

    if (jobRes.data) {
      isCanonical = true
      jobTitle = jobRes.data.title ?? ''
      department = jobRes.data.department?.name ?? null
      jdSource = jobRes.data.description ?? ''

      // Comp/location live on the linked opening, not the job.
      const linkRes = await sb
        .from('job_openings')
        .select('opening_id')
        .eq('job_id', job_id)
        .limit(1)
        .maybeSingle()
      if (linkRes.error) throw linkRes.error

      if (linkRes.data?.opening_id) {
        const opRes = await sb
          .from('openings')
          .select('comp_min, comp_max, comp_currency, comp_band_id, employment_type, location_id')
          .eq('id', linkRes.data.opening_id)
          .eq('org_id', org_id)
          .maybeSingle()
        if (opRes.error) throw opRes.error

        const op = opRes.data
        if (op) {
          employmentType = op.employment_type ?? null
          let min = numOrNull(op.comp_min)
          let max = numOrNull(op.comp_max)
          let currency: string = op.comp_currency ?? 'USD'

          // Fall back to the compensation band when the opening has no explicit comp.
          if ((min == null || max == null) && op.comp_band_id) {
            const bandRes = await sb
              .from('compensation_bands')
              .select('min_salary, max_salary, currency')
              .eq('id', op.comp_band_id)
              .eq('org_id', org_id)
              .maybeSingle()
            if (bandRes.error) throw bandRes.error
            if (bandRes.data) {
              min = min ?? numOrNull(bandRes.data.min_salary)
              max = max ?? numOrNull(bandRes.data.max_salary)
              currency = op.comp_currency ?? bandRes.data.currency ?? 'USD'
            }
          }

          if (op.location_id) {
            const locRes = await sb
              .from('locations')
              .select('name')
              .eq('id', op.location_id)
              .eq('org_id', org_id)
              .maybeSingle()
            if (locRes.error) throw locRes.error
            location = locRes.data?.name ?? null
          }

          if (min != null || max != null) salary = { min, max, currency }
        }
      }
    } else {
      // Legacy hiring_request anchor.
      const hrRes = await sb
        .from('hiring_requests')
        .select('position_title, department, generated_jd, key_requirements, budget_min, budget_max, location')
        .eq('id', job_id)
        .eq('org_id', org_id)
        .maybeSingle()
      if (hrRes.error) throw hrRes.error
      if (!hrRes.data) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 })
      }
      const hr = hrRes.data
      jobTitle = hr.position_title ?? ''
      department = hr.department ?? null
      jdSource = hr.generated_jd || hr.key_requirements || ''
      location = hr.location ?? null
      const min = numOrNull(hr.budget_min)
      const max = numOrNull(hr.budget_max)
      // hiring_requests has no currency column; default to USD (schema default).
      if (min != null || max != null) salary = { min, max, currency: 'USD' }
    }

    const jd = toPlainText(jdSource)

    // 3) ICP — approved/draft, else generate + save a draft (canonical jobs only).
    let icp: Icp | null = null
    let icpStatus: 'approved' | 'draft' | 'generated' | 'none' = 'none'

    try {
      icp = await getCurrentIcp(serviceSb, org_id, job_id)
    } catch (e) {
      logger.warn('screen-context: getCurrentIcp failed', {
        job_id,
        error: e instanceof Error ? e.message : String(e),
      })
      icp = null
    }

    if (icp) {
      icpStatus = icp.status === 'approved' ? 'approved' : 'draft'
    } else if (isCanonical) {
      try {
        const context = await getCanonicalJobScoringContext(serviceSb, org_id, job_id)
        if (context?.job) {
          const { draft, sourcingMap } = await generateIcpWithReasoning(context.job, { orgId: org_id }, null)
          // NOTE: icps.created_by is a `uuid` column, so the literal 'phone-screen'
          // marker can't go there — pass null and let source/derived_from record
          // that this draft was machine-generated.
          const saved = await createIcpDraft(serviceSb, org_id, job_id, draft, { createdBy: null })
          if (sourcingMap) {
            await sb.from('icps').update({ sourcing_map: sourcingMap }).eq('id', saved.id).eq('org_id', org_id)
          }
          icp = { ...saved, sourcing_map: sourcingMap }
          icpStatus = 'generated'
        }
      } catch (e) {
        // Degrade gracefully — a phone screen with no competencies beats a 500.
        logger.warn('screen-context: ICP generation failed', {
          job_id,
          error: e instanceof Error ? e.message : String(e),
        })
        icp = null
        icpStatus = 'none'
      }
    }

    const mustHaves = (icp?.must_haves ?? []).map((m) => ({ label: m.label }))

    // 4) CANDIDATE claims + prior assessment (optional).
    let effectiveCandidateId: string | null = candidate_id ?? null
    const known: KnownAssessment[] = []
    const redFlags: string[] = []
    let candidate: {
      name: string | null
      summary: string | null
      experiences: { title: string | null; employer: string | null; dates: string; summary: string | null }[]
      knownAssessment: KnownAssessment[]
      redFlags: string[]
    } | null = null

    // Prior per-competency assessment: application-scoped wins over the job-wide match.
    if (application_id) {
      const appRes = await sb
        .from('applications')
        .select('candidate_id, ai_criterion_scores, ai_gate_failures, ai_rationale, ai_red_flags')
        .eq('id', application_id)
        .eq('org_id', org_id)
        .maybeSingle()
      if (appRes.error) throw appRes.error
      if (appRes.data) {
        effectiveCandidateId = effectiveCandidateId ?? appRes.data.candidate_id ?? null
        for (const c of (appRes.data.ai_criterion_scores ?? []) as { name: string; rating: number; evidence?: string }[]) {
          known.push({ competency: c.name, rating: numOrNull(c.rating), evidence: c.evidence ?? '' })
        }
        for (const f of (appRes.data.ai_red_flags ?? []) as string[]) redFlags.push(f)
        for (const g of (appRes.data.ai_gate_failures ?? []) as { label?: string }[]) {
          if (g?.label) redFlags.push(`Missing must-have: ${g.label}`)
        }
      }
    } else if (candidate_id) {
      const matchRes = await sb
        .from('sourcing_matches')
        .select('competencies, gate_failures, rationale, red_flags')
        .eq('org_id', org_id)
        .eq('job_id', job_id)
        .eq('candidate_id', candidate_id)
        .maybeSingle()
      if (matchRes.error) throw matchRes.error
      if (matchRes.data) {
        for (const c of (matchRes.data.competencies ?? []) as { name: string; rating: number; evidence?: string }[]) {
          known.push({ competency: c.name, rating: numOrNull(c.rating), evidence: c.evidence ?? '' })
        }
        for (const f of (matchRes.data.red_flags ?? []) as string[]) redFlags.push(f)
        for (const g of (matchRes.data.gate_failures ?? []) as { label?: string }[]) {
          if (g?.label) redFlags.push(`Missing must-have: ${g.label}`)
        }
      }
    }

    if (effectiveCandidateId) {
      const [candRes, sumRes, expRes] = await Promise.all([
        sb
          .from('candidates')
          .select('name, person:people(name)')
          .eq('id', effectiveCandidateId)
          .eq('org_id', org_id)
          .maybeSingle(),
        sb
          .from('candidate_ai_summaries')
          .select('summary, generated_at')
          .eq('candidate_id', effectiveCandidateId)
          .eq('org_id', org_id)
          .order('generated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        sb
          .from('candidate_experiences')
          .select('title, employer, start_date, end_date, is_current, summary, sort_order')
          .eq('candidate_id', effectiveCandidateId)
          .eq('org_id', org_id)
          .order('sort_order', { ascending: true }),
      ])
      if (candRes.error) throw candRes.error
      if (sumRes.error) throw sumRes.error
      if (expRes.error) throw expRes.error

      const name = candRes.data?.person?.name ?? candRes.data?.name ?? null
      const experiences = ((expRes.data ?? []) as {
        title: string | null
        employer: string | null
        start_date: string | null
        end_date: string | null
        is_current: boolean
        summary: string | null
      }[]).map((e) => ({
        title: e.title ?? null,
        employer: e.employer ?? null,
        dates: dateRange(e.start_date, e.end_date, !!e.is_current),
        summary: e.summary ?? null,
      }))

      candidate = {
        name,
        summary: sumRes.data?.summary ?? null,
        experiences,
        knownAssessment: known,
        redFlags: Array.from(new Set(redFlags)),
      }
    }

    // 5) Competencies with probe hints (needs `known` for priority flags).
    const competencies = icp ? buildCompetencies(icp, known) : []

    return NextResponse.json({
      data: {
        jobTitle,
        department,
        employmentType,
        location,
        salary,
        jd,
        icpStatus,
        competencies,
        mustHaves,
        candidate,
      },
    })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
}
