import { NextResponse } from 'next/server'
import { withOrg, parseBody } from '@/lib/api/helpers'
import { markReadSchema } from '@/lib/validations/notifications'

// GET /api/notifications?limit=20&offset=0&unread_only=true
export const GET = withOrg(async (req, orgId, supabase) => {
  const { searchParams } = new URL(req.url)
  const limit = Math.min(Number(searchParams.get('limit') ?? 20), 100)
  const offset = Number(searchParams.get('offset') ?? 0)
  const unreadOnly = searchParams.get('unread_only') === 'true'

  let query = supabase
    .from('notifications')
    .select('*', { count: 'exact' })
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (unreadOnly) {
    query = query.eq('read', false)
  }

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [], count, limit, offset })
})

// PATCH /api/notifications  { ids: [...] } or { all: true }
// Marks notification(s) as read.
export const PATCH = withOrg(async (req, orgId, supabase) => {
  const body = await parseBody(req, markReadSchema)
  if (body instanceof NextResponse) return body

  if (body.all) {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true } as never)
      .eq('org_id', orgId)
      .eq('read', false)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: { marked: 'all' } })
  }

  if (body.ids && body.ids.length > 0) {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true } as never)
      .eq('org_id', orgId)
      .in('id', body.ids)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: { marked: body.ids.length } })
  }

  return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
})
