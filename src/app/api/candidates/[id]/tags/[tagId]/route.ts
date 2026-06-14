import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'

// DELETE /api/candidates/[id]/tags/[tagId]
export const DELETE = withCapability('recruiting:edit', async (_req, orgId, supabase, { params }) => {
  const { error } = await supabase
    .from('candidate_tags')
    .delete()
    .eq('id', params.tagId)
    .eq('candidate_id', params.id)
    .eq('org_id', orgId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
})
