import { NextResponse } from 'next/server'
import { withCapability, parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { marketSearchForBet } from '@/modules/pool/domain/bet-sample'
import { CrustdataConfigError } from '@/modules/pool/vendors/crustdata/client'
import type { SearchCriterion } from '@/lib/types/search-spec'
import { betBodySchema } from '../schema'

export const maxDuration = 60 // one small vendor search + embed

/**
 * POST — SPENDS CREDITS. Pull a few people for one bet from Crustdata into the pool
 * (the recruiter clicked "Find in the market" and confirmed the cost). The caller then
 * asks /bets/sample again, which now finds them.
 */
export const POST = withCapability('recruiting:edit', async (req, orgId, supabase, { params }) => {
  const body = await parseBody(req, betBodySchema)
  if (body instanceof NextResponse) return body
  try {
    const res = await marketSearchForBet(supabase, orgId, params.id, body.criteria as SearchCriterion[])
    return NextResponse.json({ data: res })
  } catch (err) {
    if (err instanceof CrustdataConfigError) return NextResponse.json({ error: 'Crustdata is not configured (missing API key).' }, { status: 503 })
    if (err instanceof Error && /disabled/i.test(err.message)) {
      return NextResponse.json({ error: "Crustdata sourcing isn't enabled for your workspace yet.", code: 'source_disabled' }, { status: 409 })
    }
    if (err instanceof Error && /no companies/i.test(err.message)) return NextResponse.json({ error: err.message }, { status: 400 })
    return handleSupabaseError(err as { code: string; message: string })
  }
})
