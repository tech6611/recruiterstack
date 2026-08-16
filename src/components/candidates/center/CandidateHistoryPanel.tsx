'use client'

import { useCallback, useEffect, useState } from 'react'
import { Briefcase, GraduationCap, RefreshCw, Loader2, Clock } from 'lucide-react'
import { toast } from 'sonner'

interface Exp { title: string | null; employer: string | null; location: string | null; start_date: string | null; end_date: string | null; is_current: boolean }
interface Edu { degree: string | null; field: string | null; school: string | null; year: number | null }
interface Movability { num_roles: number; current_tenure_months: number | null; total_experience_months: number | null; avg_tenure_months: number | null }
interface History { experiences: Exp[]; education: Edu[]; movability: Movability; enriched_at: string | null }

function dur(months: number | null): string {
  if (months == null) return '—'
  const y = Math.floor(months / 12), m = months % 12
  return [y ? `${y}y` : '', m ? `${m}mo` : ''].filter(Boolean).join(' ') || '0mo'
}
function ym(d: string | null): string {
  if (!d) return ''
  const dt = new Date(d)
  return dt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

/** Sourcing Brain, Slice 0 — the structured, dated career history extracted from the
 *  résumé, plus the derived movability signals the reasoning brain uses. */
export function CandidateHistoryPanel({ candidateId }: { candidateId: string }) {
  const [h, setH] = useState<History | null>(null)
  const [loading, setLoading] = useState(true)
  const [enriching, setEnriching] = useState(false)

  const load = useCallback(() => {
    fetch(`/api/candidates/${candidateId}/enrich`)
      .then((r) => (r.ok ? r.json() : { data: null }))
      .then((j) => setH(j.data ?? null))
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
    if (j.data?.status === 'enriched') { toast.success(`Extracted ${j.data.roles} roles from the résumé.`); load() }
    else toast(`Skipped: ${j.data?.reason?.replace(/_/g, ' ') ?? 'no résumé to read'}.`)
  }

  if (loading) return null
  const hasData = h && (h.experiences.length > 0 || h.education.length > 0)
  const mv = h?.movability

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Briefcase className="h-4 w-4 text-slate-400" /> Career history
        </div>
        <button onClick={enrich} disabled={enriching}
          className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          {enriching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {hasData ? 'Re-extract' : 'Extract from résumé'}
        </button>
      </div>

      <div className="px-5 py-4">
        {!hasData && (
          <p className="text-xs text-slate-500">
            No structured history yet. Click <strong>Extract from résumé</strong> to pull the dated work history and education from this candidate’s CV.
          </p>
        )}

        {hasData && (
          <div className="space-y-4">
            {mv && mv.num_roles > 0 && (
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2.5 py-1 text-xs text-slate-600"><Clock className="h-3 w-3 text-slate-400" /> {dur(mv.current_tenure_months)} in current role</span>
                <span className="rounded-lg bg-slate-50 px-2.5 py-1 text-xs text-slate-600">{dur(mv.total_experience_months)} total</span>
                <span className="rounded-lg bg-slate-50 px-2.5 py-1 text-xs text-slate-600">{mv.num_roles} roles · avg {dur(mv.avg_tenure_months)}</span>
              </div>
            )}

            {h!.experiences.length > 0 && (
              <ol className="relative space-y-3 border-l border-slate-200 pl-4">
                {h!.experiences.map((e, i) => (
                  <li key={i} className="relative">
                    <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-slate-300" />
                    <div className="text-sm font-medium text-slate-800">{e.title ?? 'Role'}{e.employer && <span className="font-normal text-slate-500"> · {e.employer}</span>}</div>
                    <div className="text-[11px] text-slate-400">
                      {ym(e.start_date) || '—'} – {e.is_current ? 'Present' : (ym(e.end_date) || '—')}{e.location ? ` · ${e.location}` : ''}
                    </div>
                  </li>
                ))}
              </ol>
            )}

            {h!.education.length > 0 && (
              <div className="border-t border-slate-100 pt-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500"><GraduationCap className="h-3.5 w-3.5" /> Education</div>
                {h!.education.map((ed, i) => (
                  <div key={i} className="text-xs text-slate-600">
                    {[ed.degree, ed.field].filter(Boolean).join(', ')}{ed.school ? ` — ${ed.school}` : ''}{ed.year ? ` (${ed.year})` : ''}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
