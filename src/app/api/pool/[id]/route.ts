import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { getPoolAccess, getPoolProfile } from '@/modules/pool/domain/pool'

// GET /api/pool/[id] — full profile. Contacts only if this org has unlocked it.
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
  const access = await getPoolAccess(supabase, orgId)
  if (!access.hasAccess) return NextResponse.json({ error: 'No pool subscription' }, { status: 403 })

  const profile = await getPoolProfile(supabase, orgId, params.id)
  if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ profile, access })
})
