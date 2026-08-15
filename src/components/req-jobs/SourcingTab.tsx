'use client'

import { useCallback, useEffect, useState } from 'react'
import { Radar, ShieldAlert, UserPlus, MapPin, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const BUCKET: Record<string, { label: string; cls: string }> = {
  great: { label: 'Great fit', cls: 'bg-emerald-100 text-emerald-700' },
  good: { label: 'Good fit', cls: 'bg-sky-100 text-sky-700' },
  okay: { label: 'Okay fit', cls: 'bg-amber-100 text-amber-700' },
}

interface Match {
  candidate_id: string
  score: number
  fit_bucket: string | null
  gate_failures: { label?: string }[]
  red_flags: string[]
  rationale: string | null
  icp_version: number | null
  candidate: { id: string; name: string | null; current_title: string | null; location: string | null } | null
}

/**
 * Sourcing (Component 05, 5a). Ranks the org's candidate pool against the job's
 * approved ICP with the Fit Engine, shows the matches, and adds the good ones to
 * the pipeline. Runs on demand ("Source candidates") and caches the result.
 */
export function SourcingTab({ jobId }: { jobId: string }) {
  const [matches, setMatches] = useState<Match[]>([])
  const [currentVersion, setCurrentVersion] = useState<number | null>(null)
  const [hasIcp, setHasIcp] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sourcing, setSourcing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    const res = await fetch(`/api/jobs/${jobId}/source`)
    if (res.ok) {
      const { data } = await res.json()
      setMatches(data.matches ?? [])
      setCurrentVersion(data.current_icp_version ?? null)
      setHasIcp(!!data.has_approved_icp)
    }
    setLoading(false)
  }, [jobId])

  useEffect(() => { load() }, [load])

  async function runSource() {
    setSourcing(true)
    const res = await fetch(`/api/jobs/${jobId}/source`, { method: 'POST' })
    setSourcing(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error ?? 'Sourcing failed')
      return
    }
    const { data } = await res.json()
    setMatches(data.matches ?? [])
    setCurrentVersion(data.icp_version ?? currentVersion)
    toast.success(`Sourced ${data.scored} candidate${data.scored === 1 ? '' : 's'} from your pool.`)
  }

  async function addSelected() {
    if (selected.size === 0) return
    setAdding(true)
    const res = await fetch(`/api/jobs/${jobId}/source/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate_ids: Array.from(selected) }),
    })
    setAdding(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error ?? 'Could not add to pipeline')
      return
    }
    const { data } = await res.json()
    toast.success(`Added ${data.added} to the pipeline${data.skipped ? `, ${data.skipped} already there` : ''}.`)
    setSelected(new Set())
    load()
  }

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const stale = matches.some((m) => currentVersion != null && m.icp_version !== currentVersion)

  if (loading) {
    return <Card><CardContent className="py-8 text-center text-sm text-slate-400">Loading…</CardContent></Card>
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Radar className="h-4 w-4 text-slate-500" /> Sourcing
            </CardTitle>
            <CardDescription>
              Rank your existing candidate pool against this job&apos;s approved ICP, then add the best to the pipeline.
            </CardDescription>
          </div>
          {hasIcp && (
            <Button size="sm" onClick={runSource} loading={sourcing}>
              <Radar className="h-3.5 w-3.5" /> {matches.length ? 'Re-source' : 'Source candidates'}
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {!hasIcp ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center">
            <p className="text-sm text-slate-500">Approve an ICP for this job to source against it.</p>
            <p className="mt-1 text-xs text-slate-400">Sourcing uses the ICP&apos;s must-haves as filters and its competencies to rank.</p>
          </div>
        ) : matches.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center">
            <p className="text-sm text-slate-500">No matches yet.</p>
            <p className="mt-1 text-xs text-slate-400">Run sourcing to find candidates from your pool who fit this role.</p>
          </div>
        ) : (
          <>
            {stale && (
              <div className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-700">
                <RefreshCw className="h-3 w-3 shrink-0" />
                Some matches were scored against an older ICP — re-source to refresh.
              </div>
            )}
            <div className="overflow-hidden rounded-xl border border-slate-200 divide-y divide-slate-100">
              {matches.map((m) => {
                const b = m.fit_bucket ? BUCKET[m.fit_bucket] : null
                const gated = m.gate_failures.length > 0
                return (
                  <label key={m.candidate_id} className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={selected.has(m.candidate_id)}
                      onChange={() => toggle(m.candidate_id)}
                      className="mt-1 h-3.5 w-3.5 shrink-0 accent-slate-700"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm font-medium text-slate-800">{m.candidate?.name ?? 'Unknown'}</span>
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">{m.score}/100</span>
                        {b && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${b.cls}`}>{b.label}</span>}
                        {gated && (
                          <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                            <ShieldAlert className="mr-0.5 inline h-2.5 w-2.5" />Missing must-have
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
                        {m.candidate?.current_title && <span>{m.candidate.current_title}</span>}
                        {m.candidate?.location && (
                          <span className="inline-flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{m.candidate.location}</span>
                        )}
                      </div>
                      {m.rationale && <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{m.rationale}</p>}
                    </div>
                  </label>
                )
              })}
            </div>
          </>
        )}
      </CardContent>

      {selected.size > 0 && (
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-3">
          <span className="text-xs text-slate-500">{selected.size} selected</span>
          <Button size="sm" onClick={addSelected} loading={adding}>
            <UserPlus className="h-3.5 w-3.5" /> Add to pipeline
          </Button>
        </div>
      )}
    </Card>
  )
}
