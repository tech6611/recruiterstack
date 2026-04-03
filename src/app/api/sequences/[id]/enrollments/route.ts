import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireOrg } from '@/lib/auth'

// GET /api/sequences/[id]/enrollments — list enrollments for a sequence
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireOrg()
  if (authResult instanceof NextResponse) return authResult
  const { orgId } = authResult

  const supabase = createAdminClient()

  // Verify sequence belongs to org
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: seq } = await (supabase.from('sequences') as any)
    .select('id')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .single()

  if (!seq) return NextResponse.json({ error: 'Sequence not found' }, { status: 404 })

  // Fetch enrollments with candidate info
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('sequence_enrollments') as any)
    .select('*, candidates(name, email)')
    .eq('sequence_id', params.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Flatten candidate info
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (data ?? []).map((e: any) => ({
    ...e,
    candidate_name: e.candidates?.name ?? 'Unknown',
    candidate_email: e.candidates?.email ?? null,
    candidates: undefined,
  }))

  return NextResponse.json({ data: result })
}
