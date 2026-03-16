'use client'

import { Wand2, Send, Mail } from 'lucide-react'
import type { ApplicationEvent, Application, HiringRequest } from '@/lib/types/database'

type ApplicationWithHiringRequest = Application & {
  hiring_requests: Pick<HiringRequest, 'id' | 'position_title' | 'department' | 'ticket_number'> | null
}

interface EmailsTabProps {
  applications: ApplicationWithHiringRequest[]
  emailEvents: ApplicationEvent[]
  onDraftEmail: (appId: string) => void
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function EmailsTab({ applications, emailEvents, onDraftEmail }: EmailsTabProps) {
  const activeApps = applications

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Emails</span>
        {activeApps.length > 0 && (
          <button
            onClick={() => onDraftEmail(activeApps[0].id)}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Wand2 className="h-3 w-3 text-violet-500" /> Draft Email
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {emailEvents.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <Mail className="h-8 w-8 text-slate-200 mb-2" />
            <p className="text-sm text-slate-400">No emails sent yet</p>
            <p className="text-xs text-slate-400 mt-1">Draft an AI-powered email above</p>
          </div>
        ) : emailEvents.map(e => (
          <div key={e.id} className="rounded-xl border border-slate-100 bg-white px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <Send className="h-3 w-3" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-700 font-medium">Email sent</p>
                {e.note && <p className="text-xs text-slate-500 mt-0.5 truncate">{e.note}</p>}
                <p className="text-[10px] text-slate-400 mt-0.5">{e.created_by} · {fmtDate(e.created_at)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
