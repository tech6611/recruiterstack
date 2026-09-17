import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { Candidate, Application, ApplicationEvent, HiringRequest } from '@/lib/types/database'

export interface CandidateWithPipeline extends Candidate {
  applications: (Application & {
    pipeline_stages: { name: string; color: string } | null
    hiring_requests: Pick<HiringRequest, 'id' | 'position_title' | 'department' | 'ticket_number' | 'key_requirements' | 'nice_to_haves' | 'team_context' | 'hiring_manager_name' | 'hiring_manager_email'> | null
  })[]
  events: (ApplicationEvent & { application_id: string })[]
}

/** Why the last load produced no candidate. `null` while loading or on success. */
export type CandidateLoadError = 'not_found' | 'failed'

/** Non-OK statuses worth one silent retry: auth token mid-refresh (401/403),
 *  rate limit (429), cold start / transient server error (5xx). A 404 is never
 *  retried — it's the one answer that means what it says. */
const RETRYABLE = (status: number) => status === 401 || status === 403 || status === 429 || status >= 500
const RETRY_DELAY_MS = 800

export function useCandidate(id: string) {
  const [candidate, setCandidate] = useState<CandidateWithPipeline | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<CandidateLoadError | null>(null)
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null)
  const appIdInitialised = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // One automatic retry on transient failures; a thrown fetch (network drop)
      // counts as transient too. Only a real 404 becomes "not found".
      let res: Response | null = null
      for (let attempt = 0; attempt < 2; attempt++) {
        try { res = await fetch(`/api/candidates/${id}`) } catch { res = null }
        if (res && (res.ok || !RETRYABLE(res.status))) break
        if (attempt === 0) await new Promise(r => setTimeout(r, RETRY_DELAY_MS))
      }
      // Guard against error responses: a 5xx returns an HTML error page, not
      // JSON, so res.json() would throw and leave the page stuck on "Loading…".
      if (!res || !res.ok) {
        setCandidate(null)
        setError(res?.status === 404 ? 'not_found' : 'failed')
        return
      }
      const json = await res.json()
      const data: CandidateWithPipeline | null = json.data ?? null
      setCandidate(data)
      if (!data) setError('not_found')
      // Initialise selectedAppId on first load (same React 18 batch - no null flash)
      if (data && !appIdInitialised.current) {
        appIdInitialised.current = true
        // Default to the application the candidate is furthest along in (highest
        // pipeline stage) among active ones — not just the most-recently-added.
        const active = data.applications.filter(a => a.status === 'active')
        const pool = active.length ? active : data.applications
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stageOrder = (a: any) => (a.pipeline_stages?.order_index ?? -1) as number
        const def = pool.reduce((best, a) => (stageOrder(a) > stageOrder(best) ? a : best), pool[0])
        setSelectedAppId(def?.id ?? null)
      }
    } catch {
      setCandidate(null)
      setError('failed')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  const activeApps = useMemo(
    () => candidate?.applications.filter(a => a.status === 'active') ?? [],
    [candidate],
  )

  return { candidate, loading, error, selectedAppId, setSelectedAppId, setCandidate, activeApps, reload: load }
}
