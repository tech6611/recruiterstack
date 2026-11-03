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
import { draftFormField, isJobDescriptionField, jdToPlain, type CompanyProfile } from '@/lib/ai/copilot-drafter'

export const maxDuration = 90   // job descriptions use Gemini Pro (~10–20s, more on retry)

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

  const supabase = createAdminClient()

  // Company profile from Settings / careers page, so "About us" is real.
  const company: CompanyProfile = {}
  try {
    const { data } = await supabase
      .from('org_settings').select('company_name, tagline, about, hero_subheadline').eq('org_id', orgId).maybeSingle()
    const d = (data ?? {}) as { company_name?: string | null; tagline?: string | null; about?: string | null; hero_subheadline?: string | null }
    company.name    = d.company_name ?? undefined
    company.tagline = d.tagline ?? d.hero_subheadline ?? undefined
    company.about   = d.about ?? undefined
  } catch { /* optional */ }

  // For job descriptions: a couple of the org's own recent JDs, for voice.
  let pastJds: string[] = []
  if (isJobDescriptionField(b.field_key)) {
    try {
      const { data } = await (supabase as unknown as { from: (t: string) => any }) // eslint-disable-line @typescript-eslint/no-explicit-any
        .from('jobs').select('description').eq('org_id', orgId).not('description', 'is', null)
        .order('created_at', { ascending: false }).limit(10)
      pastJds = ((data ?? []) as { description: string | null }[])
        .map(r => jdToPlain(r.description ?? ''))
        .filter(t => t.split(/\s+/).length >= 150)
        .slice(0, 2)
    } catch { /* optional */ }
  }

  try {
    const html = await draftFormField({
      fieldKey:   b.field_key,
      fieldLabel: b.field_label,
      subject:    b.subject,
      intro:      b.intro,
      context:    b.context,
      current:    b.current,
      company,
      pastJds,
    }, { orgId, userId })
    return NextResponse.json({ html })
  } catch {
    return NextResponse.json({ error: "Couldn't write a draft just now — please try again." }, { status: 502 })
  }
}
