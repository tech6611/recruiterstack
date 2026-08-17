'use client'

import { useState } from 'react'
import { ClipboardList, Copy, Sparkles, Users, Globe } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { fitBucketFor } from '@/lib/ai/fit-bucket'

interface Item {
  source: 'yours' | 'market'
  ref_id: string
  name: string
  title: string | null
  company: string | null
  location: string | null
  score: number
  fit_bucket: string
  rationale: string
  gate_failures: string[]
  reachable?: boolean
}
interface Archetype { name: string; thesis: string; where_from?: string | null; is_non_obvious?: boolean }
interface Brief {
  role_title: string | null
  reasoning: string | null
  unwritten_filters: { filter: string; exclusion_cost?: string | null }[]
  archetypes: Archetype[]
  shortlist: Item[]
  counts: { total: number; yours: number; market: number; great: number; good: number; okay: number }
  has_market: boolean
}

const BUCKET: Record<string, { label: string; cls: string }> = {
  great: { label: 'Great', cls: 'bg-emerald-100 text-emerald-700' },
  good: { label: 'Good', cls: 'bg-sky-100 text-sky-700' },
  okay: { label: 'Okay', cls: 'bg-amber-100 text-amber-700' },
  weak: { label: 'Weak', cls: 'bg-rose-100 text-rose-700' },
}

/** Sourcing Brain, Slice 1b — one ranked shortlist across your candidates + the
 *  market, with the reasoning, and a copy-for-hiring-manager export. */
export function ShortlistBrief({ jobId }: { jobId: string }) {
  const [brief, setBrief] = useState<Brief | null>(null)
  const [loading, setLoading] = useState(false)

  async function build() {
    setLoading(true)
    const res = await fetch(`/api/jobs/${jobId}/brief`, { method: 'POST' })
    setLoading(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error ?? 'Could not build the shortlist')
      return
    }
    const { data } = await res.json()
    setBrief(data as Brief)
  }

  function copyForHm() {
    if (!brief) return
    const lines: string[] = []
    lines.push(`Shortlist — ${brief.role_title ?? 'this role'}`)
    lines.push('')
    if (brief.reasoning) { lines.push('What we’re looking for:'); lines.push(brief.reasoning); lines.push('') }
    if (brief.archetypes?.length) {
      lines.push('Who could fit (the bets we’re making):')
      brief.archetypes.forEach((a) => lines.push(`- ${a.name}${a.is_non_obvious ? ' (non-obvious)' : ''}: ${a.thesis}`))
      lines.push('')
    }
    lines.push(`Top candidates (${brief.counts.total} — ${brief.counts.yours} from our pool, ${brief.counts.market} from the market):`)
    brief.shortlist.forEach((i, n) => {
      const where = [i.title, i.company].filter(Boolean).join(' @ ')
      const bk = fitBucketFor(i.score, i.gate_failures.length === 0)
      lines.push(`${n + 1}. ${i.name}${where ? ` — ${where}` : ''} [${BUCKET[bk]?.label ?? 'Fit'}, ${i.score}/100${i.source === 'market' ? ', market' : ''}]`)
      if (i.rationale) lines.push(`   ${i.rationale}`)
    })
    navigator.clipboard.writeText(lines.join('\n')).then(
      () => toast.success('Brief copied — paste it to your hiring manager.'),
      () => toast.error('Could not copy'),
    )
  }

  return (
    <div className="border-t border-slate-100 px-6 py-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <ClipboardList className="h-4 w-4 text-indigo-500" /> Shortlist brief
        </div>
        <div className="flex items-center gap-2">
          {brief && (
            <Button size="sm" variant="outline" onClick={copyForHm}>
              <Copy className="h-3.5 w-3.5" /> Copy for hiring manager
            </Button>
          )}
          <Button size="sm" onClick={build} loading={loading}>
            <Sparkles className="h-3.5 w-3.5" /> {brief ? 'Rebuild' : 'Build shortlist'}
          </Button>
        </div>
      </div>

      {!brief && (
        <p className="mt-2 text-xs text-slate-500">
          One ranked shortlist across your own candidates and the market, with the reasoning — ready to share with the hiring manager.
        </p>
      )}

      {brief && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-slate-600">{brief.counts.total} candidates</span>
            <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-slate-600"><Users className="h-3 w-3" /> {brief.counts.yours} your pool</span>
            <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-slate-600"><Globe className="h-3 w-3" /> {brief.counts.market} market</span>
            <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-emerald-700">{brief.counts.great} great · {brief.counts.good} good</span>
          </div>

          {brief.reasoning && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-xs leading-relaxed text-slate-600">
              {brief.reasoning}
            </div>
          )}

          {brief.archetypes?.length > 0 && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Who could fit (the bets)</div>
              <div className="flex flex-wrap gap-1.5">
                {brief.archetypes.map((a, i) => (
                  <span key={i} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600" title={a.thesis}>
                    {a.name}{a.is_non_obvious && <span className="text-indigo-500"> ✦</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          <ol className="space-y-2">
            {brief.shortlist.map((i, n) => (
              <li key={`${i.source}-${i.ref_id}`} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 text-xs font-bold text-slate-400">{n + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-slate-800">{i.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${BUCKET[fitBucketFor(i.score, i.gate_failures.length === 0)]?.cls ?? 'bg-slate-100 text-slate-600'}`}>{BUCKET[fitBucketFor(i.score, i.gate_failures.length === 0)]?.label ?? 'Fit'}</span>
                      <span className="text-xs font-bold text-slate-500">{i.score}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${i.source === 'market' ? 'bg-sky-50 text-sky-600' : 'bg-slate-100 text-slate-500'}`}>
                        {i.source === 'market' ? 'Market' : 'Your pool'}
                      </span>
                      {i.source === 'market' && !i.reachable && <span className="text-[10px] text-amber-600">no contact</span>}
                    </div>
                    <div className="truncate text-[11px] text-slate-400">{[i.title, i.company].filter(Boolean).join(' @ ')}{i.location ? ` — ${i.location}` : ''}</div>
                    {i.rationale && <div className="mt-1 line-clamp-2 text-[11px] text-slate-500">{i.rationale}</div>}
                    {i.gate_failures.length > 0 && <div className="text-[11px] text-red-600">Missing: {i.gate_failures.join(', ')}</div>}
                  </div>
                </div>
              </li>
            ))}
          </ol>
          {brief.shortlist.length === 0 && <p className="text-xs text-slate-400">No matches yet — source your pool or the market first.</p>}
        </div>
      )}
    </div>
  )
}
