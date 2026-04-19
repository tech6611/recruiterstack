import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrgAndUser } from '@/lib/auth'
import { parseBody, handleSupabaseError } from '@/lib/api/helpers'
import { openingUpdateSchema } from '@/lib/validations/openings'
import type { Opening } from '@/lib/types/requisitions'

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('openings')
    .select('*')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .single()

  if (error) return handleSupabaseError(error)
  return NextResponse.json({ data })
}

/**
 * PATCH — strict: only allowed when status='draft'. Any other status rejects
 * with 409 so the UI surfaces a clear error instead of silently no-op'ing.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const body = await parseBody(req, openingUpdateSchema)
  if (body instanceof NextResponse) return body

  const supabase = createAdminClient()

  // Gate: existing row must be in draft.
  const { data: existing, error: fetchErr } = await supabase
    .from('openings')
    .select('id, status, comp_band_id, comp_min, comp_max')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .single()

  if (fetchErr) return handleSupabaseError(fetchErr)
  const row = existing as Pick<Opening, 'id' | 'status' | 'comp_band_id' | 'comp_min' | 'comp_max'> | null
  if (!row) return NextResponse.json({ error: 'Opening not found' }, { status: 404 })
  if (row.status !== 'draft') {
    return NextResponse.json(
      { error: `Cannot edit an opening with status '${row.status}'. Cancel the approval or unarchive first.` },
      { status: 409 },
    )
  }

  // Recompute out_of_band if comp fields or band changed.
  const patch: Record<string, unknown> = { ...body }
  const bandId = (body.comp_band_id ?? row.comp_band_id) as string | null
  const min    = (body.comp_min     ?? row.comp_min)     as number | null
  const max    = (body.comp_max     ?? row.comp_max)     as number | null
  if (bandId && (min !== null || max !== null)) {
    const { data: band } = await supabase
      .from('compensation_bands')
      .select('min_salary, max_salary')
      .eq('id', bandId)
      .eq('org_id', orgId)
      .maybeSingle()
    if (band) {
      const b = band as { min_salary: number; max_salary: number }
      const minOut = min !== null && Number(min) < b.min_salary
      const maxOut = max !== null && Number(max) > b.max_salary
      patch.out_of_band = minOut || maxOut
    }
  }

  const { data, error } = await supabase
    .from('openings')
    .update(patch)
    .eq('id', params.id)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) return handleSupabaseError(error)
  return NextResponse.json({ data })
}

/**
 * DELETE — soft-archive by setting status='archived'.
 * Aligns with our "no soft-delete columns" decision: status enum doubles as
 * the lifecycle signal.
 */
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const authResult = await requireOrgAndUser()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('openings')
    .update({ status: 'archived' })
    .eq('id', params.id)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) return handleSupabaseError(error)
  return NextResponse.json({ data })
}
