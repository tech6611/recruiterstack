import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withCapability, parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { getLatestIcp } from '@/modules/ats/domain/icp'
import { suggestBetTitles } from '@/lib/ai/bet-titles'
import { observedTitlesAt } from '@/modules/pool/domain/bet-sample'
import { sortedPools, searchPassFor } from '@/lib/bets'
import type { SearchCriterion } from '@/lib/types/search-spec'
import { betBodySchema } from '../schema'

export const maxDuration = 60 // one Gemini Flash call

const bodySchema = betBodySchema.extend({ bet_label: z.string().max(200) })

/**
 * POST — the recruiter brain's titles and exclusions for one bet: from the job, the bet's
 * card and companies, and the titles real people at those companies hold in the
 * Candidate Pool. One small AI call; nothing is saved — the recruiter picks what to keep.
 */
export const POST = withCapability('recruiting:edit', async (req, orgId, supabase, { params }, _scope, userId) => {
  const body = await parseBody(req, bodySchema)
  if (body instanceof NextResponse) return body
  try {
    const criteria = body.criteria as SearchCriterion[]
    const companies = criteria.find((c) => c.kind.startsWith('employer_') && !c.exclude)?.values ?? []
    if (!companies.length) return NextResponse.json({ error: 'Add companies to this bet first.' }, { status: 400 })
    const titles = criteria.find((c) => c.kind.startsWith('title_') && !c.exclude)?.values ?? []
    const exclusions = criteria.find((c) => c.kind.startsWith('title_') && c.exclude)?.values ?? []

    const [{ data: job }, icp, observed] = await Promise.all([
      supabase.from('jobs').select('title, description').eq('id', params.id).eq('org_id', orgId).maybeSingle(),
      getLatestIcp(supabase, orgId, params.id).catch(() => null),
      observedTitlesAt(supabase, companies),
    ])
    const brief = icp?.sourcing_map?.recruiter_brief ?? null
    const card = (icp?.sourcing_map?.archetypes ?? []).find((a) => a.name === body.bet_label || searchPassFor(a, brief)?.pass === body.bet)
    const pool = sortedPools(brief)[body.bet - 1]
    const out = await suggestBetTitles({
      role: { title: (job as { title?: string } | null)?.title ?? 'this role', description: (job as { description?: string | null } | null)?.description ?? null, niche: brief?.niche ?? null },
      bet: { label: body.bet_label, thesis: card?.thesis, where_from: card?.where_from, companies, titles, exclusions, line_of_work: pool?.line_of_work ?? null },
      observed,
    }, { orgId, userId })
    return NextResponse.json({ data: { ...out, observed: observed.length } })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})
