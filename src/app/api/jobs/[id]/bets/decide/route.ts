import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withCapability, parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { decideBetSample } from '@/modules/pool/domain/bet-sample'
import type { BetCheck } from '@/modules/pool/domain/bet-sample-fit'
import type { SearchCriterion } from '@/lib/types/search-spec'
import { betBodySchema } from '../schema'

const bodySchema = betBodySchema.extend({
  bet_label: z.string().max(200).nullish(),
  profile_id: z.string().uuid(),
  decision: z.enum(['yes', 'no']),
  icp_id: z.string().uuid().nullish(),
  checks: z.array(z.object({
    id: z.string().max(80), kind: z.string().max(40), label: z.string().max(300),
    result: z.enum(['pass', 'fail', 'unknown']), note: z.string().max(300).nullable(),
  })).max(40).default([]),
})

/** POST — 👍 / 👎 on a bet's sample person. Saved with the bet's lines and the person as they were. */
export const POST = withCapability('recruiting:edit', async (req, orgId, supabase, { params }, _scope, userId) => {
  const body = await parseBody(req, bodySchema)
  if (body instanceof NextResponse) return body
  try {
    await decideBetSample(supabase, orgId, {
      jobId: params.id,
      bet: body.bet,
      betLabel: body.bet_label ?? null,
      profileId: body.profile_id,
      decision: body.decision,
      criteria: body.criteria as SearchCriterion[],
      checks: body.checks as BetCheck[],
      icpId: body.icp_id ?? null,
      decidedBy: userId ?? null,
    })
    return NextResponse.json({ data: { ok: true } })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})
