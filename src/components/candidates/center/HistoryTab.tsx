'use client'

/**
 * HistoryTab — shows a candidate's complete journey through the recruitment pipeline.
 * All platform actions (applications, stage moves, interviews, emails, offers, notes)
 * appear here in chronological order as a rich visual timeline.
 */

import {
  Send, ChevronRight, FileText, Calendar,
  BadgeCheck, Ban, Gift, ClipboardList, Clock,
  AlertCircle, Mail, Users, GitBranch, Phone,
} from 'lucide-react'
import type { ApplicationEvent, Application, HiringRequest } from '@/lib/types/database'
import { fmtRelative, fmtDateTime } from '@/lib/ui/date-utils'

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
  subtitle?: string
  note?: string
  jobTitle?: string
}

const EVENT_ICON: Record<string, { icon: React.ReactNode; bg: string; title: (e: ApplicationEvent) => string }> = {
  applied:              { icon: <Send className="h-3.5 w-3.5" />,         bg: 'bg-blue-500',    title: e => `Applied — entered ${e.to_stage ?? 'pipeline'}` },
  stage_moved:          { icon: <ChevronRight className="h-3.5 w-3.5" />, bg: 'bg-violet-500',  title: e => `Moved to ${e.to_stage ?? '?'}${e.from_stage ? ` from ${e.from_stage}` : ''}` },
  note_added:           { icon: <FileText className="h-3.5 w-3.5" />,     bg: 'bg-amber-500',   title: () => 'Note added' },
  status_changed:       { icon: <AlertCircle className="h-3.5 w-3.5" />,  bg: 'bg-slate-500',   title: e => `Status changed → ${e.to_stage ?? '?'}` },
  email_sent:           { icon: <Mail className="h-3.5 w-3.5" />,         bg: 'bg-blue-500',    title: e => `Email sent${(e.metadata as { subject?: string })?.subject ? ` · ${(e.metadata as { subject?: string }).subject}` : ''}` },
  interview_scheduled:  { icon: <Calendar className="h-3.5 w-3.5" />,     bg: 'bg-amber-500',   title: () => 'Interview scheduled' },
  interview_completed:  { icon: <BadgeCheck className="h-3.5 w-3.5" />,   bg: 'bg-emerald-500', title: () => 'Interview completed' },
  interview_cancelled:  { icon: <Ban className="h-3.5 w-3.5" />,          bg: 'bg-red-400',     title: () => 'Interview cancelled' },
  offer_created:        { icon: <Gift className="h-3.5 w-3.5" />,         bg: 'bg-violet-500',  title: () => 'Offer created' },
  offer_approved:       { icon: <BadgeCheck className="h-3.5 w-3.5" />,   bg: 'bg-emerald-500', title: () => 'Offer approved' },
  offer_sent:           { icon: <Send className="h-3.5 w-3.5" />,         bg: 'bg-blue-500',    title: () => 'Offer sent to candidate' },
  offer_accepted:       { icon: <BadgeCheck className="h-3.5 w-3.5" />,   bg: 'bg-emerald-600', title: () => 'Offer accepted 🎉' },
  offer_declined:       { icon: <Ban className="h-3.5 w-3.5" />,          bg: 'bg-red-500',     title: () => 'Offer declined' },
  assessment_sent:      { icon: <ClipboardList className="h-3.5 w-3.5" />,bg: 'bg-amber-500',   title: () => 'Assessment sent' },
  rejected:             { icon: <Ban className="h-3.5 w-3.5" />,          bg: 'bg-red-500',     title: () => 'Application rejected' },
  scorecard_added:      { icon: <ClipboardList className="h-3.5 w-3.5" />,bg: 'bg-violet-500',  title: () => 'Scorecard submitted' },
  referral_added:       { icon: <Users className="h-3.5 w-3.5" />,        bg: 'bg-pink-500',    title: () => 'Referral added' },
  phone_screen_started: { icon: <Phone className="h-3.5 w-3.5" />,        bg: 'bg-blue-500',    title: () => 'AI phone screen initiated' },
  phone_screen:         { icon: <Phone className="h-3.5 w-3.5" />,        bg: 'bg-emerald-500', title: e => `AI phone screen completed${(e.metadata as { ai_score?: number })?.ai_score != null ? ` — Score: ${(e.metadata as { ai_score?: number }).ai_score}/100` : ''}` },
}

// Build a synthetic "added to pipeline" event per application
function buildTimelineItems(
  events: ApplicationEvent[],
  applications: ApplicationWithJob[]
): TimelineEvent[] {
  const appById: Record<string, ApplicationWithJob> = {}
  for (const a of applications) appById[a.id] = a

  const items: TimelineEvent[] = events.map(e => {
    const cfg = EVENT_ICON[e.event_type]
    const app = appById[e.application_id]
    return {
      id:       e.id,
      date:     e.created_at,
      icon:     cfg?.icon ?? <Clock className="h-3.5 w-3.5" />,
      iconBg:   cfg?.bg   ?? 'bg-slate-400',
      title:    cfg ? cfg.title(e) : e.event_type,
      note:     e.note ?? undefined,
      jobTitle: app?.hiring_requests?.position_title ?? undefined,
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

export default function HistoryTab({ events, applications }: FunnelTabProps) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-center px-6">
        <div className="h-12 w-12 rounded-xl bg-violet-50 flex items-center justify-center mb-3">
          <GitBranch className="h-6 w-6 text-violet-400" />
        </div>
        <p className="text-sm font-medium text-slate-600">No pipeline activity yet</p>
        <p className="text-xs text-slate-400 mt-1">Events will appear here as the candidate moves through the process</p>
      </div>
    )
  }

  const timeline = buildTimelineItems(events, applications)
  const groups   = groupByMonth(timeline)
  const totalEvents = timeline.length

  return (
    <div className="p-5 space-y-6">

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
                      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 hover:border-slate-300 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800">{item.title}</p>
                            {item.jobTitle && (
                              <p className="text-[10px] text-violet-500 font-medium mt-0.5">{item.jobTitle}</p>
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
                          </div>
                        </div>
                      </div>
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
