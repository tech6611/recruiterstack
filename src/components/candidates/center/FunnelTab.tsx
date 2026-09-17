'use client'

/**
 * FunnelTab — shows a candidate's complete journey through the recruitment pipeline.
 * All platform actions (applications, stage moves, interviews, emails, offers, notes)
 * appear here in chronological order as a rich visual timeline.
 */

import { GitBranch, ArrowRight } from 'lucide-react'
import type { ApplicationEvent, Application, HiringRequest } from '@/lib/types/database'
import { fmtRelative, fmtDateTime } from '@/lib/ui/date-utils'
import { Card } from '@/components/ui/card'
import { getEventDisplay, getActorDisplay, isBoilerplateNote, TONE_SOLID } from '../event-display'

type ApplicationWithJob = Application & {
  pipeline_stages: { name: string; color: string } | null
  hiring_requests: Pick<HiringRequest, 'id' | 'position_title' | 'department' | 'ticket_number'> | null
}

interface FunnelTabProps {
  events: ApplicationEvent[]
  applications: ApplicationWithJob[]
}

interface TimelineEvent {
  id: string
  date: string
  icon: React.ReactNode
  iconBg: string
  title: string
  detail?: string
  stageMove?: { from: string | null; to: string | null }
  actor: string
  note?: string
  jobTitle?: string
}

// Build a synthetic "added to pipeline" event per application
function buildTimelineItems(
  events: ApplicationEvent[],
  applications: ApplicationWithJob[]
): TimelineEvent[] {
  const appById: Record<string, ApplicationWithJob> = {}
  for (const a of applications) appById[a.id] = a

  const items: TimelineEvent[] = events.map(e => {
    const d   = getEventDisplay(e)
    const app = appById[e.application_id]
    return {
      id:        e.id,
      date:      e.created_at,
      icon:      <d.Icon className="h-3.5 w-3.5" />,
      iconBg:    TONE_SOLID[d.tone],
      title:     d.title,
      detail:    d.detail,
      stageMove: d.stageMove,
      actor:     getActorDisplay(e.created_by).label,
      note:      e.note && !isBoilerplateNote(e.note) ? e.note : undefined,
      jobTitle:  app?.hiring_requests?.position_title ?? undefined,
    }
  })

  return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

// Group timeline items by month for section headers
function groupByMonth(items: TimelineEvent[]): { label: string; items: TimelineEvent[] }[] {
  const groups: Record<string, TimelineEvent[]> = {}
  for (const item of items) {
    const label = new Date(item.date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    if (!groups[label]) groups[label] = []
    groups[label].push(item)
  }
  return Object.entries(groups).map(([label, items]) => ({ label, items }))
}

export default function FunnelTab({ events, applications }: FunnelTabProps) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-center px-6">
        <div className="h-12 w-12 rounded-xl bg-slate-50 flex items-center justify-center mb-3">
          <GitBranch className="h-6 w-6 text-slate-400" />
        </div>
        <p className="text-sm font-medium text-slate-600">No pipeline activity yet</p>
        <p className="text-xs text-slate-400 mt-1">Events will appear here as the candidate moves through the process</p>
      </div>
    )
  }

  const timeline = buildTimelineItems(events, applications)
  const groups   = groupByMonth(timeline)

  // Summary stats
  const totalEvents    = timeline.length
  const stagesMoved    = events.filter(e => (e.event_type as string) === 'stage_moved').length
  const emailsSent     = events.filter(e => (e.event_type as string) === 'email_sent').length
  const interviewsDone = events.filter(e => (e.event_type as string) === 'interview_completed').length
  const firstEvent     = timeline[timeline.length - 1]
  const daysSince      = firstEvent
    ? Math.floor((Date.now() - new Date(firstEvent.date).getTime()) / 86400000)
    : 0

  return (
    <div className="p-5 space-y-6">

      {/* ── Stats bar ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Days in pipeline', value: daysSince },
          { label: 'Stage moves',       value: stagesMoved },
          { label: 'Emails sent',        value: emailsSent },
          { label: 'Interviews done',    value: interviewsDone },
        ].map(stat => (
          <Card key={stat.label} className="px-3 py-3 text-center">
            <p className="text-xl font-bold text-slate-900">{stat.value}</p>
            <p className="text-[10px] text-slate-400 leading-tight mt-0.5">{stat.label}</p>
          </Card>
        ))}
      </div>

      {/* ── Timeline ─────────────────────────────────────────────────────── */}
      <div className="space-y-6">
        {groups.map(group => (
          <div key={group.label}>
            {/* Month header */}
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{group.label}</span>
              <div className="flex-1 h-px bg-slate-100" />
              <span className="text-[10px] text-slate-300">{group.items.length} event{group.items.length > 1 ? 's' : ''}</span>
            </div>

            {/* Event rows */}
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-[13px] top-0 bottom-0 w-px bg-slate-100" />

              <div className="space-y-0">
                {group.items.map((item, idx) => (
                  <div key={item.id} className="relative flex gap-4">
                    {/* Icon */}
                    <div className={`relative z-10 h-7 w-7 rounded-full ${item.iconBg} flex items-center justify-center shrink-0 text-white mt-2.5`}>
                      {item.icon}
                    </div>

                    {/* Content */}
                    <div className={`flex-1 min-w-0 ${idx < group.items.length - 1 ? 'pb-4' : ''}`}>
                      <Card className="px-4 py-3 hover:border-slate-300 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800">{item.title}</p>
                            {item.stageMove && (item.stageMove.from || item.stageMove.to) && (
                              <div className="mt-1 flex flex-wrap items-center gap-1">
                                {item.stageMove.from && <span className="rounded-md bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200">{item.stageMove.from}</span>}
                                {item.stageMove.from && item.stageMove.to && <ArrowRight className="h-3 w-3 text-slate-300" aria-hidden />}
                                {item.stageMove.to && <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-100">{item.stageMove.to}</span>}
                              </div>
                            )}
                            {item.detail && <p className="text-xs text-slate-500 mt-0.5">{item.detail}</p>}
                            {item.jobTitle && (
                              <p className="text-[10px] text-slate-500 font-medium mt-0.5">{item.jobTitle}</p>
                            )}
                            {item.note && (
                              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                                {item.note}
                              </p>
                            )}
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-[10px] text-slate-400 whitespace-nowrap">{fmtRelative(item.date)}</p>
                            <p className="text-[9px] text-slate-300 mt-0.5 whitespace-nowrap">{fmtDateTime(item.date)}</p>
                            <p className="text-[9px] text-slate-400 mt-0.5 whitespace-nowrap">by {item.actor}</p>
                          </div>
                        </div>
                      </Card>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="text-center text-[10px] text-slate-300">{totalEvents} total event{totalEvents > 1 ? 's' : ''} recorded</p>
    </div>
  )
}
