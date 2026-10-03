'use client'

import { useEffect, useRef, useState } from 'react'
import { ThumbsUp, ThumbsDown, Check, X, HelpCircle, SkipForward, Globe, Loader2, MapPin, Clock, GraduationCap } from 'lucide-react'
import { toast } from 'sonner'
import { PoolProfilePanel } from '@/components/req-jobs/PoolProfilePanel'
import { CRITERION_KIND_LABEL, type SearchCriterion } from '@/lib/types/search-spec'
import type { BetSampleResult } from '@/modules/pool/domain/bet-sample'
import type { BetCheck } from '@/modules/pool/domain/bet-sample-fit'

/** Wait this long after the last edit before searching (each search can cost credits). */
const FETCH_DELAY_MS = 2000

/** How the card talks to the server — swappable so the dev preview runs without signing in. */
export interface BetSampleClient {
  sample(body: { bet: number; criteria: SearchCriterion[]; skip: string[] }): Promise<BetSampleResult>
  decide(body: { bet: number; bet_label: string; criteria: SearchCriterion[]; profile_id: string; decision: 'yes' | 'no'; checks: BetCheck[]; icp_id: string | null }): Promise<void>
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j.error ?? 'Something went wrong')
  return j.data as T
}

export const liveBetSampleClient = (jobId: string): BetSampleClient => ({
  sample: (b) => post(`/api/jobs/${jobId}/bets/sample`, b),
  decide: (b) => post(`/api/jobs/${jobId}/bets/decide`, b),
})

/**
 * A REAL PERSON WHO FITS THIS BET, beside its card on Scoring — fetched LIVE from the
 * market with exactly the bet's lines (companies, titles, location, years, school…), so
 * the card on the left and the person on the right are one search. Editing a line
 * searches again ~2 s after the last change; each line is marked ✓ / ✗ / ? (? = a line
 * the market can't filter on, checked from the profile). 👍 / 👎 is saved and the next
 * person shows. Searches are paid, remembered per set of lines, and capped per job per
 * day; the card says how many match and what has been spent.
 */
export function BetSampleCard({
  client, bet, betLabel, criteria, icpId,
}: {
  client: BetSampleClient
  bet: number
  betLabel: string
  /** The bet's companies + titles rows and its profile lines (unsaved edits included). */
  criteria: SearchCriterion[]
  icpId: string | null
}) {
  const [result, setResult] = useState<BetSampleResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null)
  const [open, setOpen] = useState(false)
  // People shown this session and passed over with "Show another" (not decided).
  const skip = useRef<string[]>([])
  const key = JSON.stringify(criteria)
  const latest = useRef(0)

  async function load(resetSkip = false) {
    if (resetSkip) skip.current = []
    const ticket = ++latest.current
    setLoading(true)
    try {
      const r = await client.sample({ bet, criteria, skip: skip.current })
      if (ticket === latest.current) setResult(r)
    } catch (e) {
      if (ticket === latest.current) toast.error(e instanceof Error ? e.message : 'Could not load a sample person')
    } finally {
      if (ticket === latest.current) setLoading(false)
    }
  }

  // A changed line (company, title, location, years…) means a different person may fit best.
  useEffect(() => {
    const t = setTimeout(() => load(true), FETCH_DELAY_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, bet])

  async function decide(decision: 'yes' | 'no') {
    const p = result?.person
    if (!p) return
    setBusy(decision)
    try {
      await client.decide({ bet, bet_label: betLabel, criteria, profile_id: p.id, decision, checks: result.checks, icp_id: icpId })
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save that')
    } finally {
      setBusy(null)
    }
  }

  function another() {
    if (!result?.person) return
    skip.current = [...skip.current, result.person.id]
    load()
  }

  const p = result?.person ?? null
  const tally = result?.decided
  const shell = 'flex flex-col rounded-xl border border-slate-200 bg-white p-3'

  const meter = result && <Meter total={result.total} spent={result.spent} cap={result.cap} />

  if (loading && !result) {
    return (
      <div className={`${shell} min-h-[10rem] items-center justify-center text-xs text-slate-400`}>
        <Loader2 className="mb-1 h-4 w-4 animate-spin" /> Searching the market for this bet…
      </div>
    )
  }

  if (!p) {
    const why = {
      no_companies: 'This bet names no companies yet — click “At” on the card to add some.',
      none: 'Nobody in the market matches all of this bet’s lines. Loosen one — a wider location, more companies or titles.',
      all_seen: 'You have been through everyone the market has for these lines.',
      cap: `This job has used its ${result?.cap ?? ''} credits for sample people in the last 24 hours. Searching resumes as the day rolls over.`,
      unavailable: result?.message ?? 'The market search is unavailable right now.',
    }[result?.reason ?? 'none'] ?? ''
    return (
      <div className={`${shell} min-h-[10rem] justify-center text-center ${loading ? 'opacity-60' : ''}`}>
        <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-600">
          {loading && <Loader2 className="h-3 w-3 animate-spin" />} No sample person
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{why}</p>
        {meter}
        {tally && tally.yes + tally.no > 0 && <Tally yes={tally.yes} no={tally.no} />}
      </div>
    )
  }

  const school = (p.education ?? []).find((e) => e?.school)?.school ?? null
  const lines = result!.checks.filter((c) => !c.kind.startsWith('employer_') && !c.kind.startsWith('title_'))
  const role = result!.checks.filter((c) => c.kind.startsWith('employer_') || c.kind.startsWith('title_'))

  return (
    <div className={`${shell} ${loading ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        Sample person
        {loading && <Loader2 className="h-3 w-3 animate-spin" />}
      </div>
      {meter}

      <button type="button" onClick={() => setOpen(true)} className="mt-2 flex items-start gap-2.5 rounded-lg text-left hover:bg-slate-50" title="Open the full profile">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-800 text-xs font-semibold text-white">{initials(p.display_name)}</span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-slate-900">{p.display_name ?? 'Unnamed'}</span>
          <span className="block text-[12px] leading-snug text-slate-600">
            {[p.current_title, p.current_company].filter(Boolean).join(' at ') || p.headline || '—'}
          </span>
        </span>
      </button>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
        {p.experience_years != null && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{Math.round(Number(p.experience_years) * 10) / 10} yrs</span>}
        {(p.location_city || p.location_raw) && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{p.location_city ?? p.location_raw}</span>}
        {school && <span className="inline-flex min-w-0 items-center gap-1"><GraduationCap className="h-3 w-3 shrink-0" /><span className="truncate">{school}</span></span>}
      </div>

      {/* How they fit each of the bet's lines. */}
      <ul className="mt-2.5 space-y-1 border-t border-slate-100 pt-2">
        {[...role, ...lines].map((c) => <CheckLine key={c.id} c={c} />)}
      </ul>

      <div className="mt-3 grid grid-cols-2 gap-1.5">
        <button type="button" onClick={() => decide('yes')} disabled={!!busy || loading}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
          {busy === 'yes' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />} Yes
        </button>
        <button type="button" onClick={() => decide('no')} disabled={!!busy || loading}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white px-2 py-1.5 text-xs font-medium text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50 disabled:opacity-60">
          {busy === 'no' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsDown className="h-3.5 w-3.5" />} No
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
        <button type="button" onClick={another} disabled={!!busy || loading}
          className="inline-flex items-center gap-1 hover:text-slate-700 disabled:opacity-50" title="Skip without deciding">
          <SkipForward className="h-3 w-3" /> Show another
        </button>
        {tally && tally.yes + tally.no > 0 && <Tally yes={tally.yes} no={tally.no} />}
      </div>

      {open && <PoolProfilePanel profileId={p.id} onClose={() => setOpen(false)} />}
    </div>
  )
}

function CheckLine({ c }: { c: BetCheck }) {
  const look = c.result === 'pass'
    ? { Icon: Check, cls: 'text-emerald-600' }
    : c.result === 'fail'
      ? { Icon: X, cls: 'text-rose-500' }
      : { Icon: HelpCircle, cls: 'text-slate-300' }
  const name = c.kind.startsWith('employer_') ? 'Company' : c.kind.startsWith('title_') ? 'Title' : CRITERION_KIND_LABEL[c.kind]
  return (
    <li className="flex items-start gap-1.5 text-[11px] leading-snug" title={c.result === 'unknown' ? `${c.label} — not on their profile, so not checked` : c.label}>
      <look.Icon className={`mt-px h-3 w-3 shrink-0 ${look.cls}`} />
      <span className="min-w-0 text-slate-500">
        <span className="text-slate-700">{name}</span>
        {c.note && <span> · {c.note}</span>}
        {c.result === 'unknown' && !c.note && <span className="text-slate-400"> · not on profile</span>}
      </span>
    </li>
  )
}

/** How many the market has for these lines, and what this job has spent today. */
function Meter({ total, spent, cap }: { total: number | null; spent: number; cap: number }) {
  return (
    <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 text-[10px] text-slate-400">
      <span className="inline-flex items-center gap-1" title="People in the market matching every line of this bet">
        <Globe className="h-3 w-3" />{total == null ? 'Market' : `${total.toLocaleString()} match in the market`}
      </span>
      <span title="Credits this job spent on sample people in the last 24 hours, of its daily cap">{spent.toFixed(2)} / {cap} credits today</span>
    </div>
  )
}

function Tally({ yes, no }: { yes: number; no: number }) {
  return (
    <span className="mt-1 inline-flex items-center gap-2 text-[11px] text-slate-400" title="Marked for this bet so far">
      <span className="inline-flex items-center gap-0.5"><ThumbsUp className="h-3 w-3" />{yes}</span>
      <span className="inline-flex items-center gap-0.5"><ThumbsDown className="h-3 w-3" />{no}</span>
    </span>
  )
}

function initials(name: string | null): string {
  const w = String(name ?? '').trim().split(/\s+/).filter(Boolean)
  if (!w.length) return '?'
  return (w[0][0] + (w[1]?.[0] ?? '')).toUpperCase()
}
