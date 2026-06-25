import { NextResponse } from 'next/server'
import { withCapability, parseBody } from '@/lib/api/helpers'
import { screeningQuestionInputSchema } from '@/lib/validations/screening'
import { listScreeningQuestions, createScreeningQuestion } from '@/modules/ats/domain/screening'

// GET /api/screening/questions — the org's reusable question library.
export const GET = withCapability('recruiting:view', async (req, orgId, supabase) => {
  const includeArchived = new URL(req.url).searchParams.get('includeArchived') === '1'
  const questions = await listScreeningQuestions(supabase, orgId, { includeArchived })
  return NextResponse.json({ data: questions }, { headers: { 'Cache-Control': 'no-store' } })
})

// POST /api/screening/questions — add a reusable question to the library.
export const POST = withCapability('recruiting:edit', async (req, orgId, supabase) => {
  const input = await parseBody(req, screeningQuestionInputSchema)
  if (input instanceof NextResponse) return input

  const question = await createScreeningQuestion(supabase, orgId, input)
  return NextResponse.json({ data: question }, { status: 201 })
})
