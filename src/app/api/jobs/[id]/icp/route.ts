import { NextResponse } from 'next/server'
import { withCapability, parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { icpDraftInputSchema } from '@/lib/validations/icp'
import { getCurrentIcp, getLatestIcp, createIcpDraft } from '@/modules/ats/domain/icp'
import type { Icp, IcpDraftInput, IcpMustHave } from '@/lib/types/icp'
import { isCriterion } from '@/lib/icp-gates'
import { idealProfileFromBrief, supersedeLegacyGates } from '@/lib/ai/gate-evaluator'
import { getJobRoleContext } from '@/modules/ats/domain/job-role-context'

/** GET — the ICP for this job. Default = the live/approved one (else newest draft).
 *  `?latest=1` = the newest version regardless of status, for the editor (so a
 *  freshly-(re)generated draft + its reasoning survives a refresh). */
export const GET = withCapability('recruiting:view', async (req, orgId, supabase, { params }) => {
  try {
    const latest = new URL(req.url).searchParams.get('latest') === '1'
    const icp = latest
      ? await getLatestIcp(supabase, orgId, params.id)
      : await getCurrentIcp(supabase, orgId, params.id)
    if (!latest) return NextResponse.json({ data: icp })
    const market = await getJobRoleContext(supabase, orgId, params.id).then((c) => c.market).catch(() => null)
    const fromBrief = profileFromBrief(icp, market)
    return NextResponse.json({ data: icp, profile_from_brief: fromBrief, legacy_covered: legacyCovered(icp, fromBrief, market) })
  } catch (e) {
    return handleSupabaseError(e as { code: string; message: string })
  }
})

/**
 * The ideal profile the recruiter brief implies, for an ICP that has a brief but no
 * profile — one written before the brief was turned into filters. Without it, every
 * field reads "not set" beside a brief that names the band, the companies and the
 * titles. Offered to the editor, not saved: the recruiter fills it in and approves.
 * Deterministic — no AI call. Null when there is nothing to offer.
 */
type Market = Awaited<ReturnType<typeof getJobRoleContext>>['market']

function profileFromBrief(icp: Icp | null, market: Market): IcpMustHave[] | null {
  const brief = icp?.sourcing_map?.recruiter_brief
  if (!brief || (icp?.must_haves ?? []).some((g) => isCriterion(g))) return null
  const rows = idealProfileFromBrief(brief, market)
  return rows.length ? rows : null
}

/**
 * The old text questions that the ideal profile covers — the one on screen, or the one
 * "Fill from recruiter brief" is about to add. They no longer filter anyone (see
 * supersedeLegacyGates); the editor marks them and offers to delete them.
 */
function legacyCovered(icp: Icp | null, fromBrief: IcpMustHave[] | null, market: Market): string[] {
  if (!icp) return []
  const gates = [...(fromBrief ?? []), ...(icp.must_haves ?? [])]
  return supersedeLegacyGates(gates, { market, titleFamilies: icp.sourcing_map?.recruiter_brief?.title_families ?? null }).covered
}

/** POST — create a new draft ICP for this job (manual authoring; AI seeding
 *  arrives in Slice 1b). */
export const POST = withCapability(
  'recruiting:edit',
  async (req, orgId, supabase, { params }, _scope, userId) => {
    const body = await parseBody(req, icpDraftInputSchema)
    if (body instanceof NextResponse) return body
    try {
      const icp = await createIcpDraft(supabase, orgId, params.id, body as IcpDraftInput, {
        createdBy: userId,
      })
      return NextResponse.json({ data: icp }, { status: 201 })
    } catch (e) {
      return handleSupabaseError(e as { code: string; message: string })
    }
  },
)
