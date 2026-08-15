'use client'

import { useState, useEffect, useCallback } from 'react'
import { Users, Loader2 } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { teamMemberName, nameInitials, type TeamMember } from '@/lib/team-members'

const TYPE_LABEL: Record<string, string> = {
  video: 'Video', phone: 'Phone', in_person: 'In person', panel: 'Panel', technical: 'Technical', assessment: 'Assessment',
}

/** Minimal round shape the roster needs (satisfied by both saved + in-editor rounds). */
export type RosterRound = {
  name: string
  interview_type: string
  duration_minutes: number
  interviewer_user_id: string | null
  interviewer_name: string | null
  interviewer_role: string | null
}

/**
 * "Team on this job" — built from the interview plan. Pass `liveRounds`/`liveTeam`
 * to render from an in-progress editor (updates as you type); omit them and the
 * component fetches the saved plan itself (used on the Overview tab).
 */
export function JobTeamRoster({ jobId, liveRounds, liveTeam, hmRefreshKey = 0 }: {
  jobId: string
  liveRounds?: RosterRound[]
  liveTeam?: TeamMember[]
  /** Bump to re-fetch the resolved hiring manager (e.g. after the HM picker changes). */
  hmRefreshKey?: number
}) {
  const isLive = liveRounds !== undefined
  const [fetchedRounds, setFetchedRounds] = useState<RosterRound[]>([])
  const [fetchedTeam, setFetchedTeam]     = useState<TeamMember[]>([])
  const [hm, setHm]                       = useState<{ user_id: string | null; name: string | null; email: string | null; source: string } | null>(null)
  const [loading, setLoading]             = useState(!isLive)

  const load = useCallback(async () => {
    setLoading(true)
    const [plan, tm] = await Promise.all([
      fetch(`/api/jobs/${jobId}/interview-plan`).then(r => r.json()).catch(() => null),
      fetch('/api/team').then(r => r.json()).catch(() => null),
    ])
    setFetchedRounds((plan?.data?.rounds ?? []) as RosterRound[])
    setFetchedTeam((tm?.data ?? []) as TeamMember[])
    setLoading(false)
  }, [jobId])
  useEffect(() => { if (!isLive) load() }, [isLive, load])

  // Resolve the hiring manager (assigned real user, else intake) — in both modes.
  useEffect(() => {
    fetch(`/api/jobs/${jobId}/hiring-manager`).then(r => r.json())
      .then(j => setHm(j?.data ? { user_id: j.data.user_id ?? null, name: j.data.name ?? null, email: j.data.email ?? null, source: j.data.source ?? 'none' } : null))
      .catch(() => setHm(null))
  }, [jobId, hmRefreshKey])

  const rounds = isLive ? liveRounds! : fetchedRounds
  const team   = isLive ? (liveTeam ?? []) : fetchedTeam
  const memberById = new Map(team.map(m => [m.user_id, m]))

  // Group rounds by the person (or role) that runs them, preserving round order.
  const order: string[] = []
  const groups = new Map<string, { name: string; rounds: { round: RosterRound; n: number }[] }>()
  rounds.forEach((r, idx) => {
    const key = r.interviewer_user_id ?? (r.interviewer_role ? `role:${r.interviewer_role}` : null)
    if (!key) return
    const name = r.interviewer_user_id
      ? (memberById.get(r.interviewer_user_id) ? teamMemberName(memberById.get(r.interviewer_user_id)!) : (r.interviewer_name ?? 'Interviewer'))
      : (r.interviewer_role || 'Interviewer')
    if (!groups.has(key)) { groups.set(key, { name, rounds: [] }); order.push(key) }
    groups.get(key)!.rounds.push({ round: r, n: idx + 1 })
  })
  const hmName = hm?.name ?? null
  const hmEmail = hm?.email ?? null
  const hasHM = !!(hmName || hmEmail)
  const hmPill = hm?.source === 'assigned' ? 'hiring manager' : 'from intake'
  const hmKey = hm?.user_id ?? null
  const hmIsInterviewer = !!(hmKey && groups.has(hmKey))

  const roundsSub = (rs: { round: RosterRound; n: number }[]) =>
    rs.map(x => `${x.round.name} · ${TYPE_LABEL[x.round.interview_type] ?? x.round.interview_type} · ${x.round.duration_minutes}m`).join('  ·  ')

  // One row per person. A hiring manager who also runs a round is merged into that
  // round's row. Everyone — including the HM — is tagged by the round they run
  // (e.g. "Round 2"), not their role: the HM is already identified on the Overview,
  // so re-tagging them "hiring manager" here just duplicates that. Only a HM who
  // runs no round at all keeps the "hiring manager" tag (there's no round to show).
  const rows: { key: string; name: string; sub: string; pill: string }[] = []
  if (hasHM && !hmIsInterviewer) {
    rows.push({ key: 'hm', name: hmName || hmEmail || 'Hiring manager', sub: hmEmail && hmName ? hmEmail : 'Hiring manager', pill: hmPill })
  }
  for (const k of order) {
    const g = groups.get(k)!
    rows.push({
      key: k, name: g.name, sub: roundsSub(g.rounds),
      pill: g.rounds.length === 1 ? `Round ${g.rounds[0].n}` : `${g.rounds.length} rounds`,
    })
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm"><Users className="h-4 w-4 text-slate-500" /> Team on this job</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></div>
        ) : rows.length === 0 ? (
          <p className="py-2 text-sm text-slate-400">Assign interviewers in the Interview Plan to build the team.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map(r => (
              <Row key={r.key} initials={nameInitials(r.name)} name={r.name} sub={r.sub} pill={r.pill} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Row({ initials, name, sub, pill }: { initials: string; name: string; sub: string; pill?: string }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[11px] font-semibold text-white">{initials}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-800">{name}</p>
        <p className="truncate text-xs text-slate-500">{sub}</p>
      </div>
      {pill && <span className="ml-auto shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">{pill}</span>}
    </div>
  )
}
