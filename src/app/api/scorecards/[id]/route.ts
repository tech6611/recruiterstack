import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'

export const DELETE = withCapability('recruiting:edit', async (_req, orgId, supabase, { params }) => {
  const { error } = await supabase
    .from('scorecards')
    .delete()
    .eq('id', params.id)
    .eq('org_id', orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
})
