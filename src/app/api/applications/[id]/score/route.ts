import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { scoreOneApplication } from '@/lib/ai/score-application'

// POST /api/applications/[id]/score — (re)score this ONE application and persist
// the result, so the AI Assessment card shows a fresh score. When the job has an
// approved ICP it uses the Fit Engine (gates + ICP-anchored judging + evidence),
// matching the bulk /api/jobs/[id]/score path; otherwise the flat-rubric scorer.
// The scoring itself lives in src/lib/ai/score-application.ts (shared with the
// MCP score_candidates_for_job tool).
export const POST = withCapability('recruiting:edit', async (_req, orgId, supabase, { params }, _scope, userId) => {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY is not configured.' }, { status: 503 })
  }

  const result = await scoreOneApplication(supabase, orgId, params.id, userId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  return NextResponse.json({
    data: { score: result.score, recommendation: result.recommendation, ...result.extra },
  })
})
