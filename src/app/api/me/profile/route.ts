import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { parseBody, handleSupabaseError } from '@/lib/api/helpers'

/**
 * Recruiter profile, surfaced on Settings → General.
 * Email is read-only here — Clerk owns the identity, we mirror it via webhook.
 */

export async function GET() {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { userId } = authResult

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('users')
    .select('first_name, last_name, full_name, email, title')
    .eq('id', userId)
    .single()

  if (error) return handleSupabaseError(error)

  return NextResponse.json({ data })
}

const updateSchema = z.object({
  first_name: z.string().trim().min(1).max(120).optional(),
  last_name:  z.string().trim().max(120).optional().nullable(),
  title:      z.string().trim().max(120).optional().nullable(),
})

export async function PATCH(request: NextRequest) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { userId } = authResult

  const parsed = await parseBody(request, updateSchema)
  if (parsed instanceof NextResponse) return parsed

  const patch: Record<string, unknown> = {}
  if (parsed.first_name !== undefined) patch.first_name = parsed.first_name
  if (parsed.last_name  !== undefined) patch.last_name  = parsed.last_name?.trim() ? parsed.last_name.trim() : null
  if (parsed.title      !== undefined) patch.title      = parsed.title?.trim() ? parsed.title.trim() : null

  // Keep full_name in sync whenever a name field is touched.
  if (patch.first_name !== undefined || patch.last_name !== undefined) {
    const supabase = createAdminClient()
    const { data: existing } = await supabase
      .from('users')
      .select('first_name, last_name')
      .eq('id', userId)
      .single()
    const first = (patch.first_name ?? (existing as { first_name: string | null } | null)?.first_name ?? '') as string
    const last  = (patch.last_name  ?? (existing as { last_name:  string | null } | null)?.last_name  ?? '') as string
    patch.full_name = [first, last].filter(s => s && s.length > 0).join(' ') || null
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ data: null })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('users')
    .update(patch)
    .eq('id', userId)
    .select('first_name, last_name, full_name, email, title')
    .single()

  if (error) return handleSupabaseError(error)

  return NextResponse.json({ data })
}
