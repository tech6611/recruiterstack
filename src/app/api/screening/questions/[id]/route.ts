import { NextResponse } from 'next/server'
import { withCapability, parseBody } from '@/lib/api/helpers'
import { screeningQuestionInputSchema } from '@/lib/validations/screening'
import { updateScreeningQuestion } from '@/modules/ats/domain/screening'

// PATCH /api/screening/questions/[id] — edit or archive a library question.
export const PATCH = withCapability('recruiting:edit', async (req, orgId, supabase, { params }) => {
  const input = await parseBody(req, screeningQuestionInputSchema)
  if (input instanceof NextResponse) return input

  const question = await updateScreeningQuestion(supabase, orgId, params.id, input)
  if (!question) return NextResponse.json({ error: 'Question not found' }, { status: 404 })

  return NextResponse.json({ data: question })
})
