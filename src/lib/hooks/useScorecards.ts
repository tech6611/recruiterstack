import { useState, useCallback } from 'react'
import type { Scorecard } from '@/lib/types/database'
import type { CandidateWithPipeline } from './useCandidate'

export function useScorecards() {
  const [scorecards, setScorecards] = useState<Map<string, Scorecard[]>>(new Map())
  const [scorecardsLoading, setScorecardsLoading] = useState(false)

  const loadScorecards = useCallback(async (activeApps: CandidateWithPipeline['applications']) => {
    if (activeApps.length === 0) return
    setScorecardsLoading(true)
    const results = await Promise.all(
      activeApps.map(app =>
        fetch(`/api/scorecards?application_id=${app.id}`)
          .then(r => r.json())
          .then(j => ({ appId: app.id, data: (j.data ?? []) as Scorecard[] }))
      )
    )
    const map = new Map<string, Scorecard[]>()
    for (const { appId, data } of results) map.set(appId, data)
    setScorecards(map)
    setScorecardsLoading(false)
  }, [])

  const handleScorecardDeleted = useCallback((scorecardId: string, appId: string) => {
    setScorecards(prev => {
      const next = new Map(prev)
      const current = next.get(appId) ?? []
      next.set(appId, current.filter(s => s.id !== scorecardId))
      return next
    })
  }, [])

  return { scorecards, scorecardsLoading, loadScorecards, handleScorecardDeleted }
}
