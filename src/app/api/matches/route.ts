import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { matchCandidateToRole } from '@/lib/ai/matcher'
import type { Candidate, Role } from '@/lib/types/database'

// POST /api/matches  { role_id }
// Runs AI scoring for all candidates against a role, upserts results
export async function POST(request: NextRequest) {
  const supabase = createAdminClient()

  let body: { role_id: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.role_id) {
    return NextResponse.json({ error: 'role_id is required' }, { status: 400 })
  }

  const { data: role, error: roleError } = await supabase
    .from('roles')
    .select('*')
    .eq('id', body.role_id)
    .single()

  if (roleError || !role) {
    return NextResponse.json({ error: 'Role not found' }, { status: 404 })
  }

  const { data: candidates, error: candError } = await supabase
    .from('candidates')
    .select('*')

  if (candError) {
    return NextResponse.json({ error: candError.message }, { status: 500 })
  }

  // Run all matches in parallel
  const results = await Promise.allSettled(
    (candidates as Candidate[]).map(async (candidate) => {
      const match = await matchCandidateToRole(candidate, role as Role)

      const { data, error } = await supabase
        .from('matches')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert(
          {
            candidate_id: candidate.id,
            role_id: body.role_id,
            score: match.score,
            strengths: match.strengths,
            gaps: match.gaps,
            reasoning: match.reasoning,
            recommendation: match.recommendation,
          } as any,
          { onConflict: 'candidate_id,role_id' },
        )
        .select()
        .single()

      if (error) throw error
      return data
    }),
  )

  const succeeded = results
    .filter((r) => r.status === 'fulfilled')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((r) => (r as PromiseFulfilledResult<any>).value)

  const failed = results.filter((r) => r.status === 'rejected').length

  return NextResponse.json({ data: succeeded, count: succeeded.length, failed })
}

// GET /api/matches?role_id=xxx  OR  ?candidate_id=xxx
export async function GET(request: NextRequest) {
  const supabase = createAdminClient()
  const { searchParams } = new URL(request.url)

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

  if (role_id) query = query.eq('role_id', role_id)
  if (candidate_id) query = query.eq('candidate_id', candidate_id)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}
