import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { getViewerScope, assertCapability } from '@/lib/rbac'
import { parseBody } from '@/lib/api/helpers'
import { GATEABLE_OPENING_FIELDS, DEFAULT_OPENING_REAPPROVAL_FIELDS, OPENING_FIELD_LABEL } from '@/lib/openings/reapproval'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any

/** GET — which built-in requisition fields need re-approval after approval, plus the choices. */
export async function GET() {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const supabase = createAdminClient()
  const denied = assertCapability(await getViewerScope(supabase, auth.orgId, auth.userId), 'settings:view')
  if (denied) return denied
  const { data } = await (supabase as unknown as Loose).from('org_settings').select('opening_reapproval_fields').eq('org_id', auth.orgId).maybeSingle()
  const fields = Array.isArray(data?.opening_reapproval_fields) ? data.opening_reapproval_fields : DEFAULT_OPENING_REAPPROVAL_FIELDS
  return NextResponse.json({ data: {
    fields,
    options: GATEABLE_OPENING_FIELDS.map(f => ({ key: f, label: OPENING_FIELD_LABEL[f] ?? f })),
    defaults: DEFAULT_OPENING_REAPPROVAL_FIELDS,
  } })
}

const putSchema = z.object({ fields: z.array(z.enum(GATEABLE_OPENING_FIELDS)).max(GATEABLE_OPENING_FIELDS.length) })

/** PUT — replace the gated set. */
export async function PUT(req: NextRequest) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const supabase = createAdminClient()
  const denied = assertCapability(await getViewerScope(supabase, auth.orgId, auth.userId), 'settings:edit')
  if (denied) return denied
  const body = await parseBody(req, putSchema)
  if (body instanceof NextResponse) return body
  const fields = Array.from(new Set(body.fields))
  const { error } = await (supabase as unknown as Loose).from('org_settings')
    .upsert({ org_id: auth.orgId, opening_reapproval_fields: fields }, { onConflict: 'org_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: { fields } })
}
