'use client'

import { ExternalLink, FileText, AlertTriangle } from 'lucide-react'
import type { Application, HiringRequest, ScreeningAnswer } from '@/lib/types/database'
import { Card } from '@/components/ui/card'
import PhoneScreenAvailability from './PhoneScreenAvailability'

type ApplicationWithJobInfo = Application & {
  hiring_requests: Pick<HiringRequest, 'id' | 'position_title' | 'department' | 'ticket_number' | 'key_requirements' | 'nice_to_haves' | 'team_context'> | null
}

interface FormsTabProps {
  applications: ApplicationWithJobInfo[]
}

// Render one screening answer's value in plain text. Multi-select answers arrive
// as arrays; empty/null answers show an em-dash so a skipped question is obvious.
function formatAnswer(value: ScreeningAnswer['value']): string {
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—'
  const v = (value ?? '').toString().trim()
  return v.length ? v : '—'
}

export default function FormsTab({ applications }: FormsTabProps) {
  if (applications.length === 0) {
    return (
      <div className="flex flex-col items-center py-12 text-center px-4">
        <FileText className="h-8 w-8 text-slate-200 mb-2" />
        <p className="text-sm text-slate-400">No job forms available</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4 overflow-y-auto">
      {applications.map(app => {
        const job = app.hiring_requests
        const answers = app.screening_answers ?? []
        const hasIntake = !!(job?.key_requirements || job?.nice_to_haves || job?.team_context)
        return (
          <Card key={app.id} className="overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{job?.position_title ?? 'Application'}</p>
                {job?.department && <p className="text-xs text-slate-400 mt-0.5">{job.department}</p>}
              </div>
              {job?.id && (
                <a
                  href={`/jobs/${job.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-800 shrink-0"
                >
                  View Job <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            <div className="px-4 py-3 space-y-4">
              {/* Candidate's application answers — the primary content. */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Application Answers</p>
                {app.knockout_failed && (
                  <div className="flex items-center gap-1.5 rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1.5 mb-2.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                    <span className="text-xs font-medium text-amber-700">Answered a disqualifying (knockout) question</span>
                  </div>
                )}
                {answers.length > 0 ? (
                  <div className="space-y-2.5">
                    {answers.map((a, i) => (
                      <div key={a.field_id || i}>
                        <p className="text-xs font-medium text-slate-500 leading-snug">{a.label}</p>
                        <p className="text-sm text-slate-800 whitespace-pre-line leading-relaxed">{formatAnswer(a.value)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 italic">No screening questions were answered for this application.</p>
                )}
              </div>

              {/* Times the candidate submitted for their AI phone screen, if any. */}
              <PhoneScreenAvailability applicationId={app.id} />

              {/* Job intake context, when the linked requisition carries it. */}
              {hasIntake && (
                <div className="pt-3 border-t border-slate-100 space-y-3">
                  {job?.key_requirements && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Key Requirements</p>
                      <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{job.key_requirements}</p>
                    </div>
                  )}
                  {job?.nice_to_haves && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Nice to Haves</p>
                      <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{job.nice_to_haves}</p>
                    </div>
                  )}
                  {job?.team_context && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Team Context</p>
                      <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{job.team_context}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        )
      })}
    </div>
  )
}
