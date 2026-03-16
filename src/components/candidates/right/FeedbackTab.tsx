'use client'

import { Plus, Loader2, Star } from 'lucide-react'
import type { Scorecard, Application, HiringRequest } from '@/lib/types/database'
import ScorecardCard from '../ScorecardCard'

type ApplicationWithHiringRequest = Application & {
  hiring_requests: Pick<HiringRequest, 'id' | 'position_title' | 'department' | 'ticket_number'> | null
}

interface FeedbackTabProps {
  applications: ApplicationWithHiringRequest[]
  scorecards: Map<string, Scorecard[]>
  scorecardsLoading: boolean
  onAddScorecard: (appId: string) => void
  onScorecardDeleted: (id: string, appId: string) => void
}

export default function FeedbackTab({
  applications,
  scorecards,
  scorecardsLoading,
  onAddScorecard,
  onScorecardDeleted,
}: FeedbackTabProps) {
  const activeApps = applications
  const totalScorecards = activeApps.reduce((sum, app) => sum + (scorecards.get(app.id)?.length ?? 0), 0)

  if (activeApps.length === 0) {
    return (
      <div className="flex flex-col items-center py-12 text-center px-4">
        <Star className="h-8 w-8 text-slate-200 mb-2" />
        <p className="text-sm text-slate-400">No active applications</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Scorecards</span>
          {totalScorecards > 0 && (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700">
              {totalScorecards}
            </span>
          )}
        </div>
        <button
          onClick={() => onAddScorecard(activeApps[0].id)}
          className="flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-violet-700 transition-colors"
        >
          <Plus className="h-3 w-3" /> Add Scorecard
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {scorecardsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
          </div>
        ) : totalScorecards === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-50 text-violet-400 mb-3">
              <Star className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-slate-600">No scorecards yet</p>
            <p className="text-xs text-slate-400 mt-1">Add structured feedback after interviews</p>
          </div>
        ) : (
          <div className="space-y-4">
            {activeApps.map(app => {
              const appScorecards = scorecards.get(app.id) ?? []
              if (appScorecards.length === 0) return null
              return (
                <div key={app.id}>
                  {activeApps.length > 1 && (
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                      {app.hiring_requests?.position_title}
                    </p>
                  )}
                  <div className="space-y-3">
                    {appScorecards.map(sc => (
                      <ScorecardCard
                        key={sc.id}
                        scorecard={sc}
                        onDelete={scId => onScorecardDeleted(scId, app.id)}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
