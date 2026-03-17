'use client'

import { useState } from 'react'
import { Wand2, Mail, ChevronDown, ChevronUp } from 'lucide-react'
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
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

interface EmailMeta {
  subject?:    string
  body?:       string
  body_html?:  string
  to_email?:   string
  to_emails?:  string[]
  to_name?:    string
  cc_emails?:  string[]
  bcc_emails?: string[]
  from_email?: string
  from_name?:  string
  scheduled?:  string | null
}

function EmailCard({ event }: { event: ApplicationEvent }) {
  const [expanded, setExpanded] = useState(false)
  const meta = (event.metadata ?? {}) as EmailMeta

  const subject   = meta.subject   || event.note  || 'Email'
  const bodyHtml  = meta.body_html || null
  const bodyText  = meta.body      || null
  const hasBody   = !!(bodyHtml || bodyText)
  const fromName  = meta.from_name || event.created_by || 'Recruiter'
  const fromEmail = meta.from_email || null
  const toList    = meta.to_emails?.length ? meta.to_emails : (meta.to_email ? [meta.to_email] : [])
  const toName    = meta.to_name   || null
  const ccList    = meta.cc_emails  || []
  const scheduled = meta.scheduled  || null

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* Email header row */}
      <button
        className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors"
        onClick={() => hasBody && setExpanded(e => !e)}
      >
        <div className="flex items-start gap-3">
          {/* Mail icon */}
          <div className="h-7 w-7 rounded-full bg-blue-50 flex items-center justify-center shrink-0 mt-0.5">
            <Mail className="h-3.5 w-3.5 text-blue-500" />
          </div>

          <div className="flex-1 min-w-0">
            {/* From */}
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-800 truncate">
                {fromName}
                {fromEmail && (
                  <span className="font-normal text-slate-400 ml-1">(as {fromEmail})</span>
                )}
              </p>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-[10px] text-slate-400 whitespace-nowrap">{fmtDate(event.created_at)}</span>
                {hasBody && (
                  expanded
                    ? <ChevronUp className="h-3 w-3 text-slate-400" />
                    : <ChevronDown className="h-3 w-3 text-slate-400" />
                )}
              </div>
            </div>

            {/* To + CC + Scheduled badge */}
            {toList.length > 0 && (
              <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                to: {toName && toList.length === 1 ? `${toName} <${toList[0]}>` : toList.join(', ')}
                {ccList.length > 0 && <span className="ml-2">cc: {ccList.join(', ')}</span>}
              </p>
            )}
            {scheduled && (
              <span className="inline-flex items-center gap-0.5 mt-0.5 rounded-full bg-violet-50 border border-violet-200 px-1.5 py-0.5 text-[9px] font-semibold text-violet-600">
                🕐 Scheduled · {new Date(scheduled).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}

            {/* Subject */}
            <p className="text-sm font-semibold text-slate-900 mt-1.5 leading-snug">{subject}</p>
          </div>
        </div>
      </button>

      {/* Body (expandable) */}
      {expanded && hasBody && (
        <div className="border-t border-slate-100 px-4 py-4 bg-white">
          {bodyHtml ? (
            <div
              className="text-sm text-slate-700 leading-relaxed prose prose-sm max-w-none
                [&_p]:my-1 [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4
                [&_li]:my-0.5 [&_strong]:font-semibold [&_em]:italic [&_u]:underline
                [&_s]:line-through [&_h1]:text-base [&_h1]:font-bold [&_h2]:text-sm [&_h2]:font-semibold
                [&_a]:text-blue-600 [&_a]:underline"
              dangerouslySetInnerHTML={{ __html: bodyHtml }}
            />
          ) : (
            <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{bodyText}</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function EmailsTab({ applications, emailEvents, onDraftEmail }: EmailsTabProps) {
  const activeApps = applications

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
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

      {/* Email list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {emailEvents.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <Mail className="h-8 w-8 text-slate-200 mb-2" />
            <p className="text-sm text-slate-400">No emails sent yet</p>
            <p className="text-xs text-slate-400 mt-1">Use &ldquo;Draft Email&rdquo; above to compose one</p>
          </div>
        ) : (
          emailEvents
            .slice()
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .map(e => <EmailCard key={e.id} event={e} />)
        )}
      </div>
    </div>
  )
}
