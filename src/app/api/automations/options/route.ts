import { NextResponse } from 'next/server'
import { withCapability } from '@/lib/api/helpers'

// GET /api/automations/options — distinct tags + pipeline stage names for the
// org, to populate the auto-enrollment rule value picker. Degrades to empty
// lists if a source is unavailable (never fails the rule editor).
export const GET = withCapability('recruiting:view', async (_req, orgId, supabase) => {
  const [tagsRes, stagesRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from('candidate_tags') as any).select('tag').eq('org_id', orgId).limit(2000),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((supabase as any).from('pipeline_stages')).select('name').eq('org_id', orgId).limit(2000),
  ])

  const uniqSorted = (rows: { [k: string]: string }[] | null, key: string) =>
    Array.from(new Set((rows ?? []).map(r => r[key]).filter(Boolean))).sort((a, b) => a.localeCompare(b))

  return NextResponse.json({
    data: {
      tags: uniqSorted(tagsRes.data, 'tag'),
      stages: uniqSorted(stagesRes.data, 'name'),
    },
  })
})
