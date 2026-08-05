import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'
import { recordCandidateEventSafe } from '@/modules/ats/domain/applications'

// DELETE /api/candidates/[id]/tags/[tagId]
export const DELETE = withCapability('recruiting:edit', async (_req, orgId, supabase, { params }) => {
  // Read the tag name before deleting so we can name it in the History entry.
  const { data: tagRow } = await supabase
    .from('candidate_tags')
    .select('tag')
    .eq('id', params.tagId)
    .eq('candidate_id', params.id)
    .eq('org_id', orgId)
    .maybeSingle()

  const { error } = await supabase
    .from('candidate_tags')
    .delete()
    .eq('id', params.tagId)
    .eq('candidate_id', params.id)
    .eq('org_id', orgId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await recordCandidateEventSafe(supabase, {
    orgId, candidateId: params.id, eventType: 'tag_removed',
    note: (tagRow as { tag?: string } | null)?.tag ?? null,
  })

  return new NextResponse(null, { status: 204 })
})
