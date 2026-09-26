'use client'

import { useCallback, useEffect, useState } from 'react'
import { Briefcase, RefreshCw, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useCandidateProfile } from '../CandidateProfileContext'
import { ExperienceTimeline } from '../ExperienceTimeline'
import { EducationList, type EducationEntry } from '../EducationList'
import type { WorkRole } from '@/lib/ui/work-history'

interface History {
  experiences: WorkRole[]
  education: EducationEntry[]
  enriched_at: string | null
}

/**
 * Sourcing Brain, Slice 0 — the structured, dated career history extracted from the
 * résumé. Presentation now matches the market (Juicebox): roles grouped under one
 * employer logo, promotions marked, a duration on every span, and a header that says
 * how long and how settled.
 *
 * WHAT CHANGED AND WHY. This panel used to print a flat bullet list plus three
 * "movability" chips. The chips said things the timeline now says better — total
 * experience and average tenure moved into the section header, and current tenure is
 * simply the duration on the current role — so they were removed rather than shown
 * twice. The roles' own `summary` text was being fetched and thrown away; it is now
 * displayed, which is most of what a recruiter actually reads.
 */
export function CandidateHistoryPanel({ candidateId }: { candidateId: string }) {
  const [history, setHistory] = useState<History | null>(null)
  const [loading, setLoading] = useState(true)
  const [enriching, setEnriching] = useState(false)
  // Enrichment also fills current_title / current_company on the candidate row —
  // reload the profile so the header (left panel) picks them up right away.
  const { reload: reloadProfile } = useCandidateProfile()

  const load = useCallback(() => {
    fetch(`/api/candidates/${candidateId}/enrich`)
      .then((r) => (r.ok ? r.json() : { data: null }))
      .then((j) => setHistory(j.data ?? null))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [candidateId])
  useEffect(() => { load() }, [load])

  async function enrich() {
    setEnriching(true)
    const res = await fetch(`/api/candidates/${candidateId}/enrich`, { method: 'POST' })
    setEnriching(false)
    const j = await res.json().catch(() => ({}))
    if (!res.ok || j.data?.status === 'error') {
      toast.error('Enrichment failed — is the résumé a text-readable PDF?')
      return
    }
    if (j.data?.status === 'enriched') {
      toast.success(`Extracted ${j.data.roles} roles from the résumé.`)
      load()
      void reloadProfile()
    } else {
      toast(`Skipped: ${j.data?.reason?.replace(/_/g, ' ') ?? 'no résumé to read'}.`)
    }
  }

  if (loading) return null

  const experiences = history?.experiences ?? []
  const education = history?.education ?? []
  const hasData = experiences.length > 0 || education.length > 0

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Briefcase className="h-4 w-4 text-slate-400" /> Career history
        </div>
        <button
          onClick={enrich}
          disabled={enriching}
          className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {enriching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {hasData ? 'Re-extract' : 'Extract from résumé'}
        </button>
      </div>

      <div className="px-5 py-4">
        {!hasData ? (
          <p className="text-xs text-slate-500">
            No structured history yet. Click <strong>Extract from résumé</strong> to pull the dated
            work history and education from this candidate&rsquo;s CV.
          </p>
        ) : (
          <div className="space-y-6">
            <ExperienceTimeline roles={experiences} />
            <EducationList education={education} />
          </div>
        )}
      </div>
    </div>
  )
}
