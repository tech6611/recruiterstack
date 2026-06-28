import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getViewerScope, assertCapability } from '@/lib/rbac'
import { handleSupabaseError } from '@/lib/api/helpers'

/**
 * POST /api/req-jobs/:id/clone — create a new DRAFT version of a job.
 *
 * For when a live/approved role needs materially different terms: rather than
 * rewriting the approved spec in place (which would mismatch the approval and
 * the candidates who already applied), clone it into a fresh draft. The copy
 * carries over the JD + intake content so it's a head start, but starts clean:
 * status 'draft', no approval, no apply link, no linked openings/postings/
 * candidates. The user edits it, re-submits for approval, and it gets its own
 * public link.
 *
 * Returns the new job id so the caller can navigate to it.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const { orgId, userId } = auth

  const supabase = createAdminClient()
  const denied = assertCapability(await getViewerScope(supabase, orgId, userId), 'recruiting:edit')
  if (denied) return denied

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: source } = await (supabase as any)
    .from('jobs')
    .select('title, department_id, description, hiring_team_id, confidentiality, custom_fields')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!source) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: created, error } = await (supabase as any)
    .from('jobs')
    .insert({
      org_id:          orgId,
      title:           `${source.title} (new version)`,
      department_id:   source.department_id,
      description:     source.description,
      hiring_team_id:  source.hiring_team_id,
      confidentiality: source.confidentiality,
      custom_fields:   source.custom_fields ?? {},
      status:          'draft',     // back to the start of the lifecycle
      approval_id:     null,        // fresh approval when re-submitted
      created_by:      userId,
      // apply_token & approved_snapshot deliberately omitted → null (new link
      // only minted when this version is published and re-approved).
    })
    .select('id')
    .single()
  if (error) return handleSupabaseError(error)

  return NextResponse.json({ data: { id: (created as { id: string }).id } }, { status: 201 })
}
