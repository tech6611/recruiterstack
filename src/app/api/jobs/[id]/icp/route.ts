import { NextResponse } from 'next/server'
import { withCapability, parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { icpDraftInputSchema } from '@/lib/validations/icp'
import { getCurrentIcp, getLatestIcp, createIcpDraft } from '@/modules/ats/domain/icp'
import type { Icp, IcpDraftInput, IcpMustHave } from '@/lib/types/icp'
import { isCriterion } from '@/lib/icp-gates'
import { idealProfileFromBrief } from '@/lib/ai/gate-evaluator'
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
    return NextResponse.json({ data: icp, profile_from_brief: latest ? await profileFromBrief(supabase, orgId, params.id, icp) : null })
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
async function profileFromBrief(
  supabase: Parameters<typeof getJobRoleContext>[0], orgId: string, jobId: string, icp: Icp | null,
): Promise<IcpMustHave[] | null> {
  const brief = icp?.sourcing_map?.recruiter_brief
  if (!brief || (icp?.must_haves ?? []).some((g) => isCriterion(g))) return null
  const market = await getJobRoleContext(supabase, orgId, jobId).then((c) => c.market).catch(() => null)
  const rows = idealProfileFromBrief(brief, market)
  return rows.length ? rows : null
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
