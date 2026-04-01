import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'

/**
 * GET /api/user-preferences?key=dashboard_views
 * Returns the stored value for a given preference key.
 */
export async function GET(req: NextRequest) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult
  const { userId } = auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const key = new URL(req.url).searchParams.get('key')
  if (!key) return NextResponse.json({ error: 'key param required' }, { status: 400 })

  const supabase = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('user_preferences') as any)
    .select('value')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .eq('key', key)
    .single()

  if (error || !data) {
    return NextResponse.json({ data: null })
  }

  return NextResponse.json({ data: data.value })
}

/**
 * PUT /api/user-preferences
 * Body: { key: string, value: any }
 * Upserts a preference for the current user + org.
 */
export async function PUT(req: NextRequest) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult
  const { userId } = auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { key: string; value: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.key || body.value === undefined) {
    return NextResponse.json({ error: 'key and value required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('user_preferences') as any)
    .upsert({
      user_id: userId,
      org_id: orgId,
      key: body.key,
      value: body.value,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,org_id,key' })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
