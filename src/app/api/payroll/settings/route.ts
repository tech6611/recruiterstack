import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { assertCapability, getViewerScope } from '@/lib/rbac'
import { getOrCreateSettings, updateSettings } from '@/modules/payroll/domain/settings'
import type { PayrollOrgSettingsUpdate } from '@/lib/types/database'

// GET /api/payroll/settings — admin only. Lazily creates a default row.
export async function GET() {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const guard = assertCapability(scope, 'payroll:view')
  if (guard) return guard

  try {
    const data = await getOrCreateSettings(supabase, orgId)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load payroll settings' },
      { status: 500 },
    )
  }
}

// PUT /api/payroll/settings — admin only. Patches the row.
export async function PUT(req: NextRequest) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId, userId } = authResult

  const supabase = createAdminClient()
  const scope = await getViewerScope(supabase, orgId, userId)
  const guard = assertCapability(scope, 'payroll:edit')
  if (guard) return guard

  let body: PayrollOrgSettingsUpdate
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  // Whitelist patchable fields (don't let callers stomp org_id, created_at, etc.)
  const patch: PayrollOrgSettingsUpdate = {}
  for (const k of [
    'country_code', 'default_state', 'default_tax_regime', 'metro',
    'basic_pct', 'hra_pct_metro', 'hra_pct_non_metro',
    'pf_employee_pct', 'pf_wage_ceiling_enabled', 'pf_wage_ceiling',
    'esi_threshold', 'esi_employee_pct', 'notes',
  ] as const) {
    if (k in body && body[k] !== undefined) (patch as Record<string, unknown>)[k] = body[k]
  }

  try {
    const data = await updateSettings(supabase, orgId, patch)
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update payroll settings' },
      { status: 400 },
    )
  }
}
