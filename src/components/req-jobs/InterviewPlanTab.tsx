'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, ChevronUp, ChevronDown, Loader2, CalendarClock, Save, Clock, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { JobTeamRoster } from '@/components/req-jobs/JobTeamRoster'
import { teamMemberName, type TeamMember } from '@/lib/team-members'
import type { InterviewType } from '@/lib/types/database'
import type { InterviewPlanRound } from '@/lib/types/interview-plans'

const TYPE_OPTIONS: { value: InterviewType; label: string }[] = [
  { value: 'video', label: 'Video call' }, { value: 'phone', label: 'Phone' },
  { value: 'in_person', label: 'In person' }, { value: 'panel', label: 'Panel' },
  { value: 'technical', label: 'Technical' }, { value: 'assessment', label: 'Assessment' },
]
const TYPE_LABEL: Record<string, string> = Object.fromEntries(TYPE_OPTIONS.map(o => [o.value, o.label]))

type Round = {
  name: string; interview_type: InterviewType; duration_minutes: number
  interviewer_user_id: string | null; interviewer_name: string | null; interviewer_role: string; stage_id: string | null
}
type Stage = { id: string; name: string }
type Pending = { rounds: InterviewPlanRound[]; meta: { requested_at?: string; approver_source?: string } }

const blankRound = (): Round => ({ name: '', interview_type: 'video', duration_minutes: 45, interviewer_user_id: null, interviewer_name: null, interviewer_role: '', stage_id: null })
const STARTER: Round[] = [
  { name: 'Recruiter Screen', interview_type: 'phone', duration_minutes: 30, interviewer_user_id: null, interviewer_name: null, interviewer_role: 'Recruiter', stage_id: null },
  { name: 'Technical Round', interview_type: 'technical', duration_minutes: 60, interviewer_user_id: null, interviewer_name: null, interviewer_role: 'Interviewer', stage_id: null },
  { name: 'Hiring Manager', interview_type: 'video', duration_minutes: 45, interviewer_user_id: null, interviewer_name: null, interviewer_role: 'Hiring Manager', stage_id: null },
]

const toRound = (r: InterviewPlanRound): Round => ({
  name: r.name, interview_type: r.interview_type, duration_minutes: r.duration_minutes,
  interviewer_user_id: r.interviewer_user_id, interviewer_name: r.interviewer_name, interviewer_role: r.interviewer_role ?? '', stage_id: r.stage_id,
})

export function InterviewPlanTab({ jobId }: { jobId: string }) {
  const [rounds, setRounds]   = useState<Round[]>([])
  const [stages, setStages]   = useState<Stage[]>([])
  const [team, setTeam]       = useState<TeamMember[]>([])
  const [pending, setPending] = useState<Pending | null>(null)
  const [approvalRequired, setApprovalRequired] = useState(false)
  const [canDecide, setCanDecide] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [deciding, setDeciding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [planRes, stageRes, teamRes] = await Promise.all([
      fetch(`/api/jobs/${jobId}/interview-plan`).then(r => r.json()).catch(() => null),
      fetch(`/api/pipeline-stages?job_id=${jobId}`).then(r => r.json()).catch(() => null),
      fetch('/api/team').then(r => r.json()).catch(() => null),
    ])
    const d = planRes?.data ?? {}
    setRounds(((d.rounds ?? []) as InterviewPlanRound[]).map(toRound))
    setPending(d.pending ?? null)
    setApprovalRequired(!!d.approvalRequired)
    setCanDecide(!!d.canDecide)
    setStages(((stageRes?.data ?? []) as Stage[]).map(s => ({ id: s.id, name: s.name })))
    setTeam((teamRes?.data ?? []) as TeamMember[])
    setLoading(false)
  }, [jobId])
  useEffect(() => { load() }, [load])

  const update = (i: number, patch: Partial<Round>) => setRounds(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  const remove = (i: number) => setRounds(rs => rs.filter((_, idx) => idx !== i))
  const move = (i: number, dir: -1 | 1) => setRounds(rs => {
    const j = i + dir; if (j < 0 || j >= rs.length) return rs
    const next = rs.slice(); [next[i], next[j]] = [next[j], next[i]]; return next
  })
  const pickPerson = (i: number, userId: string) => {
    if (!userId) { update(i, { interviewer_user_id: null, interviewer_name: null }); return }
    const m = team.find(t => t.user_id === userId)
    update(i, { interviewer_user_id: userId, interviewer_name: m ? teamMemberName(m) : null, interviewer_role: '' })
  }

  const save = async () => {
    if (rounds.some(r => !r.name.trim())) { toast.error('Every round needs a name.'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/jobs/${jobId}/interview-plan`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rounds: rounds.map(r => ({
          name: r.name.trim(), interview_type: r.interview_type, duration_minutes: r.duration_minutes,
          interviewer_user_id: r.interviewer_user_id || null,
          interviewer_name: r.interviewer_user_id ? (r.interviewer_name || null) : null,
          interviewer_role: r.interviewer_user_id ? null : (r.interviewer_role.trim() || null),
          stage_id: r.stage_id || null,
        })) }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Failed to save')
      toast.success(j.data?.status === 'pending_approval' ? 'Submitted for the hiring manager’s approval.' : 'Interview plan saved.')
      await load()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to save plan') } finally { setSaving(false) }
  }

  const decide = async (decision: 'approve' | 'reject') => {
    setDeciding(true)
    try {
      const res = await fetch(`/api/jobs/${jobId}/interview-plan/decision`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Failed')
      toast.success(decision === 'approve' ? 'Change approved and applied.' : 'Change rejected.')
      await load()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed') } finally { setDeciding(false) }
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>

  const rosterRounds = rounds.map(r => ({
    name: r.name, interview_type: r.interview_type, duration_minutes: r.duration_minutes,
    interviewer_user_id: r.interviewer_user_id, interviewer_name: r.interviewer_name, interviewer_role: r.interviewer_role.trim() || null,
  }))

  return (
    <div className="space-y-4">
      <JobTeamRoster jobId={jobId} liveTeam={team} liveRounds={rosterRounds} />

      {pending ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm"><Clock className="h-4 w-4 text-amber-600" /> Changes pending hiring-manager approval</CardTitle>
            <CardDescription>
              A proposed change to this plan is awaiting sign-off{pending.meta.approver_source === 'owner_fallback' ? ' (routed to an admin — no hiring manager assigned)' : ''}. The live plan stays as-is until it’s decided.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-amber-700">Proposed rounds</p>
              <ol className="space-y-1.5">
                {pending.rounds.map((r, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">{i + 1}</span>
                    <span className="font-medium">{r.name}</span>
                    <span className="text-slate-400">·</span><span className="text-slate-500">{TYPE_LABEL[r.interview_type] ?? r.interview_type}</span>
                    <span className="text-slate-400">·</span><span className="text-slate-500">{r.interviewer_name || r.interviewer_role || 'Unassigned'}</span>
                    <span className="text-slate-400">·</span><span className="text-slate-500">{r.duration_minutes}m</span>
                  </li>
                ))}
              </ol>
            </div>
            {canDecide ? (
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => decide('approve')} disabled={deciding}>
                  {deciding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Approve &amp; apply
                </Button>
                <Button size="sm" variant="outline" onClick={() => decide('reject')} disabled={deciding}>
                  <X className="h-3.5 w-3.5" /> Reject
                </Button>
              </div>
            ) : (
              <p className="text-xs text-slate-400">Awaiting the hiring manager’s decision. The plan is read-only until then.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-slate-500" /> Interview Plan</CardTitle>
              <CardDescription>
                Define the rounds for this job — how many, of what kind, and who runs each.
                {approvalRequired ? ' Because this job is active, plan changes need the hiring manager’s approval before they go live.' : ' Scheduling will follow this plan.'}
              </CardDescription>
            </div>
            <Button onClick={save} size="sm" disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {approvalRequired ? 'Submit for approval' : 'Save plan'}
            </Button>
          </CardHeader>

          <CardContent className="space-y-3">
            {rounds.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center">
                <CalendarClock className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                <p className="text-sm font-medium text-slate-600">No rounds yet</p>
                <p className="mb-4 mt-1 text-xs text-slate-400">Add rounds one by one, or start from a common 3-round template.</p>
                <div className="flex items-center justify-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => setRounds([blankRound()])}><Plus className="h-3.5 w-3.5" /> Add a round</Button>
                  <Button size="sm" variant="outline" onClick={() => setRounds(STARTER.map(r => ({ ...r })))}>Use starter template</Button>
                </div>
              </div>
            ) : (
              <>
                {rounds.map((r, i) => (
                  <div key={i} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col">
                        <button aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0} className="text-slate-300 hover:text-slate-600 disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button>
                        <button aria-label="Move down" onClick={() => move(i, 1)} disabled={i === rounds.length - 1} className="text-slate-300 hover:text-slate-600 disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button>
                      </div>
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{i + 1}</span>
                      <Input value={r.name} onChange={e => update(i, { name: e.target.value })} placeholder="Round name (e.g. Hiring Manager)" className="flex-1" />
                      <button aria-label="Remove round" onClick={() => remove(i)} className="text-slate-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-3 pl-10 sm:grid-cols-4">
                      <div>
                        <Label className="mb-1 block text-[11px] uppercase tracking-wide text-slate-400">Type</Label>
                        <Select value={r.interview_type} onChange={e => update(i, { interview_type: e.target.value as InterviewType })}>
                          {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </Select>
                      </div>
                      <div>
                        <Label className="mb-1 block text-[11px] uppercase tracking-wide text-slate-400">Who</Label>
                        <Select value={r.interviewer_user_id ?? ''} onChange={e => pickPerson(i, e.target.value)}>
                          <option value="">— role / unassigned —</option>
                          {team.map(m => <option key={m.user_id} value={m.user_id}>{teamMemberName(m)}</option>)}
                        </Select>
                        {!r.interviewer_user_id && (
                          <Input className="mt-1.5" value={r.interviewer_role} onChange={e => update(i, { interviewer_role: e.target.value })} placeholder="or a role" />
                        )}
                      </div>
                      <div>
                        <Label className="mb-1 block text-[11px] uppercase tracking-wide text-slate-400">Duration (min)</Label>
                        <Input type="number" min={5} max={600} value={r.duration_minutes} onChange={e => update(i, { duration_minutes: Number(e.target.value) || 0 })} />
                      </div>
                      <div>
                        <Label className="mb-1 block text-[11px] uppercase tracking-wide text-slate-400">Stage (optional)</Label>
                        <Select value={r.stage_id ?? ''} onChange={e => update(i, { stage_id: e.target.value || null })}>
                          <option value="">—</option>
                          {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </Select>
                      </div>
                    </div>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={() => setRounds(rs => [...rs, blankRound()])}><Plus className="h-3.5 w-3.5" /> Add round</Button>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
