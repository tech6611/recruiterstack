import { createAdminClient } from '@/lib/supabase/server'
import { StatsCard } from '@/components/dashboard/StatsCard'
import { CandidateTable } from '@/components/dashboard/CandidateTable'
import { Users, Briefcase, UserCheck, TrendingUp } from 'lucide-react'
import type { Candidate, CandidateStatus } from '@/lib/types/database'

async function getDashboardData() {
  const supabase = createAdminClient()

  const [candidatesRes, rolesRes] = await Promise.all([
    supabase.from('candidates').select('*').order('created_at', { ascending: false }),
    supabase.from('roles').select('id, status'),
  ])

  const candidates = (candidatesRes.data ?? []) as Candidate[]
  const roles = (rolesRes.data ?? []) as { id: string; status: string }[]

  const activeRoles = roles.filter(r => r.status === 'active').length

  const statusCounts = candidates.reduce<Record<CandidateStatus, number>>(
    (acc, c) => {
      acc[c.status] = (acc[c.status] ?? 0) + 1
      return acc
    },
    {} as Record<CandidateStatus, number>,
  )

  return { candidates, activeRoles, statusCounts, totalRoles: roles.length }
}

export default async function DashboardPage() {
  const { candidates, activeRoles, statusCounts, totalRoles } =
    await getDashboardData()

  const interviewing = statusCounts['interviewing'] ?? 0
  const offerExtended = statusCounts['offer_extended'] ?? 0
  const hired = statusCounts['hired'] ?? 0
  const pipelineCount = interviewing + offerExtended + hired

  return (
    <div className="flex flex-col gap-8 p-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Overview of your recruiting pipeline
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatsCard
          title="Total Candidates"
          value={candidates.length}
          subtitle="All pipeline stages"
          icon={Users}
          color="blue"
        />
        <StatsCard
          title="Active Roles"
          value={activeRoles}
          subtitle={`${totalRoles} roles total`}
          icon={Briefcase}
          color="emerald"
        />
        <StatsCard
          title="In Pipeline"
          value={pipelineCount}
          subtitle="Interviewing + offers"
          icon={TrendingUp}
          color="violet"
        />
        <StatsCard
          title="Hired"
          value={hired}
          subtitle="Successfully placed"
          icon={UserCheck}
          color="amber"
        />
      </div>

      {/* Status breakdown strip */}
      <div className="flex flex-wrap gap-3">
        {(
          [
            ['Active',         statusCounts['active']         ?? 0, 'bg-emerald-100 text-emerald-700'],
            ['Interviewing',   statusCounts['interviewing']   ?? 0, 'bg-blue-100    text-blue-700'],
            ['Offer Extended', statusCounts['offer_extended'] ?? 0, 'bg-violet-100  text-violet-700'],
            ['Hired',          statusCounts['hired']          ?? 0, 'bg-teal-100    text-teal-700'],
            ['Inactive',       statusCounts['inactive']       ?? 0, 'bg-slate-100   text-slate-500'],
            ['Rejected',       statusCounts['rejected']       ?? 0, 'bg-red-100     text-red-600'],
          ] as [string, number, string][]
        ).map(([label, count, cls]) => (
          <div
            key={label}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium ${cls}`}
          >
            <span>{label}</span>
            <span className="rounded-md bg-white/60 px-1.5 py-0.5 text-xs font-bold">
              {count}
            </span>
          </div>
        ))}
      </div>

      {/* Candidate table */}
      <CandidateTable candidates={candidates} />
    </div>
  )
}
