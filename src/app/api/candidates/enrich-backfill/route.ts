import { NextResponse } from 'next/server'
import { withCapability, handleSupabaseError } from '@/lib/api/helpers'
import { enrichCandidateById } from '@/modules/ats/domain/candidate-enrichment'

export const maxDuration = 300

// candidates.enriched_at (migration 114) isn't in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseSb = any

/** POST — enrich a batch of candidates that have a résumé but no structured history
 *  yet. Small batch per call (enrichment is a Gemini read per résumé); call
 *  repeatedly until `remaining` is 0. This is the one-time backfill over the pool. */
export const POST = withCapability('recruiting:edit', async (_req, orgId, supabase, _ctx, _scope, userId) => {
  const sb = supabase as unknown as LooseSb
  try {
    const { data: rows, error } = await sb
      .from('candidates')
      .select('id')
      .eq('org_id', orgId)
      .is('enriched_at', null)
      .not('resume_url', 'is', null)
      .limit(10)
    if (error) return handleSupabaseError(error)
    if (!rows || rows.length === 0) return NextResponse.json({ data: { enriched: 0, skipped: 0, remaining: 0 } })

    let enriched = 0
    let skipped = 0
    for (const r of rows as { id: string }[]) {
      const res = await enrichCandidateById(supabase, orgId, r.id, { orgId, userId })
      if (res.status === 'enriched') enriched++
      else skipped++
      // Stamp skipped rows so the batch advances (don't retry unusable résumés forever).
      if (res.status !== 'enriched') {
        await sb.from('candidates').update({ enriched_at: new Date().toISOString() }).eq('id', r.id).eq('org_id', orgId)
      }
    }

    const { count } = await sb
      .from('candidates')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .is('enriched_at', null)
      .not('resume_url', 'is', null)

    return NextResponse.json({ data: { enriched, skipped, remaining: count ?? 0 } })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})
