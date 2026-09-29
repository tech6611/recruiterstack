import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withCapability, parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { findBetSample } from '@/modules/pool/domain/bet-sample'
import type { SearchCriterion } from '@/lib/types/search-spec'
import { betBodySchema } from '../schema'

const bodySchema = betBodySchema.extend({ skip: z.array(z.string().uuid()).max(500).default([]) })

/** POST — the best Candidate Pool person for one bet (free: stored data only, no AI). */
export const POST = withCapability('recruiting:view', async (req, orgId, supabase, { params }) => {
  const body = await parseBody(req, bodySchema)
  if (body instanceof NextResponse) return body
  try {
    const result = await findBetSample(supabase, orgId, params.id, body.bet, body.criteria as SearchCriterion[], body.skip)
    return NextResponse.json({ data: result })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})
