import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withApiKey } from '@/lib/api/api-keys'
import { getCurrentIcp } from '@/modules/ats/domain/icp'
import { scoreAgainstIcp } from '@/lib/ai/fit-engine'
import { buildFitCandidate, buildProfileText } from '@/lib/ai/ext-profile'
import type { Candidate } from '@/lib/types/database'

export const maxDuration = 60 // one Fit-Engine (Gemini) call

// The extension sends the profile the recruiter is viewing + the job to judge it against.
const scoreSchema = z.object({
  job_id: z.string().uuid('Invalid job id'),
  name: z.string().min(1, 'Name is required'),
  headline: z.string().max(400).nullish(),
  location: z.string().max(200).nullish(),
  about: z.string().max(8000).nullish(),
  experience: z.array(z.string().max(400)).max(30).nullish(),
  skills: z.array(z.string().max(120)).max(60).nullish(),
})

// POST /api/ext/score — score a viewed LinkedIn profile against a job's approved
// ICP with the Fit Engine. Read-only (scores nothing to the DB). API-key auth.
export const POST = withApiKey(async (req, orgId, supabase) => {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = scoreSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Validation failed',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
      { status: 400 },
    )
  }
  const p = parsed.data

  // Only an APPROVED ICP is scoreable (same rule as in-app sourcing).
  const icp = await getCurrentIcp(supabase, orgId, p.job_id).catch(() => null)
  if (!icp || icp.status !== 'approved') {
    return NextResponse.json(
      { error: 'This job has no approved ICP yet, so it can’t score profiles.' },
      { status: 400 },
    )
  }

  const candidate = buildFitCandidate(p) as unknown as Candidate
  const profileText = buildProfileText(p)

  try {
    const fit = await scoreAgainstIcp(candidate, icp, { orgId }, profileText)
    return NextResponse.json({
      data: {
        score: fit.score,
        fit_bucket: fit.fit_bucket,
        recommendation: fit.recommendation,
        passed_gates: fit.passed_gates,
        rationale: fit.rationale,
        red_flags: fit.red_flags,
        gate_failures: fit.gate_failures.map((g) => g.label),
        competencies: fit.competencies.map((c) => ({
          name: c.name,
          rating: c.rating,
          weight: c.weight,
          evidence: c.evidence,
        })),
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Scoring failed' },
      { status: 502 },
    )
  }
})
