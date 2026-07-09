import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { ensureInterviewerPreferenceLink } from '@/modules/ats/domain/interviewer-preferences'

// POST /api/interviewer-links — recruiter generates (or re-fetches) the no-login
// link an interviewer uses to set their preferred interview hours.
// Body: { email: string, name?: string }
export const POST = withCapability('recruiting:edit', async (req, orgId, supabase) => {
  const body = await req.json().catch(() => ({}))
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const name  = typeof body.name === 'string' ? body.name.trim() : null
  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }

  const token = await ensureInterviewerPreferenceLink(supabase, orgId, email, name)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
  return NextResponse.json({ link: `${appUrl}/interviewer/${token}`, token })
})
