import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { getOrgId } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { OpeningDetail } from '@/components/openings/OpeningDetail'
import type {
  Opening,
  Department,
  Location as LocationRow,
  CompensationBand,
  User,
} from '@/lib/types/requisitions'

export default async function OpeningDetailPage({ params }: { params: { id: string } }) {
  const { userId } = auth()
  const orgId = await getOrgId()
  if (!orgId || !userId) redirect('/sign-in')

  const supabase = createAdminClient()
  const { data: rowData } = await supabase
    .from('openings')
    .select('*')
    .eq('id', params.id)
    .eq('org_id', orgId)
    .maybeSingle()

  const opening = rowData as Opening | null
  if (!opening) notFound()

  const [{ data: deptsData }, { data: locsData }, { data: bandsData }, { data: usersData }] = await Promise.all([
    supabase.from('departments').select('id, name').eq('org_id', orgId).eq('is_active', true),
    supabase.from('locations').select('id, name').eq('org_id', orgId).eq('is_active', true),
    supabase.from('compensation_bands').select('id, name, currency, min_salary, max_salary, department_id, location_id, level, is_active, org_id, created_at, updated_at').eq('org_id', orgId).eq('is_active', true),
    supabase.from('users').select('id, full_name, email').in('id', [opening.hiring_manager_id, opening.recruiter_id, opening.created_by].filter(Boolean) as string[]),
  ])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <OpeningDetail
        opening={opening}
        departments={(deptsData ?? []) as Pick<Department, 'id' | 'name'>[]}
        locations={(locsData ?? []) as Pick<LocationRow, 'id' | 'name'>[]}
        compBands={(bandsData ?? []) as CompensationBand[]}
        users={(usersData ?? []) as Pick<User, 'id' | 'full_name' | 'email'>[]}
      />
    </div>
  )
}
