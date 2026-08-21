import { NextResponse } from 'next/server'
import { withCapability, handleSupabaseError } from '@/lib/api/helpers'
import { getCurrentIcp } from '@/modules/ats/domain/icp'
import { getSourcingMatches, runSourcing } from '@/modules/ats/domain/sourcing'

export const maxDuration = 300 // Fit-Engine scores the shortlist — allow headroom

/** GET — the cached sourcing matches for this job, plus the current ICP version so
 *  the UI can flag rows produced against an older ICP as stale. */
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
  try {
    const [matches, icp] = await Promise.all([
      getSourcingMatches(supabase, orgId, params.id),
      getCurrentIcp(supabase, orgId, params.id).catch(() => null),
    ])
    const approved = icp?.status === 'approved' ? icp : null
    return NextResponse.json({
      data: {
        matches,
        current_icp_version: approved ? approved.version : null,
        has_approved_icp: !!approved,
        // The ICP's ranking parameters — used to build the matrix columns.
        icp: approved
          ? {
              must_haves: approved.must_haves.map((m) => ({ id: m.id, label: m.label, attribute: m.attribute })),
              competencies: approved.competencies.map((c) => ({ id: c.id, name: c.name, weight: c.weight })),
            }
          : null,
      },
    })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})

/** POST — run sourcing: pre-filter the candidate pool by the approved ICP, score
 *  the shortlist with the Fit Engine, and cache the matches. */
export const POST = withCapability(
  'recruiting:edit',
  async (_req, orgId, supabase, { params }, _scope, userId) => {
    try {
      const result = await runSourcing(supabase, orgId, params.id, { orgId, userId })
      if (result.status === 'no_icp') {
        return NextResponse.json(
          { error: 'Approve an ICP for this job before sourcing.' },
          { status: 400 },
        )
      }
      const matches = await getSourcingMatches(supabase, orgId, params.id)
      return NextResponse.json({ data: { ...result, matches } }, { status: 201 })
    } catch (e) {
      return handleSupabaseError(e as { code: string; message: string })
    }
  },
)
