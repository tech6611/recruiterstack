import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getViewerScope, assertCapability } from '@/lib/rbac'
import { loadGatedFields } from '@/lib/openings/change-requests'
import { mapsToChanges, openingFieldLabel } from '@/lib/openings/reapproval'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any

/**
 * GET /api/openings/:id/changes — everything the detail page needs to show
 * "what may change freely, what needs re-approval, what's pending, and what
 * changed before": gated field set, change requests (pending first), versions.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const { orgId, userId } = auth
  const supabase = createAdminClient()
  const denied = assertCapability(await getViewerScope(supabase, orgId, userId), 'openings:view')
  if (denied) return denied
  const sb = supabase as unknown as Loose

  const [{ data: opening }, gated, { data: crs }, { data: versions }, { data: defs }] = await Promise.all([
    sb.from('openings').select('id').eq('id', params.id).eq('org_id', orgId).maybeSingle(),
    loadGatedFields(supabase, orgId),
    sb.from('opening_change_requests').select('*').eq('org_id', orgId).eq('opening_id', params.id).order('created_at', { ascending: false }).limit(50),
    sb.from('opening_versions').select('id, version_no, reason, changed_fields, change_request_id, created_by, created_at').eq('org_id', orgId).eq('opening_id', params.id).order('version_no', { ascending: false }).limit(100),
    sb.from('custom_field_definitions').select('field_key, label').eq('org_id', orgId).eq('object_type', 'opening'),
  ])
  if (!opening) return NextResponse.json({ error: 'Opening not found' }, { status: 404 })

  const customLabels = Object.fromEntries(((defs ?? []) as Array<{ field_key: string; label: string }>).map(d => [d.field_key, d.label]))
  const changeRequests = ((crs ?? []) as Array<Record<string, unknown> & { status: string }>).map(cr => ({
    ...cr,
    diff: mapsToChanges(cr.previous as Record<string, unknown>, cr.proposed as Record<string, unknown>)
      .map(c => ({ ...c, label: openingFieldLabel(c.field, customLabels) })),
  }))

  return NextResponse.json({
    data: {
      gated_fields: Array.from(gated),
      pending_change: changeRequests.find(c => c.status === 'pending') ?? null,
      change_requests: changeRequests,
      versions: versions ?? [],
    },
  })
}
