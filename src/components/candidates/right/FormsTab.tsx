'use client'

import { ExternalLink, FileText } from 'lucide-react'
import type { Application, HiringRequest } from '@/lib/types/database'

type ApplicationWithJobInfo = Application & {
  hiring_requests: Pick<HiringRequest, 'id' | 'position_title' | 'department' | 'ticket_number' | 'key_requirements' | 'nice_to_haves' | 'team_context'> | null
}

interface FormsTabProps {
  applications: ApplicationWithJobInfo[]
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
    <div className="p-4 space-y-4">
      {applications.map(app => {
        const job = app.hiring_requests
        if (!job) return null
        return (
          <div key={app.id} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
              <div>
                <p className="text-sm font-semibold text-slate-800">{job.position_title}</p>
                {job.department && <p className="text-xs text-slate-400 mt-0.5">{job.department}</p>}
              </div>
              <a
                href={`/jobs/${job.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
              >
                View Job <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="px-4 py-3 space-y-3">
              {job.key_requirements && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Key Requirements</p>
                  <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{job.key_requirements}</p>
                </div>
              )}
              {job.nice_to_haves && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Nice to Haves</p>
                  <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{job.nice_to_haves}</p>
                </div>
              )}
              {job.team_context && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Team Context</p>
                  <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{job.team_context}</p>
                </div>
              )}
              {!job.key_requirements && !job.nice_to_haves && !job.team_context && (
                <p className="text-sm text-slate-400 italic">No intake form details available</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
