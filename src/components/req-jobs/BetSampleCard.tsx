'use client'

import { useEffect, useRef, useState } from 'react'
import { ThumbsUp, ThumbsDown, Check, X, HelpCircle, SkipForward, Globe, Loader2, MapPin, Clock, GraduationCap } from 'lucide-react'
import { toast } from 'sonner'
import { PoolProfilePanel } from '@/components/req-jobs/PoolProfilePanel'
import { CRITERION_KIND_LABEL, type SearchCriterion } from '@/lib/types/search-spec'
import type { BetSampleResult } from '@/modules/pool/domain/bet-sample'
import type { BetCheck } from '@/modules/pool/domain/bet-sample-fit'

/** Must match MARKET_BATCH × CREDITS_PER_PERSON in modules/pool/domain/bet-sample. */
const MARKET_PEOPLE = 5
const MARKET_CREDITS = (MARKET_PEOPLE * 0.03).toFixed(2)

/** How the card talks to the server — swappable so the dev preview runs without signing in. */
export interface BetSampleClient {
  sample(body: { bet: number; criteria: SearchCriterion[]; skip: string[] }): Promise<BetSampleResult>
  decide(body: { bet: number; bet_label: string; criteria: SearchCriterion[]; profile_id: string; decision: 'yes' | 'no'; checks: BetCheck[]; icp_id: string | null }): Promise<void>
  market(body: { bet: number; criteria: SearchCriterion[] }): Promise<{ fetched: number; creditsUsed: number }>
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
  market: (b) => post(`/api/jobs/${jobId}/bets/market`, b),
})

/**
 * A REAL PERSON WHO FITS THIS BET, beside its card on Scoring. The best match from the
 * Candidate Pool (free — stored data, no AI) for the bet's companies, titles and profile
 * lines, each line marked ✓ / ✗ / ?. 👍 / 👎 is saved and the next person shows; editing
 * the bet's lines fetches a new person. When the pool has nobody, one click (after a
 * cost check) pulls a few people for this bet from the market.
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
  const [busy, setBusy] = useState<'yes' | 'no' | 'market' | null>(null)
  const [confirmMarket, setConfirmMarket] = useState(false)
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
    const t = setTimeout(() => load(true), 350)
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

  async function searchMarket() {
    setConfirmMarket(false)
    setBusy('market')
    try {
      const r = await client.market({ bet, criteria })
      toast.success(r.fetched ? `${r.fetched} new ${r.fetched === 1 ? 'person' : 'people'} found · ${r.creditsUsed.toFixed(2)} credits used` : `Nobody new in the market for this bet · ${r.creditsUsed.toFixed(2)} credits used`)
      await load(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The market search failed')
    } finally {
      setBusy(null)
    }
  }

  const p = result?.person ?? null
  const tally = result?.decided
  const shell = 'flex flex-col rounded-xl border border-slate-200 bg-white p-3'

  if (loading && !result) {
    return (
      <div className={`${shell} min-h-[10rem] items-center justify-center text-xs text-slate-400`}>
        <Loader2 className="mb-1 h-4 w-4 animate-spin" /> Finding someone who fits…
      </div>
    )
  }

  if (!p) {
    const why = result?.reason === 'no_companies'
      ? 'This bet names no companies yet — click “At” on the card to add some.'
      : result?.reason === 'all_seen'
        ? 'You have seen everyone in the pool at these companies.'
        : 'Nobody in the Candidate Pool works at these companies yet.'
    return (
      <div className={`${shell} min-h-[10rem] justify-center text-center`}>
        <div className="text-xs font-semibold text-slate-600">No sample person</div>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{why}</p>
        {result?.reason !== 'no_companies' && (
          confirmMarket ? (
            <div className="mt-3 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-900 ring-1 ring-amber-100">
              Search the market for up to {MARKET_PEOPLE} people for this bet? Uses about {MARKET_CREDITS} credits.
              <div className="mt-1.5 flex justify-center gap-1.5">
                <button type="button" onClick={searchMarket} className="rounded-md bg-slate-900 px-2 py-1 font-medium text-white hover:bg-slate-700">Yes, search</button>
                <button type="button" onClick={() => setConfirmMarket(false)} className="rounded-md px-2 py-1 text-slate-600 ring-1 ring-slate-200 hover:bg-white">Cancel</button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmMarket(true)}
              disabled={busy === 'market'}
              className="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-60"
            >
              {busy === 'market' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Globe className="h-3 w-3" />}
              {busy === 'market' ? 'Searching the market…' : 'Find one in the market'}
            </button>
          )
        )}
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
        <button type="button" onClick={another} disabled={!!busy || loading || result!.remaining === 0}
          className="inline-flex items-center gap-1 hover:text-slate-700 disabled:opacity-50" title="Skip without deciding">
          <SkipForward className="h-3 w-3" /> Show another{result!.remaining ? ` (${result!.remaining} more)` : ''}
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
