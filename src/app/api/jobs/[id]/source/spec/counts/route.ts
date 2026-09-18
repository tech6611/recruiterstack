import { NextResponse } from 'next/server'
import { withCapability, parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { z } from 'zod'
import { searchSpecSchema } from '@/lib/validations/search-spec'
import { compileSpec } from '@/modules/pool/vendors/crustdata/compile-spec'
import { searchPeople, crustdataConfigured } from '@/modules/pool/vendors/crustdata/client'
import type { SearchSpec } from '@/lib/types/search-spec'

export const maxDuration = 60

/**
 * POST — the market map: how many people each level of the ladder would reach on the
 * market source, BEFORE acquiring anyone. One single-result probe per level; an empty
 * level costs nothing, a non-empty one a few hundredths of a credit. The spec in the
 * body is used as-is (unsaved edits included), so the recruiter can see the effect of
 * a chip before saving. Vendor name never leaves the server.
 */
export const POST = withCapability('recruiting:edit', async (req) => {
  const body = await parseBody(req, z.object({ spec: searchSpecSchema }))
  if (body instanceof NextResponse) return body
  if (!crustdataConfigured()) return NextResponse.json({ error: 'The market source is not configured.' }, { status: 503 })
  try {
    const compiled = compileSpec(body.spec as SearchSpec)
    let credits = 0
    const counts = await Promise.all(
      compiled.lanes.map(async (lane) => {
        try {
          const r = await searchPeople(lane.filters, { limit: 1 })
          credits += r.creditsUsed
          return { key: lane.key, label: lane.label, total: r.totalCount, error: null as string | null }
        } catch (e) {
          return { key: lane.key, label: lane.label, total: null, error: e instanceof Error ? e.message : String(e) }
        }
      }),
    )
    return NextResponse.json({ data: { counts, creditsUsed: credits, unsupported: compiled.unsupported } })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})
