import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { parseBody } from '@/lib/api/helpers'
import { modulesSchema } from '@/lib/validations/onboarding'
import { requireOnboardingContext, ensureMemberRow } from '@/lib/onboarding/server'
import { resolveEffectiveRole, nextStep } from '@/lib/onboarding/steps'

export async function POST(req: NextRequest) {
  const ctx = await requireOnboardingContext()
  if (ctx instanceof NextResponse) return ctx

  const body = await parseBody(req, modulesSchema)
  if (body instanceof NextResponse) return body

  await ensureMemberRow(ctx)

  const role = await resolveEffectiveRole(ctx.orgId, ctx.userId)
  if (role === 'member') {
    return NextResponse.json({ error: 'Only admins can set module preferences' }, { status: 403 })
  }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('org_settings')
    .upsert(
      {
        org_id: ctx.orgId,
        enabled_agents: body.enabled_agents,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id' },
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const next = nextStep('modules', role)
  return NextResponse.json({ ok: true, next: next ? `/onboarding/${next}` : '/dashboard' })
}
