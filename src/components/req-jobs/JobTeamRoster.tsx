'use client'

import { useState, useEffect } from 'react'
import { Users, Loader2 } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { nameInitials } from '@/lib/team-members'
import type { ZonedStage } from '@/lib/types/pipeline-automations'

/**
 * "Team on this job" — built from the per-stage interview panels saved in the
 * pipeline plan (Interview plan tab → expand a stage → "Interview panel"), plus
 * the resolved hiring manager. One row per person; each is tagged with the
 * stage(s) they interview on. Shown in the Overview sidebar.
 */
export function JobTeamRoster({ jobId, hmRefreshKey = 0 }: {
  jobId: string
  /** Bump to re-fetch the resolved hiring manager (e.g. after the HM picker changes). */
  hmRefreshKey?: number
}) {
  const [stages, setStages]   = useState<ZonedStage[]>([])
  const [hm, setHm]           = useState<{ user_id: string | null; name: string | null; email: string | null; source: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetch(`/api/jobs/${jobId}/pipeline-plan`).then(r => r.json())
      .then(j => { if (alive) setStages((j?.data?.stages ?? []) as ZonedStage[]) })
      .catch(() => { if (alive) setStages([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [jobId])

  // Resolve the hiring manager (assigned real user, else intake).
  useEffect(() => {
    fetch(`/api/jobs/${jobId}/hiring-manager`).then(r => r.json())
      .then(j => setHm(j?.data ? { user_id: j.data.user_id ?? null, name: j.data.name ?? null, email: j.data.email ?? null, source: j.data.source ?? 'none' } : null))
      .catch(() => setHm(null))
  }, [jobId, hmRefreshKey])

  // Group panel members by email (case-insensitive), preserving stage order.
  const order: string[] = []
  const groups = new Map<string, { name: string; stages: string[] }>()
  for (const s of stages) {
    for (const m of s.interview_panel ?? []) {
      const key = m.email.trim().toLowerCase()
      if (!key) continue
      if (!groups.has(key)) { groups.set(key, { name: m.name || m.email, stages: [] }); order.push(key) }
      const g = groups.get(key)!
      if (!g.stages.includes(s.name)) g.stages.push(s.name)
    }
  }

  const hmName  = hm?.name ?? null
  const hmEmail = hm?.email ?? null
  const hasHM   = !!(hmName || hmEmail)
  const hmPill  = hm?.source === 'assigned' ? 'hiring manager' : 'from intake'
  const hmKey   = hmEmail ? hmEmail.trim().toLowerCase() : null
  const hmIsInterviewer = !!(hmKey && groups.has(hmKey))

  // One row per person. A hiring manager who also sits on a panel is merged into
  // that row and tagged by their stage(s); only a HM on no panel keeps the
  // "hiring manager" tag (the HM is already identified on the Overview anyway).
  const rows: { key: string; name: string; sub: string; pill: string }[] = []
  if (hasHM && !hmIsInterviewer) {
    rows.push({ key: 'hm', name: hmName || hmEmail || 'Hiring manager', sub: hmEmail && hmName ? hmEmail : 'Hiring manager', pill: hmPill })
  }
  for (const k of order) {
    const g = groups.get(k)!
    rows.push({
      key: k, name: g.name, sub: g.stages.join('  ·  '),
      pill: g.stages.length === 1 ? g.stages[0] : `${g.stages.length} stages`,
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
          <p className="py-2 text-sm text-slate-400">Add interviewers to a stage’s panel in the Interview plan tab to build the team.</p>
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
