import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { parseBody } from '@/lib/api/helpers'
import { orgInfoSchema } from '@/lib/validations/onboarding'
import { requireOnboardingContext, ensureMemberRow } from '@/lib/onboarding/server'
import { resolveEffectiveRole, nextStep } from '@/lib/onboarding/steps'

export async function POST(req: NextRequest) {
  const ctx = await requireOnboardingContext()
  if (ctx instanceof NextResponse) return ctx

  const body = await parseBody(req, orgInfoSchema)
  if (body instanceof NextResponse) return body

  await ensureMemberRow(ctx)

  // Admin-only guard
  const role = await resolveEffectiveRole(ctx.orgId, ctx.userId)
  if (role === 'member') {
    return NextResponse.json({ error: 'Only admins can set company info' }, { status: 403 })
  }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('org_settings')
    .upsert(
      {
        org_id: ctx.orgId,
        company_name: body.company_name,
        company_size: body.company_size,
        industry:     body.industry ?? null,
        website:      body.website ?? null,
        updated_at:   new Date().toISOString(),
      },
      { onConflict: 'org_id' },
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const next = nextStep('org-info', role)
  return NextResponse.json({ ok: true, next: next ? `/onboarding/${next}` : '/dashboard' })
}
