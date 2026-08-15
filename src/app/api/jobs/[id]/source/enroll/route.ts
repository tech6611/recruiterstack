import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withCapability, parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { getSourcingMatches } from '@/modules/ats/domain/sourcing'
import { getCanonicalJobScoringContext } from '@/modules/ats/domain/job-pipelines'
import { enrollCandidate } from '@/modules/crm/domain/enroll'
import { draftOutreachIntro } from '@/lib/ai/outreach-draft'

export const maxDuration = 300 // drafts a personalized intro per candidate

const bodySchema = z.object({
  candidate_ids: z.array(z.string().uuid()).min(1).max(50),
  sequence_id: z.string().uuid(),
})

/** POST — enroll sourced candidates into a sequence, personalizing each one's
 *  FIRST message from their Fit-Engine evidence. The sequence sends per its own
 *  schedule/mode; later steps use the shared stage templates. */
export const POST = withCapability('recruiting:edit', async (req, orgId, supabase, { params }, _scope, userId) => {
  const body = await parseBody(req, bodySchema)
  if (body instanceof NextResponse) return body

  try {
    const [matches, context] = await Promise.all([
      getSourcingMatches(supabase, orgId, params.id).catch(() => []),
      getCanonicalJobScoringContext(supabase, orgId, params.id).catch(() => null),
    ])
    const byCand = new Map(matches.map((m) => [m.candidate_id, m]))
    const roleTitle = context?.job?.position_title ?? 'the role'
    const companyName = (context?.job as { autopilot_company_name?: string | null } | undefined)?.autopilot_company_name || 'our company'

    let enrolled = 0
    let skipped = 0
    for (const candidateId of body.candidate_ids) {
      const m = byCand.get(candidateId)
      let intro: { subject: string; body: string } | null = null
      if (m) {
        try {
          intro = await draftOutreachIntro(
            {
              first_name: (m.candidate?.name ?? '').split(' ')[0] || 'there',
              candidate_title: m.candidate?.current_title,
              role_title: roleTitle,
              company_name: companyName,
              recruiter_name: 'The Recruiting Team',
              why_they_fit: m.rationale,
              evidence: (m.competencies ?? []).map((c) => c.evidence).filter((e): e is string => !!e),
            },
            { orgId, userId },
          )
        } catch {
          intro = null // fall back to the stage template
        }
      }
      const res = await enrollCandidate(supabase, {
        orgId,
        sequenceId: body.sequence_id,
        candidateId,
        enrolledBy: userId,
        intro,
      })
      if (res.enrolled) enrolled++
      else skipped++
    }

    return NextResponse.json({ data: { enrolled, skipped } })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})
