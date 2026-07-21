import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { Candidate, Application, ApplicationEvent, HiringRequest } from '@/lib/types/database'

export interface CandidateWithPipeline extends Candidate {
  applications: (Application & {
    pipeline_stages: { name: string; color: string } | null
    hiring_requests: Pick<HiringRequest, 'id' | 'position_title' | 'department' | 'ticket_number' | 'key_requirements' | 'nice_to_haves' | 'team_context' | 'hiring_manager_name' | 'hiring_manager_email'> | null
  })[]
  events: (ApplicationEvent & { application_id: string })[]
}

export function useCandidate(id: string) {
  const [candidate, setCandidate] = useState<CandidateWithPipeline | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null)
  const appIdInitialised = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/candidates/${id}`)
      // Guard against error responses: without this, a 5xx (which returns an HTML
      // error page, not JSON) makes res.json() throw and leaves the page stuck on
      // "Loading…" forever instead of surfacing the error.
      if (!res.ok) { setCandidate(null); return }
      const json = await res.json()
      const data: CandidateWithPipeline | null = json.data ?? null
      setCandidate(data)
      // Initialise selectedAppId on first load (same React 18 batch - no null flash)
      if (data && !appIdInitialised.current) {
        appIdInitialised.current = true
        const def = data.applications.find(a => a.status === 'active') ?? data.applications[0]
        setSelectedAppId(def?.id ?? null)
      }
    } catch {
      setCandidate(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  const activeApps = useMemo(
    () => candidate?.applications.filter(a => a.status === 'active') ?? [],
    [candidate],
  )

  return { candidate, loading, selectedAppId, setSelectedAppId, setCandidate, activeApps, reload: load }
}
