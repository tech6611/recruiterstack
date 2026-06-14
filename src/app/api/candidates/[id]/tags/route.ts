import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'

// GET /api/candidates/[id]/tags
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase, { params }) => {
  const { data, error } = await supabase
    .from('candidate_tags')
    .select('*')
    .eq('candidate_id', params.id)
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
})

// POST /api/candidates/[id]/tags
export const POST = withCapability('recruiting:edit', async (req, orgId, supabase, { params }) => {
  let body: { tag?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const tag = body.tag?.trim().toLowerCase()
  if (!tag) {
    return NextResponse.json({ error: 'tag is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('candidate_tags')
    .insert({
      org_id:       orgId,
      candidate_id: params.id,
      tag,
    } as never)
    .select()
    .single()

  if (error) {
    // Unique constraint violation — tag already exists
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Tag already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
})
