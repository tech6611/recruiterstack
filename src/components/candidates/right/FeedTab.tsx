'use client'

import {
  Send, ChevronRight, FileText, AlertCircle, Calendar,
  BadgeCheck, Ban, Gift, ClipboardList, Clock,
} from 'lucide-react'
import type { ApplicationEvent } from '@/lib/types/database'
import { fmtRelative, fmtDate } from '@/lib/ui/date-utils'

const EVENT_CONFIG: Record<string, { label: (e: ApplicationEvent) => string; icon: React.ReactNode; color: string }> = {
  applied: {
    label: e => `Applied · entered ${e.to_stage ?? 'pipeline'}`,
    icon: <Send className="h-3.5 w-3.5" />,
    color: 'bg-blue-50 text-blue-600',
  },
  stage_moved: {
    label: e => `Moved to ${e.to_stage ?? '?'}${e.from_stage ? ` from ${e.from_stage}` : ''}`,
    icon: <ChevronRight className="h-3.5 w-3.5" />,
    color: 'bg-violet-50 text-violet-600',
  },
  note_added: {
    label: () => 'Note added',
    icon: <FileText className="h-3.5 w-3.5" />,
    color: 'bg-amber-50 text-amber-600',
  },
  status_changed: {
    label: e => `Status → ${e.to_stage ?? '?'}`,
    icon: <AlertCircle className="h-3.5 w-3.5" />,
    color: 'bg-slate-100 text-slate-600',
  },
  email_sent: {
    label: () => 'Email sent',
    icon: <Send className="h-3.5 w-3.5" />,
    color: 'bg-blue-50 text-blue-600',
  },
  interview_scheduled: {
    label: e => `Interview scheduled — ${e.note ? '' : 'see details'}`,
    icon: <Calendar className="h-3.5 w-3.5" />,
    color: 'bg-amber-50 text-amber-600',
  },
  interview_completed: {
    label: () => 'Interview completed',
    icon: <BadgeCheck className="h-3.5 w-3.5" />,
    color: 'bg-emerald-50 text-emerald-600',
  },
  interview_cancelled: {
    label: () => 'Interview cancelled',
    icon: <Ban className="h-3.5 w-3.5" />,
    color: 'bg-red-50 text-red-600',
  },
  offer_created: {
    label: () => 'Offer created',
    icon: <Gift className="h-3.5 w-3.5" />,
    color: 'bg-violet-50 text-violet-600',
  },
  offer_approved: {
    label: () => 'Offer approved',
    icon: <BadgeCheck className="h-3.5 w-3.5" />,
    color: 'bg-emerald-50 text-emerald-600',
  },
  offer_sent: {
    label: () => 'Offer sent to candidate',
    icon: <Send className="h-3.5 w-3.5" />,
    color: 'bg-blue-50 text-blue-600',
  },
  offer_accepted: {
    label: () => 'Offer accepted 🎉',
    icon: <BadgeCheck className="h-3.5 w-3.5" />,
    color: 'bg-emerald-100 text-emerald-700',
  },
  offer_declined: {
    label: () => 'Offer declined',
    icon: <Ban className="h-3.5 w-3.5" />,
    color: 'bg-red-50 text-red-600',
  },
  assessment_sent: {
    label: () => 'Assessment sent',
    icon: <ClipboardList className="h-3.5 w-3.5" />,
    color: 'bg-amber-50 text-amber-600',
  },
  rejected: {
    label: e => `Rejected${e.note ? '' : ''}`,
    icon: <Ban className="h-3.5 w-3.5" />,
    color: 'bg-red-50 text-red-600',
  },
}

interface FeedTabProps {
  events: ApplicationEvent[]
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

  return (
    <div className="p-4 space-y-4">
      {events.map(event => {
        const cfg = EVENT_CONFIG[event.event_type]
        return (
          <div key={event.id} className="flex gap-3">
            <div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${cfg?.color ?? 'bg-slate-100 text-slate-600'}`}>
              {cfg?.icon ?? <Clock className="h-3.5 w-3.5" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-700">
                {cfg?.label(event) ?? event.event_type}
                {event.note && (
                  <span className="block mt-1 text-sm text-slate-500 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                    {event.note}
                  </span>
                )}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {event.created_by} · {fmtRelative(event.created_at)}
                <span className="ml-1 text-slate-300">· {fmtDate(event.created_at)}</span>
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
