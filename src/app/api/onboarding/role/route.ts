import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { parseBody } from '@/lib/api/helpers'
import { roleSchema } from '@/lib/validations/onboarding'
import { requireOnboardingContext, ensureMemberRow } from '@/lib/onboarding/server'
import { resolveEffectiveRole, nextStep } from '@/lib/onboarding/steps'
import type { OrgRole } from '@/lib/types/requisitions'

/**
 * Bootstrap-admin rule:
 *  - If no admin exists yet for this org, the FIRST user reaching this step
 *    becomes admin — regardless of what they picked (we upgrade silently).
 *  - If an admin already exists and a non-admin tries to pick 'admin',
 *    reject with 409. Only an existing admin can grant admin (via Settings,
 *    a later phase).
 */
export async function POST(req: NextRequest) {
  const ctx = await requireOnboardingContext()
  if (ctx instanceof NextResponse) return ctx

  const body = await parseBody(req, roleSchema)
  if (body instanceof NextResponse) return body

  await ensureMemberRow(ctx)

  const supabase = createAdminClient()

  const { data: adminRows } = await supabase
    .from('org_members')
    .select('user_id')
    .eq('org_id', ctx.orgId)
    .eq('role', 'admin')
    .eq('is_active', true)

  const adminExists = (adminRows ?? []).length > 0
  let roleToWrite: OrgRole = body.role

  if (!adminExists) {
    // Bootstrap: this user becomes admin regardless of pick.
    roleToWrite = 'admin'
  } else if (body.role === 'admin') {
    // Admin exists, non-admin asking for admin — refuse.
    const isCurrentUserAdmin = (adminRows ?? []).some(r => (r as { user_id: string }).user_id === ctx.userId)
    if (!isCurrentUserAdmin) {
      return NextResponse.json(
        { error: 'Your organization already has an admin. Ask them to promote you from Settings.' },
        { status: 409 },
      )
    }
  }

  const { error } = await supabase
    .from('org_members')
    .update({ role: roleToWrite })
    .eq('org_id', ctx.orgId)
    .eq('user_id', ctx.userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const role = await resolveEffectiveRole(ctx.orgId, ctx.userId)
  const next = nextStep('role', role)
  return NextResponse.json({ ok: true, next: next ? `/onboarding/${next}` : '/dashboard' })
}
