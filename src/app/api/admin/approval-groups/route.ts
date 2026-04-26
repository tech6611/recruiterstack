import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { requireAdmin } from '@/lib/auth-admin'
import { parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { groupCreateSchema } from '@/lib/validations/approval-groups'

// Read-available to any member (chain builder dropdown).
export async function GET() {
  const auth = await requireOrgAndUser()
  if (auth instanceof NextResponse) return auth

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('approval_groups')
    .select('id, name, description, is_active, created_at, updated_at')
    .eq('org_id', auth.orgId)
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Eager member counts for the Settings card.
  const ids = (data ?? []).map(g => (g as { id: string }).id)
  const counts = new Map<string, number>()
  if (ids.length > 0) {
    const { data: members } = await supabase
      .from('approval_group_members')
      .select('group_id')
      .in('group_id', ids)
    for (const m of (members ?? []) as Array<{ group_id: string }>) {
      counts.set(m.group_id, (counts.get(m.group_id) ?? 0) + 1)
    }
  }

  return NextResponse.json({
    data: (data ?? []).map(g => ({ ...(g as object), member_count: counts.get((g as { id: string }).id) ?? 0 })),
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const body = await parseBody(req, groupCreateSchema)
  if (body instanceof NextResponse) return body

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('approval_groups')
    .insert({
      org_id:      auth.orgId,
      name:        body.name,
      description: body.description ?? null,
      is_active:   body.is_active,
    })
    .select()
    .single()
  if (error) return handleSupabaseError(error)
  return NextResponse.json({ data }, { status: 201 })
}
