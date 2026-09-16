import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getViewerScope, assertCapability } from '@/lib/rbac'
import { unarchiveEntity } from '@/lib/openings/seats'

/** POST /api/openings/:id/unarchive — restore an archived requisition to its prior status. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const supabase = createAdminClient()
  const denied = assertCapability(await getViewerScope(supabase, auth.orgId, auth.userId), 'openings:edit')
  if (denied) return denied
  const r = await unarchiveEntity(supabase, auth.orgId, 'openings', params.id, auth.userId)
  if (!r.ok) return NextResponse.json({ error: 'Requisition not found or could not be restored' }, { status: 404 })
  return NextResponse.json({ ok: true, status: r.status })
}
