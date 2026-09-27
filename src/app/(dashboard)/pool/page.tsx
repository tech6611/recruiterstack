'use client'

/**
 * Candidate Pool (Component 05, Slice 5e) — the Resdex-style surface.
 *
 * A cross-org database of people who have NOT applied to you. Search it, then
 * unlock a profile to pull it into your own candidate list. Contact details stay
 * hidden until unlock; everything else is browsable.
 */

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ProfileDocument } from '@/components/candidates/ProfileDocument'
import { PoolResultCard } from '@/components/pool/PoolResultCard'
import { PoolSidePane } from '@/components/pool/PoolSidePane'
import { Search, Sparkles, Loader2, X, Database, Filter, CalendarClock, AlertTriangle } from 'lucide-react'

type Summary = {
  id: string
  display_name: string | null
  headline: string | null
  current_title: string | null
  current_company: string | null
  location_city: string | null
  location_region: string | null
  location_country: string | null
  location_country_code: string | null
  skills: string[]
  num_roles: number | null
  total_experience_months: number | null
  current_tenure_months: number | null
  tenure_verified_months: number | null
  evidence_as_of: string | null
  evidence_source: string | null
  employer_disputed: boolean
  evidence_age_months?: number | null
  freshness?: 'fresh' | 'aging' | 'stale' | 'unknown'
  has_email: boolean
  has_linkedin: boolean
  reachable: boolean
  sources: string[]
  unlocked?: boolean
  /** Returned by the search so a card can show a person, not just a job title. */
  education: { degree?: string | null; field?: string | null; school?: string | null; year?: number | null }[]
  recent_roles: { title: string | null; employer: string | null; start_date: string | null; end_date: string | null; is_current: boolean }[]
}

const SOURCE_LABEL: Record<string, string> = {
  'github':        'GitHub profile',
  'web:site':      'Personal website',
  'web:resume':    'Résumé (crawled)',
  'upload:cv':     'Uploaded CV',
  'self_declared': 'Self-declared link',
}

const FRESHNESS: Record<string, { label: string; cls: string }> = {
  fresh:   { label: 'Verified <1 yr', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  aging:   { label: '1–3 yrs old',    cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  stale:   { label: '3+ yrs old',     cls: 'bg-red-50 text-red-700 ring-red-200' },
  unknown: { label: 'Undated',        cls: 'bg-gray-100 text-gray-600 ring-gray-200' },
}
type Experience = {
  id: string; title: string | null; employer: string | null; location: string | null
  start_date: string | null; end_date: string | null; is_current: boolean
  summary: string | null; source_key: string
}
type Detail = Summary & {
  education: { degree?: string | null; field?: string | null; school?: string | null; year?: number | null }[]
  experiences: Experience[]
  contacts: { kind: string; value: string; source_key: string; confidence: string }[]
  // The API also returns `provenance` (per-field claims with trust scores). It is not
  // typed or rendered here on purpose: a recruiter reading a profile wants the person,
  // not our sourcing and confidence workings. The claims still drive which value wins
  // and the disputed-employer warning above, and remain queryable in pool_profile_fields.
}
type Facets = { cities: string[]; countries: { code: string; name: string }[]; skills: string[]; sources: string[]; total: number }
type Access = { hasAccess: boolean; tier?: string; unlockQuota?: number | null; unlocksUsed?: number }

const months = (m: number | null | undefined) =>
  m == null ? '—' : m >= 12 ? `${(m / 12).toFixed(1)} yrs` : `${m} mo`

const fmt = (d: string | null) =>
  !d ? '' : new Date(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })

/** "Pune, India" from the stored city / region / country; falls back to the region or country alone. */
const locationLabel = (r: Pick<Summary, 'location_city' | 'location_region' | 'location_country'>) => {
  const head = r.location_city ?? r.location_region
  if (head && r.location_country && head !== r.location_country) return `${head}, ${r.location_country}`
  return head ?? r.location_country ?? null
}

function FreshnessPill({ r }: { r: Summary }) {
  const f = FRESHNESS[r.freshness ?? 'unknown']
  return (
    <span
      title={r.evidence_as_of ? `Newest evidence: ${fmt(r.evidence_as_of)} (${r.evidence_source})` : 'No dated evidence'}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${f.cls}`}
    >
      <CalendarClock className="h-3 w-3" />
      {r.evidence_as_of ? fmt(r.evidence_as_of) : f.label}
    </span>
  )
}

export default function PoolPage() {
  const [access, setAccess]   = useState<Access | null>(null)
  const [rows, setRows]       = useState<Summary[]>([])
  const [total, setTotal]     = useState(0)
  const [facets, setFacets]   = useState<Facets | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)

  const [q, setQ]                 = useState('')
  const [city, setCity]           = useState('')
  const [country, setCountry]     = useState('')
  const [skill, setSkill]         = useState('')
  const [minExp, setMinExp]       = useState(0)
  const [minTenure, setMinTenure] = useState(0)
  const [reachable, setReachable] = useState(false)
  const [maxAge, setMaxAge]       = useState(0)   // months; 0 = any
  const [source, setSource]       = useState('')

  const [selected, setSelected] = useState<Detail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [unlocking, setUnlocking] = useState(false)
  const [unlockedCandidateId, setUnlockedCandidateId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    if (city) p.set('city', city)
    if (country) p.set('country', country)
    if (skill) p.set('skill', skill)
    if (minExp) p.set('minExp', String(minExp * 12))
    if (minTenure) p.set('minTenure', String(minTenure * 12))
    if (reachable) p.set('reachable', '1')
    if (maxAge) p.set('maxEvidenceAge', String(maxAge))
    if (source) p.set('source', source)
    const res = await fetch(`/api/pool?${p}`)
    const j = await res.json()
    setAccess(j.access); setRows(j.rows ?? []); setTotal(j.total ?? 0); setFacets(j.facets)
    setLoading(false)
  }, [q, city, country, skill, minExp, minTenure, reachable, maxAge, source])

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])

  async function startTrial() {
    setStarting(true)
    await fetch('/api/pool', { method: 'POST' })
    setStarting(false); load()
  }

  async function openProfile(id: string) {
    setDetailLoading(true)
    setUnlockedCandidateId(null)
    const res = await fetch(`/api/pool/${id}`)
    if (res.ok) setSelected((await res.json()).profile)
    setDetailLoading(false)
  }

  /** Spend an unlock, then re-read the profile so contacts appear in place. */
  async function unlockSelected() {
    if (!selected) return
    setUnlocking(true)
    const res = await fetch(`/api/pool/${selected.id}/unlock`, { method: 'POST' })
    const j = await res.json().catch(() => ({}))
    setUnlocking(false)
    if (!res.ok) {
      toast.error(
        j?.result?.status === 'quota_exceeded' ? 'No unlocks left on your plan.'
        : j?.result?.status === 'no_contact' ? 'No way to contact this person — nothing to unlock.'
        : 'Could not unlock this profile.',
      )
      return
    }
    setUnlockedCandidateId(j?.result?.candidate_id ?? null)
    toast.success(j?.result?.status === 'already' ? 'Already in your candidates.' : 'Unlocked — added to your candidates.')
    await openProfile(selected.id)
    load()
  }

  // ── No subscription ────────────────────────────────────────────────────────
  if (!loading && access && !access.hasAccess) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-20 text-center">
        <Database className="mx-auto h-10 w-10 text-emerald-600" />
        <h1 className="mt-4 text-2xl font-semibold text-gray-900">Candidate Pool</h1>
        <p className="mt-3 text-gray-600">
          A database of engineers who haven&apos;t applied to you — searchable by skill,
          location, experience and time in current role. Unlock a profile to add it to
          your candidates.
        </p>
        <button
          onClick={startTrial}
          disabled={starting}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-white font-medium hover:bg-emerald-700 disabled:opacity-60"
        >
          {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Start free trial — 25 unlocks
        </button>
      </div>
    )
  }

  return (
    <div className="px-6 py-6">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Candidate Pool</h1>
          <p className="text-sm text-gray-500">
            {facets ? `${facets.total.toLocaleString()} profiles` : '—'}
            {access?.tier && ` · ${access.tier} plan`}
            {access?.unlockQuota != null &&
              ` · ${access.unlocksUsed ?? 0}/${access.unlockQuota} unlocks used`}
          </p>
        </div>
        <span className="text-sm text-gray-500 tabular-nums">
          {loading ? 'Searching…' : `${total.toLocaleString()} match${total === 1 ? '' : 'es'}`}
        </span>
      </div>

      {/* Filters */}
      <div className="mb-5 rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Name, title, company…"
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <select value={city} onChange={(e) => setCity(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">Any city</option>
            {facets?.cities.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={country} onChange={(e) => setCountry(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">Any country</option>
            {facets?.countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
          <select value={skill} onChange={(e) => setSkill(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">Any skill</option>
            {facets?.skills.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <Filter className="h-4 w-4 text-gray-400" />
            Exp ≥
            <input type="number" min={0} max={25} value={minExp}
              onChange={(e) => setMinExp(Number(e.target.value))}
              className="w-16 rounded-lg border border-gray-300 px-2 py-1.5 text-sm tabular-nums" />
            yrs
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            In role ≥
            <input type="number" min={0} max={20} value={minTenure}
              onChange={(e) => setMinTenure(Number(e.target.value))}
              className="w-16 rounded-lg border border-gray-300 px-2 py-1.5 text-sm tabular-nums" />
            yrs
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={reachable} onChange={(e) => setReachable(e.target.checked)}
              className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
            Contactable only
          </label>
          <select value={maxAge} onChange={(e) => setMaxAge(Number(e.target.value))}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value={0}>Evidence: any age</option>
            <option value={12}>Verified within 1 yr</option>
            <option value={24}>Within 2 yrs</option>
            <option value={36}>Within 3 yrs</option>
          </select>
          <select value={source} onChange={(e) => setSource(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">Any source</option>
            {facets?.sources.map((s) => (
              <option key={s} value={s}>{SOURCE_LABEL[s] ?? s}</option>
            ))}
          </select>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          &ldquo;In role&rdquo; is <strong>last known</strong> tenure — role start to today. A
          <span className="text-amber-600"> *</span> means no source has confirmed it recently:
          a résumé is written while its author is job-hunting, so it can only ever prove
          where someone was, never where they still are. Use <strong>Evidence</strong> to
          demand freshness.
        </p>
      </div>

      {/* Results */}
      {loading && !rows.length ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : !rows.length ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center text-gray-500">
          No profiles match those filters.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <PoolResultCard key={r.id} row={r} onOpen={() => openProfile(r.id)} />
          ))}
        </div>
      )}

      {/* Detail drawer */}
      {(selected || detailLoading) && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/20" onClick={() => setSelected(null)}>
          <div
            className="flex h-full w-full max-w-5xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="min-w-0 flex-1 overflow-y-auto p-6">
            {detailLoading || !selected ? (
              <div className="flex justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
            ) : (
              <>
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">{selected.display_name}</h2>
                    <p className="text-sm text-gray-600">
                      {selected.current_title}{selected.current_company ? ` · ${selected.current_company}` : ''}
                    </p>
                  </div>
                  <button onClick={() => setSelected(null)} className="rounded p-1 text-gray-400 hover:bg-gray-100">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="mb-3 grid grid-cols-4 gap-3 rounded-lg bg-gray-50 p-3 text-center">
                  {[
                    ['Experience', months(selected.total_experience_months)],
                    ['In role (last known)', months(selected.current_tenure_months)],
                    ['Roles', String(selected.num_roles ?? '—')],
                    ['Location', locationLabel(selected) ?? '—'],
                  ].map(([l, v]) => (
                    <div key={l}>
                      <div className="text-sm font-semibold tabular-nums text-gray-900">{v}</div>
                      <div className="text-xs text-gray-500">{l}</div>
                    </div>
                  ))}
                </div>

                {/* Freshness — the honest "as of", and what we do NOT know */}
                <div className="mb-5 rounded-lg border border-gray-200 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <FreshnessPill r={selected} />
                    <span className="text-xs text-gray-500">
                      newest evidence{selected.evidence_source ? ` from ${selected.evidence_source}` : ''}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    Of the {months(selected.current_tenure_months)} shown in role, only{' '}
                    <strong>{months(selected.tenure_verified_months)}</strong> is confirmed by a
                    source{selected.evidence_as_of ? ` (as of ${fmt(selected.evidence_as_of)})` : ''}.
                    {selected.evidence_age_months != null && selected.evidence_age_months > 12 && (
                      <> Nothing confirms where this person works since then — treat the employer
                      above as a last-known value, not a current fact.</>
                    )}
                  </p>
                  {selected.employer_disputed && (
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Two sources name different employers — one of them is out of date.
                    </p>
                  )}
                </div>

                {/* Contacts — gated on unlock */}
                <section className="mb-5">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Contact</h3>
                  {selected.contacts.length ? (
                    <ul className="space-y-1 text-sm">
                      {selected.contacts.map((c, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <span className="w-16 shrink-0 text-xs text-gray-400">{c.kind}</span>
                          {c.kind === 'linkedin' || c.kind === 'website' ? (
                            <a href={c.value} target="_blank" rel="noopener noreferrer" className="text-emerald-700 hover:underline">{c.value}</a>
                          ) : <span className="text-gray-800">{c.value}</span>}
                          <span className="ml-auto text-xs text-gray-400">{c.source_key}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="rounded-lg border border-dashed border-gray-300 p-3 text-sm text-gray-500">
                      {selected.has_email || selected.has_linkedin
                        ? 'Contact details are hidden until you unlock this profile.'
                        : 'No contact details on file for this person.'}
                    </div>
                  )}
                </section>

                {/* Career arc */}
                {/* Career, education and skills — the SAME components the candidate
                    profile uses, so an unlocked profile does not change shape. */}
                <section className="mb-5">
                  <ProfileDocument
                    experiences={(selected.experiences ?? []).map((e) => ({
                      title: e.title ?? null,
                      employer: e.employer ?? null,
                      location: e.location ?? null,
                      start_date: e.start_date ?? null,
                      end_date: e.end_date ?? null,
                      is_current: Boolean(e.is_current),
                      summary: e.summary ?? null,
                    }))}
                    education={selected.education ?? []}
                    skills={selected.skills ?? []}
                  />
                </section>

              </>
            )}
            </div>

            {/* Notes and outreach, beside the profile — what Juicebox puts in its third
                column. What it can offer depends on whether this person is in your
                workspace yet; the pane says so rather than showing dead controls. */}
            {selected && (
              <PoolSidePane
                unlocked={Boolean(selected.unlocked)}
                candidateId={unlockedCandidateId}
                unlocksLeft={access?.unlockQuota == null ? null : Math.max(0, access.unlockQuota - (access.unlocksUsed ?? 0))}
                unlocking={unlocking}
                onUnlock={unlockSelected}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
