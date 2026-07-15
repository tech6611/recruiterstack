import { NextResponse } from 'next/server'
import { withApiKey } from '@/lib/api/api-keys'

// GET /api/ext/sequences — active sequences for the key's org, for the
// extension's "choose a sequence" dropdown. API-key authenticated.
export const GET = withApiKey(async (_req, orgId, supabase) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('sequences') as any)
    .select('id, name')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .order('name', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sequences = (data ?? []).map((s: any) => ({ id: s.id, name: s.name }))
  return NextResponse.json({ data: sequences })
})
