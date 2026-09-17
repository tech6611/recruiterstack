'use client'

import { Clock, ArrowRight } from 'lucide-react'
import type { ApplicationEvent } from '@/lib/types/database'
import { fmtRelative, fmtDateTime } from '@/lib/ui/date-utils'
import { avatarColor, initials } from '@/lib/ui/avatar'
import {
  getEventDisplay, getActorDisplay, isBoilerplateNote, TONE_SOFT, SystemActorIcon,
} from '../event-display'

interface FeedTabProps {
  events: ApplicationEvent[]
}

/** "Today" / "Yesterday" / "12 Sep 2026" — used as section headers. */
function dayLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' })
}

function groupByDay(events: ApplicationEvent[]): { label: string; items: ApplicationEvent[] }[] {
  const sorted = [...events].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  const groups: { label: string; items: ApplicationEvent[] }[] = []
  for (const e of sorted) {
    const label = dayLabel(e.created_at)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.items.push(e)
    else groups.push({ label, items: [e] })
  }
  return groups
}

function StageChip({ name }: { name: string }) {
  return (
    <span className="inline-flex max-w-[9rem] items-center truncate rounded-md bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200">
      {name}
    </span>
  )
}

function ActorAvatar({ createdBy }: { createdBy: string | null }) {
  const actor = getActorDisplay(createdBy)
  if (actor.isSystem) {
    return (
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-100 text-slate-500" aria-hidden>
        <SystemActorIcon className="h-2.5 w-2.5" />
      </span>
    )
  }
  return (
    <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold ${avatarColor(actor.label)}`} aria-hidden>
      {initials(actor.label)}
    </span>
  )
}

export default function FeedTab({ events }: FeedTabProps) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center py-12 text-center px-4">
        <Clock className="h-8 w-8 text-slate-200 mb-2" />
        <p className="text-sm text-slate-400">No activity yet</p>
      </div>
    )
  }

  const groups = groupByDay(events)

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3">
      {groups.map(group => (
        <section key={group.label} className="mb-4 last:mb-0">
          <div className="sticky top-0 z-10 -mx-4 mb-2 bg-white/95 px-4 py-1 backdrop-blur">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{group.label}</span>
          </div>

          <ol className="relative">
            {/* connecting line */}
            <div className="absolute left-[15px] top-2 bottom-2 w-px bg-slate-100" aria-hidden />

            {group.items.map(event => {
              const d = getEventDisplay(event)
              const actor = getActorDisplay(event.created_by)
              const note = event.note && !isBoilerplateNote(event.note) ? event.note : null
              return (
                <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
                  <div className={`relative z-10 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 ${TONE_SOFT[d.tone]}`}>
                    <d.Icon className="h-4 w-4" />
                  </div>

                  <div className="min-w-0 flex-1 pt-1">
                    <p className="text-sm font-medium leading-snug text-slate-800">{d.title}</p>

                    {d.stageMove && (d.stageMove.from || d.stageMove.to) && (
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {d.stageMove.from && <StageChip name={d.stageMove.from} />}
                        {d.stageMove.from && d.stageMove.to && <ArrowRight className="h-3 w-3 text-slate-300" aria-hidden />}
                        {d.stageMove.to && <StageChip name={d.stageMove.to} />}
                      </div>
                    )}

                    {d.detail && <p className="mt-0.5 text-xs text-slate-500">{d.detail}</p>}

                    {note && (
                      <p className="mt-1.5 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
                        {note}
                      </p>
                    )}

                    <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-400" title={fmtDateTime(event.created_at)}>
                      <ActorAvatar createdBy={event.created_by} />
                      <span className="truncate">{actor.label}</span>
                      <span aria-hidden>·</span>
                      <span className="shrink-0">{fmtRelative(event.created_at)}</span>
                    </p>
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      ))}
    </div>
  )
}
