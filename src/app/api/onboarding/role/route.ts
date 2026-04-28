import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { parseBody } from '@/lib/api/helpers'
import { roleSchema } from '@/lib/validations/onboarding'
import { requireOnboardingContext, ensureMemberRow } from '@/lib/onboarding/server'
import { resolveEffectiveRole, nextStep } from '@/lib/onboarding/steps'
import { getInvitePreferredRole } from '@/lib/clerk/invites'
import type { OrgRole } from '@/lib/types/requisitions'

/**
 * Bootstrap-admin rule:
 *  - If no admin exists yet for this org, the FIRST user reaching this step
 *    becomes admin — regardless of what they picked (we upgrade silently).
 *  - If an admin already exists and a non-admin tries to pick 'admin',
 *    reject with 409. Only an existing admin can grant admin (via Settings,
 *    a later phase).
 *
 * Inviter-locks-role rule:
 *  - If this user came in via an invitation that carried a preferred_role,
 *    the inviter's choice wins. We ignore the body and write that role.
 *    The form is read-only client-side; this guard makes the contract
 *    enforceable even if the payload is tampered with.
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
  let lockedByInvite = false

  // Inviter's choice trumps user's pick (skip when this is the first member —
  // there is no inviter in that case).
  if (adminExists) {
    const { data: meUser } = await supabase
      .from('users')
      .select('email')
      .eq('id', ctx.userId)
      .maybeSingle()
    const email = (meUser as { email: string } | null)?.email
    if (email) {
      const locked = await getInvitePreferredRole(ctx.orgId, email)
      if (locked) {
        roleToWrite = locked
        lockedByInvite = true
      }
    }
  }

  if (!adminExists) {
    // Bootstrap: this user becomes admin regardless of pick.
    roleToWrite = 'admin'
  } else if (roleToWrite === 'admin' && !lockedByInvite) {
    // Admin exists, non-admin self-selecting 'admin' — refuse. (When the
    // inviter explicitly granted 'admin' via a locked invite, lockedByInvite
    // is true and we trust their choice.)
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
