import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { parseBody } from '@/lib/api/helpers'
import { profileSchema } from '@/lib/validations/onboarding'
import { requireOnboardingContext, ensureMemberRow } from '@/lib/onboarding/server'
import { resolveEffectiveRole, nextStep } from '@/lib/onboarding/steps'

export async function POST(req: NextRequest) {
  const ctx = await requireOnboardingContext()
  if (ctx instanceof NextResponse) return ctx

  const body = await parseBody(req, profileSchema)
  if (body instanceof NextResponse) return body

  await ensureMemberRow(ctx)

  const supabase = createAdminClient()
  const full_name = [body.first_name, body.last_name].filter(Boolean).join(' ')
  const { error } = await supabase
    .from('users')
    .update({
      first_name: body.first_name,
      last_name:  body.last_name ?? null,
      full_name,
      title:      body.title?.trim() ? body.title.trim() : null,
    })
    .eq('id', ctx.userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const role = await resolveEffectiveRole(ctx.orgId, ctx.userId)
  const next = nextStep('profile', role)
  return NextResponse.json({ ok: true, next: next ? `/onboarding/${next}` : '/dashboard' })
}
