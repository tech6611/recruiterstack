import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { getOrgId } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { JobDetail } from '@/components/req-jobs/JobDetail'
import type { Job, Department, Opening } from '@/lib/types/requisitions'

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

  const [{ data: deptRow }, { data: linkedRaw }] = await Promise.all([
    job.department_id
      ? supabase.from('departments').select('id, name').eq('id', job.department_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('job_openings').select('opening_id').eq('job_id', params.id),
  ])

  const linkedIds = (linkedRaw ?? []).map(r => (r as { opening_id: string }).opening_id)
  const { data: linkedOpeningsRaw } = linkedIds.length > 0
    ? await supabase.from('openings').select('id, title, status, comp_min, comp_max, comp_currency, target_start_date').in('id', linkedIds)
    : { data: [] }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <JobDetail
        job={job}
        department={deptRow as Pick<Department, 'id' | 'name'> | null}
        linkedOpenings={(linkedOpeningsRaw ?? []) as Pick<Opening, 'id' | 'title' | 'status' | 'comp_min' | 'comp_max' | 'comp_currency' | 'target_start_date'>[]}
      />
    </div>
  )
}
