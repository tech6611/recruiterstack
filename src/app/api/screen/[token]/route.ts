import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentIcp } from '@/modules/ats/domain/icp'
import { scoreScreeningAnswers } from '@/lib/ai/screening'
import { getScreeningByToken, completeScreening } from '@/modules/ats/domain/ai-screening'

export const maxDuration = 60 // one Gemini scoring call on submit

// Public: candidates reach this via a private link. The token IS the credential —
// no login. We never expose org data, scores, or the ICP to the candidate.

/** GET — the questions the candidate must answer (or that the screen is done). */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const supabase = createAdminClient()
  const session = await getScreeningByToken(supabase, params.token).catch(() => null)
  if (!session) return NextResponse.json({ error: 'This screening link is invalid.' }, { status: 404 })

  return NextResponse.json({
    data: {
      status: session.status,
      questions: session.status === 'pending'
        ? session.questions.map((q) => ({ id: q.id, text: q.text }))
        : [],
    },
  })
}

const submitSchema = z.object({
  answers: z.array(z.object({ question_id: z.string(), answer: z.string().max(5000) })).min(1),
})

/** POST — the candidate submits answers; we score them against the ICP and store
 *  the result. Returns only a thank-you status (never the score). */
export async function POST(req: Request, { params }: { params: { token: string } }) {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid submission.' }, { status: 400 })
  }
  const parsed = submitSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'Please answer the questions.' }, { status: 400 })

  const supabase = createAdminClient()
  const session = await getScreeningByToken(supabase, params.token).catch(() => null)
  if (!session) return NextResponse.json({ error: 'This screening link is invalid.' }, { status: 404 })
  if (session.status !== 'pending') {
    return NextResponse.json({ error: 'This screen has already been submitted.' }, { status: 409 })
  }

  const icp = session.job_id ? await getCurrentIcp(supabase, session.org_id, session.job_id).catch(() => null) : null
  if (!icp) {
    return NextResponse.json({ error: 'This screen is no longer available.' }, { status: 410 })
  }

  try {
    const result = await scoreScreeningAnswers(icp, session.questions, parsed.data.answers, { orgId: session.org_id })
    await completeScreening(supabase, params.token, parsed.data.answers, result)
    return NextResponse.json({ data: { status: 'completed' } })
  } catch {
    // Store the answers even if scoring fails, so nothing the candidate typed is lost.
    await completeScreening(supabase, params.token, parsed.data.answers, {
      score: 0, fit_bucket: 'okay', recommendation: 'maybe', competencies: [], summary: 'Scoring pending.', red_flags: [],
    }).catch(() => {})
    return NextResponse.json({ data: { status: 'completed' } })
  }
}
