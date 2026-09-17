import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { getOrgId, resolveUserIdFromClerk } from '@/lib/auth'
import { getViewerScope } from '@/lib/rbac'
import { canSeeJob } from '@/lib/jobs/confidential'
import { createAdminClient } from '@/lib/supabase/server'
import { JobDetail } from '@/components/req-jobs/JobDetail'
import type { Job, Department, Opening, Location as LocationRow } from '@/lib/types/requisitions'

export default async function JobDetailPage({ params }: { params: { id: string } }) {
  const { userId } = auth()
  const orgId = await getOrgId()
  if (!orgId || !userId) redirect('/sign-in')

  const supabase = createAdminClient()
  const { data: jobRow } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .maybeSingle()

  const job = jobRow as Job | null
  if (!job) notFound()

  // Confidential jobs read as 'not found' for anyone not on them (admins, the
  // creator, and hiring-team members on the job or its requisitions may see it).
  if (job.confidentiality === 'confidential') {
    const viewer = await resolveUserIdFromClerk(userId)
    const scope = await getViewerScope(supabase, orgId, viewer)
    if (!(await canSeeJob(supabase, orgId, scope, job))) notFound()
  }

  const [{ data: deptRow }, { data: allDepts }, { data: allLocs }, { data: linkedRaw }] = await Promise.all([
    job.department_id
      ? supabase.from('departments').select('id, name').eq('id', job.department_id).maybeSingle()
      : Promise.resolve({ data: null }),
    // Full department list powers the edit-form picker.
    supabase.from('departments').select('id, name').eq('org_id', orgId).order('name'),
    // Locations power the Location picker + resolve job.location_id to a name.
    supabase.from('locations').select('id, name').eq('org_id', orgId).order('name'),
    supabase.from('job_openings').select('opening_id').eq('job_id', params.id),
  ])

  const linkedIds = (linkedRaw ?? []).map(r => (r as { opening_id: string }).opening_id)
  // `number` (migration 143) may not exist on a pre-migration DB — retry without it.
  let linkedOpeningsRaw: unknown[] = []
  if (linkedIds.length > 0) {
    const cols = 'id, title, status, comp_min, comp_max, comp_currency, target_start_date'
    const res = await supabase.from('openings').select(`${cols}, number`).in('id', linkedIds)
    if (res.error?.code === '42703') {
      const fallback = await supabase.from('openings').select(cols).in('id', linkedIds)
      linkedOpeningsRaw = fallback.data ?? []
    } else {
      linkedOpeningsRaw = res.data ?? []
    }
  }

  // Full-width, flush against the app sidebar — the job screen is a 3-column
  // layout (left menu · content · info rail) that needs the room, so no
  // max-width cap / centering here.
  return (
    <div className="p-6">
      <JobDetail
        job={job}
        department={deptRow as Pick<Department, 'id' | 'name'> | null}
        departments={(allDepts ?? []) as Pick<Department, 'id' | 'name'>[]}
        locations={(allLocs ?? []) as Pick<LocationRow, 'id' | 'name'>[]}
        linkedOpenings={linkedOpeningsRaw as Pick<Opening, 'id' | 'title' | 'status' | 'comp_min' | 'comp_max' | 'comp_currency' | 'target_start_date' | 'number'>[]}
      />
    </div>
  )
}
