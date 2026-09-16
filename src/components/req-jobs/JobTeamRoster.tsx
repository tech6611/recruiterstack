'use client'

import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { Users, Loader2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { nameInitials, teamMemberName, type TeamMember } from '@/lib/team-members'
import { HiringManagerEditDialog, type HmEditMode } from '@/components/req-jobs/HiringManagerEditDialog'
import type { JobTeamRow } from '@/modules/ats/domain/job-team'

type HmEdit = {
  mode: HmEditMode
  opening_id: string | null
  pending: { id: string; proposed_user_id: string | null } | null
}

/**
 * "Team on this job" — roster assembled server-side from the job's own
 * records (assigned/intake hiring manager, HRIS skip-level, requisition
 * recruiter, stage interview panels). See GET /api/jobs/:id/team. The only
 * thing editable here is the hiring manager: with a linked requisition the
 * change goes through the requisition (the job follows it), otherwise it is
 * applied to the job directly.
 */
export function JobTeamRoster({ jobId, hmRefreshKey = 0 }: {
  jobId: string
  /** Bump to re-fetch (e.g. after the HM picker or a requisition link changes). */
  hmRefreshKey?: number
}) {
  const [rows, setRows]       = useState<JobTeamRow[]>([])
  const [hmEdit, setHmEdit]   = useState<HmEdit | null>(null)
  const [team, setTeam]       = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const [localKey, setLocalKey] = useState(0)

  const refresh = useCallback(() => setLocalKey(k => k + 1), [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetch(`/api/jobs/${jobId}/team`).then(r => r.json())
      .then(j => {
        if (!alive) return
        setRows((j?.data?.rows ?? []) as JobTeamRow[])
        setHmEdit((j?.data?.hm_edit ?? null) as HmEdit | null)
      })
      .catch(() => { if (alive) { setRows([]); setHmEdit(null) } })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [jobId, hmRefreshKey, localKey])

  // Org members — used to resolve the pending proposal to a name and to fill
  // the dialog's picker.
  useEffect(() => {
    let alive = true
    fetch('/api/team').then(r => r.json())
      .then(j => { if (alive) setTeam((j?.data ?? []) as TeamMember[]) })
      .catch(() => { if (alive) setTeam([]) })
    return () => { alive = false }
  }, [])

  const hmRow = rows.find(r => r.tags.some(t => t.role === 'hiring_manager')) ?? null
  // The roster carries names/emails, not user ids — match the HM back to a
  // member by email so the dialog can pre-select them.
  const hmEmail = hmRow?.email?.trim().toLowerCase() ?? null
  const currentHmUserId = hmEmail
    ? team.find(m => m.users?.email?.trim().toLowerCase() === hmEmail)?.user_id ?? null
    : null

  const pending = hmEdit?.pending ?? null
  const proposedMember = pending?.proposed_user_id ? team.find(m => m.user_id === pending.proposed_user_id) : undefined
  const proposedName = !pending ? null
    : !pending.proposed_user_id ? '— none —'
    : proposedMember ? teamMemberName(proposedMember) : 'a team member'

  async function withdraw() {
    if (!pending || !hmEdit?.opening_id) return
    setWithdrawing(true)
    try {
      const res  = await fetch(`/api/openings/${hmEdit.opening_id}/changes/${pending.id}/cancel`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(body.error ?? 'Could not withdraw the change'); return }
      toast.success('Change withdrawn')
      refresh()
    } finally {
      setWithdrawing(false)
    }
  }

  const canEdit = !!hmEdit && !pending
  const pencil = hmEdit ? (
    <button
      type="button"
      onClick={() => setEditing(true)}
      disabled={!canEdit}
      title={pending ? 'A change is awaiting approval' : 'Change hiring manager'}
      aria-label="Change hiring manager"
      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
    >
      <Pencil className="h-3.5 w-3.5" />
    </button>
  ) : null

  const pendingLine = pending ? (
    <div className="flex items-center gap-2 pb-2 pl-11 text-[11px] text-amber-700">
      <span className="min-w-0 truncate">Change to <span className="font-medium">{proposedName}</span> awaiting approval</span>
      <button
        type="button"
        onClick={withdraw}
        disabled={withdrawing}
        className="shrink-0 font-medium underline-offset-2 hover:underline disabled:opacity-50"
      >
        {withdrawing ? 'Withdrawing…' : 'Withdraw'}
      </button>
    </div>
  ) : null

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
            {rows.map(r => {
              const isHm = r === hmRow
              return (
                <div key={r.key}>
                  <Row row={r} action={isHm ? pencil : null} />
                  {isHm && pendingLine}
                </div>
              )
            })}
          </div>
        )}
        {!loading && !hmRow && hmEdit && (
          <div className="mt-1">
            {pendingLine}
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={!canEdit}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Pencil className="h-3.5 w-3.5" /> Set hiring manager
            </button>
          </div>
        )}
      </CardContent>
      {editing && hmEdit && (
        <HiringManagerEditDialog
          jobId={jobId}
          mode={hmEdit.mode}
          openingId={hmEdit.opening_id}
          currentUserId={currentHmUserId}
          team={team}
          onClose={changed => { setEditing(false); if (changed) refresh() }}
        />
      )}
    </Card>
  )
}

function Row({ row, action }: { row: JobTeamRow; action?: ReactNode }) {
  const sub = row.stages.length ? row.stages.join('  ·  ') : (row.email ?? '')
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[11px] font-semibold text-white">{nameInitials(row.name)}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-800">{row.name}</p>
        {sub && <p className="truncate text-xs text-slate-500">{sub}</p>}
      </div>
      <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1">
        {row.tags.map(t => (
          <span key={t.role} title={t.from} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">{t.label}</span>
        ))}
        {row.tags.length === 0 && row.stages.length > 0 && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
            {row.stages.length === 1 ? 'Interviewer' : `${row.stages.length} stages`}
          </span>
        )}
        {action}
      </div>
    </div>
  )
}
