import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import {
  getPoolAccess, startPoolTrial, searchPool, getPoolFacets,
} from '@/modules/pool/domain/pool'

// GET /api/pool?q=&city=&skill=&minExp=&minTenure=&reachable=1&source=&limit=&offset=
// Returns { hasAccess } plus, when granted, the rows + facets.
export const GET = withCapability('recruiting:view', async (req, orgId, supabase) => {
  const { searchParams } = new URL(req.url)

  const access = await getPoolAccess(supabase, orgId)
  if (!access.hasAccess) return NextResponse.json({ access, rows: [], total: 0, facets: null })

  const [{ rows, total }, facets] = await Promise.all([
    searchPool(supabase, orgId, {
      q: searchParams.get('q') ?? undefined,
      city: searchParams.get('city') ?? undefined,
      skill: searchParams.get('skill') ?? undefined,
      source: searchParams.get('source') ?? undefined,
      reachableOnly: searchParams.get('reachable') === '1',
      minExperienceMonths: Number(searchParams.get('minExp')) || undefined,
      minTenureMonths: Number(searchParams.get('minTenure')) || undefined,
      limit: Number(searchParams.get('limit')) || 25,
      offset: Number(searchParams.get('offset')) || 0,
    }),
    getPoolFacets(supabase),
  ])

  return NextResponse.json({ access, rows, total, facets })
})

// POST /api/pool  → start a self-serve trial subscription for this org.
export const POST = withCapability('recruiting:edit', async (_req, orgId, supabase) => {
  const access = await startPoolTrial(supabase, orgId)
  return NextResponse.json({ access })
})
