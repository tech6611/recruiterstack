import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

// GET /api/debug-scores?job_id=xxx
// Directly inspects what is actually in the DB vs what the API layer returns
export async function GET(req: NextRequest) {
  const supabase = createAdminClient()
  const jobId = req.nextUrl.searchParams.get('job_id')

  // 1. Explicit column select (bypasses wildcard expansion issues)
  const explicit = await supabase
    .from('applications')
    .select('id, hiring_request_id, status, ai_score, ai_recommendation, ai_scored_at')
    .eq('hiring_request_id', jobId ?? '')
    .limit(10)

  // 2. Wildcard select — what does * actually return?
  const wildcard = await supabase
    .from('applications')
    .select('*')
    .eq('hiring_request_id', jobId ?? '')
    .limit(3)

  // 3. Check which keys are present on the first row
  const firstRow = wildcard.data?.[0] ?? null
  const presentKeys = firstRow ? Object.keys(firstRow).filter(k => k.startsWith('ai_')) : []

  return NextResponse.json({
    explicit_rows: explicit.data,
    explicit_error: explicit.error,
    wildcard_ai_keys_present: presentKeys,
    wildcard_sample: wildcard.data?.map(a => ({
      id:                a.id,
      ai_score:          (a as Record<string, unknown>).ai_score,
      ai_recommendation: (a as Record<string, unknown>).ai_recommendation,
      ai_scored_at:      (a as Record<string, unknown>).ai_scored_at,
    })),
    wildcard_error: wildcard.error,
  })
}
