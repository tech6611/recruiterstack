import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { getPoolAccess, getPoolProfile } from '@/modules/pool/domain/pool'
import { loadCompanyFacts } from '@/modules/core/domain/company-facts'

// GET /api/pool/[id] — full profile. Contacts only if this org has unlocked it.
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
  const access = await getPoolAccess(supabase, orgId)
  if (!access.hasAccess) return NextResponse.json({ error: 'No pool subscription' }, { status: 403 })

  const profile = await getPoolProfile(supabase, orgId, params.id)
  if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // What this person's EMPLOYERS are — industry, size, stage. Sent alongside rather
  // than folded into the profile, because these are facts about companies, not about
  // the person, and the chips are derived fresh on every render.
  const companies = await loadCompanyFacts(supabase, (profile.experiences ?? []).map((e) => e.employer))

  return NextResponse.json({ profile, access, companies })
})
