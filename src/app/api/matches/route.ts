import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withOrg, parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { uuidSchema } from '@/lib/validations/common'
import { matchCandidateToRole } from '@/lib/ai/matcher'
import { createAdminClient } from '@/lib/supabase/server'
import { runInBackground } from '@/lib/api/background'
import { enqueue } from '@/lib/api/job-queue'
import type { Candidate, Role, Match } from '@/lib/types/database'
import { logger } from '@/lib/logger'

const matchBodySchema = z.object({
  role_id: uuidSchema,
})

// POST /api/matches  { role_id }
// Kicks off AI matching in the background and returns 202 immediately.
// Poll GET /api/matches?role_id=xxx to see results as they arrive.
export const POST = withOrg(async (_req, orgId, supabase) => {
  const body = await parseBody(_req, matchBodySchema)
  if (body instanceof NextResponse) return body

  // Verify role exists before starting background work
  const { data: role, error: roleError } = await supabase
    .from('roles')
    .select('id')
    .eq('id', body.role_id)
    .eq('org_id', orgId)
    .single()

  if (roleError || !role) {
    return NextResponse.json({ error: 'Role not found' }, { status: 404 })
  }

  const roleId = body.role_id

  // Prefer job queue (persistent, retryable); fall back to runInBackground
  try {
    await enqueue({
      orgId,
      jobType: 'matching',
      payload: { roleId },
    })
  } catch {
    logger.warn('Queue unavailable, falling back to runInBackground', { roleId })
    runInBackground(async () => {
      await runMatchingJob(roleId, orgId)
    })
  }

  return NextResponse.json(
    { data: { status: 'processing', role_id: roleId } },
    { status: 202 },
  )
})

/** Background: score all candidates against a role, upsert results, apply auto-decisions */
async function runMatchingJob(roleId: string, orgId: string) {
  const supabase = createAdminClient()

  const [roleRes, candsRes] = await Promise.all([
    supabase.from('roles').select('*').eq('id', roleId).eq('org_id', orgId).single(),
    supabase.from('candidates').select('*').eq('org_id', orgId),
  ])

  if (roleRes.error || !roleRes.data) {
    logger.error('Matching job: role not found', undefined, { roleId })
    return
  }
  if (candsRes.error) {
    logger.error('Matching job: candidates query failed', candsRes.error, { roleId })
    return
  }

  const role = roleRes.data as Role
  const candidates = (candsRes.data ?? []) as Candidate[]

  const results = await Promise.allSettled(
    candidates.map(async (candidate) => {
      const match = await matchCandidateToRole(candidate, role)

      const { data, error } = await supabase
        .from('matches')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert(
          {
            candidate_id: candidate.id,
            role_id: roleId,
            score: match.score,
            strengths: match.strengths,
            gaps: match.gaps,
            reasoning: match.reasoning,
            recommendation: match.recommendation,
          },
          { onConflict: 'candidate_id,role_id' },
        )
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data
    }),
  )

  const succeeded = results
    .filter((r) => r.status === 'fulfilled')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((r) => (r as PromiseFulfilledResult<Match>).value)

  const failed = results.filter((r) => r.status === 'rejected').length

  // Apply auto-decision thresholds
  const toAdvance: string[] = []
  const toReject: string[] = []

  if (role.auto_advance_threshold || role.auto_reject_threshold) {
    for (const match of succeeded) {
      if (role.auto_advance_threshold && match.score >= role.auto_advance_threshold) {
        toAdvance.push(match.candidate_id)
      } else if (role.auto_reject_threshold && match.score <= role.auto_reject_threshold) {
        toReject.push(match.candidate_id)
      }
    }

    await Promise.all([
      ...toAdvance.map((id) =>
        supabase.from('candidates').update({ status: 'interviewing' }).eq('id', id).eq('org_id', orgId),
      ),
      ...toReject.map((id) =>
        supabase.from('candidates').update({ status: 'rejected' }).eq('id', id).eq('org_id', orgId),
      ),
    ])
  }

  logger.info('Matching job complete', {
    roleId, matched: succeeded.length, failed, advanced: toAdvance.length, rejected: toReject.length,
  })
}

// GET /api/matches?role_id=xxx  OR  ?candidate_id=xxx
export const GET = withOrg(async (req, orgId, supabase) => {
  const { searchParams } = new URL(req.url)

  const role_id = searchParams.get('role_id')
  const candidate_id = searchParams.get('candidate_id')

  if (!role_id && !candidate_id) {
    return NextResponse.json(
      { error: 'Provide role_id or candidate_id' },
      { status: 400 },
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from('matches')
    .select('*, candidates(*), roles(*)')
    .order('score', { ascending: false })

  // Scope to org via joined tables
  if (role_id) query = query.eq('role_id', role_id)
  if (candidate_id) query = query.eq('candidate_id', candidate_id)

  // Filter to only matches where the role belongs to this org
  query = query.eq('roles.org_id', orgId)

  const { data, error } = await query

  if (error) return handleSupabaseError(error)

  return NextResponse.json({ data })
})
