'use client'

import { useState, useEffect } from 'react'
import { Users, Loader2 } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { nameInitials } from '@/lib/team-members'
import type { JobTeamRow } from '@/modules/ats/domain/job-team'

/**
 * "Team on this job" — read-only roster assembled server-side from the job's
 * own records (assigned/intake hiring manager, HRIS skip-level, requisition
 * recruiter, stage interview panels). See GET /api/jobs/:id/team. Change the
 * source record (requisition, HM picker, stage panel) and this follows.
 */
export function JobTeamRoster({ jobId, hmRefreshKey = 0 }: {
  jobId: string
  /** Bump to re-fetch (e.g. after the HM picker or a requisition link changes). */
  hmRefreshKey?: number
}) {
  const [rows, setRows]       = useState<JobTeamRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetch(`/api/jobs/${jobId}/team`).then(r => r.json())
      .then(j => { if (alive) setRows((j?.data?.rows ?? []) as JobTeamRow[]) })
      .catch(() => { if (alive) setRows([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [jobId, hmRefreshKey])

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm"><Users className="h-4 w-4 text-slate-500" /> Team on this job</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></div>
        ) : rows.length === 0 ? (
          <p className="py-2 text-sm text-slate-400">Assign a hiring manager, link a requisition, or add interviewers to a stage’s panel to build the team.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map(r => <Row key={r.key} row={r} />)}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Row({ row }: { row: JobTeamRow }) {
  const sub = row.stages.length ? row.stages.join('  ·  ') : (row.email ?? '')
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[11px] font-semibold text-white">{nameInitials(row.name)}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-800">{row.name}</p>
        {sub && <p className="truncate text-xs text-slate-500">{sub}</p>}
      </div>
      <div className="ml-auto flex shrink-0 flex-wrap justify-end gap-1">
        {row.tags.map(t => (
          <span key={t.role} title={t.from} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">{t.label}</span>
        ))}
        {row.tags.length === 0 && row.stages.length > 0 && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
            {row.stages.length === 1 ? 'Interviewer' : `${row.stages.length} stages`}
          </span>
        )}
      </div>
    </div>
  )
}
