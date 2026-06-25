'use client'

import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useState } from 'react'
import { BadgeCheck, Briefcase, Calendar, Check, DollarSign, GitBranch, LogOut, StickyNote, X } from 'lucide-react'
import { flags } from '@/lib/flags'
import type { EmploymentEventType } from '@/lib/types/database'

type MeEvent = {
  id: string
  event_type: EmploymentEventType
  details: Record<string, unknown> | null
  occurred_at: string
}

const META: Record<EmploymentEventType, { icon: typeof BadgeCheck; tone: string; ring: string; title: string }> = {
  hired:              { icon: Briefcase,  tone: 'text-amber-600',   ring: 'ring-amber-200',   title: 'Hired (pre-hire)' },
  joined:             { icon: BadgeCheck, tone: 'text-emerald-600', ring: 'ring-emerald-200', title: 'Joined the org' },
  manager_changed:    { icon: GitBranch,  tone: 'text-slate-600',    ring: 'ring-slate-200',    title: 'Manager changed' },
  comp_changed:       { icon: DollarSign, tone: 'text-emerald-600', ring: 'ring-emerald-200', title: 'Compensation changed' },
  terminated:         { icon: LogOut,     tone: 'text-slate-500',   ring: 'ring-slate-200',   title: 'Terminated' },
  note:               { icon: StickyNote, tone: 'text-slate-600',   ring: 'ring-slate-200',   title: 'Note' },
  time_off_requested: { icon: Calendar,   tone: 'text-slate-600',    ring: 'ring-slate-200',    title: 'Time-off requested' },
  time_off_approved:  { icon: Check,      tone: 'text-emerald-600', ring: 'ring-emerald-200', title: 'Time-off approved' },
  time_off_rejected:  { icon: X,          tone: 'text-rose-600',    ring: 'ring-rose-200',    title: 'Time-off rejected' },
  time_off_cancelled: { icon: X,          tone: 'text-slate-500',   ring: 'ring-slate-200',   title: 'Time-off cancelled' },
}

function fmt(d: string) {
  return new Date(d).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function MyTimelinePage() {
  const { orgId } = useAuth()
  const [events, setEvents] = useState<MeEvent[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/me/timeline')
    if (res.ok) {
      const j = await res.json()
      setEvents((j.data ?? []) as MeEvent[])
    }
    setLoading(false)
  }, [])

  useEffect(() => { if (orgId) fetchAll() }, [fetchAll, orgId])

  if (!flags.hris) return <div className="p-8 text-sm text-slate-500">The HRIS module is not enabled.</div>

  return (
    <div className="p-8">
      <h1 className="mb-1 text-2xl font-bold tracking-tight text-slate-900">Your timeline</h1>
      <p className="mb-6 text-sm text-slate-500">
        Every employment event for you, in one place. Auto-logged by the data layer.
      </p>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        {loading ? (
          <p className="py-2 text-sm text-slate-400">Loading…</p>
        ) : events.length === 0 ? (
          <p className="py-2 text-sm text-slate-400">No events yet.</p>
        ) : (
          <ol className="relative space-y-5 border-l border-slate-200 pl-6">
            {events.map(e => {
              const m = META[e.event_type]
              const Icon = m.icon
              return (
                <li key={e.id} className="relative">
                  <span className={`absolute -left-[33px] flex h-6 w-6 items-center justify-center rounded-full bg-white ring-2 ${m.ring}`}>
                    <Icon className={`h-3.5 w-3.5 ${m.tone}`} />
                  </span>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-medium text-slate-900">{m.title}</p>
                    <p className="shrink-0 text-xs text-slate-400">{fmt(e.occurred_at)}</p>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </div>
  )
}
