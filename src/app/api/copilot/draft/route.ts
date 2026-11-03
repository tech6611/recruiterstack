/**
 * POST /api/copilot/draft — "Write with AI" for one rich-text field in the
 * copilot's click-through form. Signed-in users only, rate-limited per org.
 *
 * Body: { field_key, field_label, subject?, intro?, context: {label: value}, current? }
 * Returns: { html }
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { checkAuthRateLimit } from '@/lib/api/rate-limit'
import { draftFormField } from '@/lib/ai/copilot-drafter'

export const maxDuration = 60

const bodySchema = z.object({
  field_key:   z.string().min(1).max(100),
  field_label: z.string().min(1).max(200),
  subject:     z.string().max(300).optional(),
  intro:       z.string().max(1000).optional(),
  context:     z.record(z.string().max(200), z.string().max(5000)).default({}),
  current:     z.string().max(20000).optional(),
})

export async function POST(request: NextRequest) {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth
  const { orgId, userId } = auth

  const limited = await checkAuthRateLimit(`${orgId}:copilot-draft`, { maxRequests: 15, window: '60 s' })
  if (limited) return limited

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const b = parsed.data

  // Company name (Settings) so "About us" isn't a placeholder.
  let companyName: string | undefined
  try {
    const { data } = await createAdminClient()
      .from('org_settings').select('company_name').eq('org_id', orgId).maybeSingle()
    companyName = (data as { company_name?: string | null } | null)?.company_name ?? undefined
  } catch { /* optional */ }

  try {
    const html = await draftFormField({
      fieldKey:   b.field_key,
      fieldLabel: b.field_label,
      subject:    b.subject,
      intro:      b.intro,
      context:    b.context,
      current:    b.current,
      companyName,
    }, { orgId, userId })
    return NextResponse.json({ html })
  } catch {
    return NextResponse.json({ error: "Couldn't write a draft just now — please try again." }, { status: 502 })
  }
}
