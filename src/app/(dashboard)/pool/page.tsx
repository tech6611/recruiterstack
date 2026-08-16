'use client'

/**
 * Candidate Pool (Component 05, Slice 5e) — the Resdex-style surface.
 *
 * A cross-org database of people who have NOT applied to you. Search it, then
 * unlock a profile to pull it into your own candidate list. Contact details stay
 * hidden until unlock; everything else is browsable.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  Search, MapPin, Briefcase, Clock, Mail, Linkedin, Sparkles,
  Loader2, X, Database, Filter, CheckCircle2,
} from 'lucide-react'

type Summary = {
  id: string
  display_name: string | null
  headline: string | null
  current_title: string | null
  current_company: string | null
  location_city: string | null
  skills: string[]
  num_roles: number | null
  total_experience_months: number | null
  current_tenure_months: number | null
  has_email: boolean
  has_linkedin: boolean
  reachable: boolean
  sources: string[]
  unlocked?: boolean
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
  provenance: { field: string; value: unknown; source_key: string; confidence: number }[]
}
type Facets = { cities: string[]; skills: string[]; sources: string[]; total: number }
type Access = { hasAccess: boolean; tier?: string; unlockQuota?: number | null; unlocksUsed?: number }

const months = (m: number | null | undefined) =>
  m == null ? '—' : m >= 12 ? `${(m / 12).toFixed(1)} yrs` : `${m} mo`

const fmt = (d: string | null) =>
  !d ? '' : new Date(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })

export default function PoolPage() {
  const [access, setAccess]   = useState<Access | null>(null)
  const [rows, setRows]       = useState<Summary[]>([])
  const [total, setTotal]     = useState(0)
  const [facets, setFacets]   = useState<Facets | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)

  const [q, setQ]                 = useState('')
  const [city, setCity]           = useState('')
  const [skill, setSkill]         = useState('')
  const [minExp, setMinExp]       = useState(0)
  const [minTenure, setMinTenure] = useState(0)
  const [reachable, setReachable] = useState(false)

  const [selected, setSelected] = useState<Detail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    if (city) p.set('city', city)
    if (skill) p.set('skill', skill)
    if (minExp) p.set('minExp', String(minExp * 12))
    if (minTenure) p.set('minTenure', String(minTenure * 12))
    if (reachable) p.set('reachable', '1')
    const res = await fetch(`/api/pool?${p}`)
    const j = await res.json()
    setAccess(j.access); setRows(j.rows ?? []); setTotal(j.total ?? 0); setFacets(j.facets)
    setLoading(false)
  }, [q, city, skill, minExp, minTenure, reachable])

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])

  async function startTrial() {
    setStarting(true)
    await fetch('/api/pool', { method: 'POST' })
    setStarting(false); load()
  }

  async function openProfile(id: string) {
    setDetailLoading(true)
    const res = await fetch(`/api/pool/${id}`)
    if (res.ok) setSelected((await res.json()).profile)
    setDetailLoading(false)
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
            <option value="">Any location</option>
            {facets?.cities.map((c) => <option key={c} value={c}>{c}</option>)}
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
        </div>
        <p className="mt-2 text-xs text-gray-400">
          &ldquo;In role ≥ 3 yrs&rdquo; is the movability signal — someone three years in a seat is
          far more likely to move than someone three months in.
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
            <button
              key={r.id}
              onClick={() => openProfile(r.id)}
              className="block w-full rounded-xl border border-gray-200 bg-white p-4 text-left transition hover:border-emerald-400 hover:shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">{r.display_name || 'Unnamed'}</span>
                    {r.unlocked && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" /> In your ATS
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-sm text-gray-600">
                    {r.current_title || '—'}{r.current_company ? ` · ${r.current_company}` : ''}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {r.skills.slice(0, 8).map((s) => (
                      <span key={s} className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">{s}</span>
                    ))}
                    {r.skills.length > 8 && (
                      <span className="px-1 text-xs text-gray-400">+{r.skills.length - 8}</span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5 text-xs text-gray-500">
                  <div className="flex items-center gap-3 tabular-nums">
                    <span className="flex items-center gap-1"><Briefcase className="h-3.5 w-3.5" />{months(r.total_experience_months)}</span>
                    <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{months(r.current_tenure_months)} in role</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.location_city && (
                      <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{r.location_city}</span>
                    )}
                    {r.has_email && <Mail className="h-3.5 w-3.5 text-emerald-600" />}
                    {r.has_linkedin && <Linkedin className="h-3.5 w-3.5 text-emerald-600" />}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Detail drawer */}
      {(selected || detailLoading) && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/20" onClick={() => setSelected(null)}>
          <div
            className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
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

                <div className="mb-5 grid grid-cols-4 gap-3 rounded-lg bg-gray-50 p-3 text-center">
                  {[
                    ['Experience', months(selected.total_experience_months)],
                    ['In role', months(selected.current_tenure_months)],
                    ['Roles', String(selected.num_roles ?? '—')],
                    ['Location', selected.location_city ?? '—'],
                  ].map(([l, v]) => (
                    <div key={l}>
                      <div className="text-sm font-semibold tabular-nums text-gray-900">{v}</div>
                      <div className="text-xs text-gray-500">{l}</div>
                    </div>
                  ))}
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
                <section className="mb-5">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Career history</h3>
                  {selected.experiences.length ? (
                    <ol className="space-y-3 border-l border-gray-200 pl-4">
                      {selected.experiences.map((e) => (
                        <li key={e.id} className="relative">
                          <span className={`absolute -left-[21px] top-1.5 h-2 w-2 rounded-full ${e.is_current ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                          <div className="text-sm font-medium text-gray-900">{e.title || 'Role'}</div>
                          <div className="text-sm text-gray-600">{e.employer || '—'}</div>
                          <div className="text-xs tabular-nums text-gray-400">
                            {fmt(e.start_date) || '?'} → {e.is_current ? 'present' : (fmt(e.end_date) || '?')}
                            {e.location ? ` · ${e.location}` : ''}
                          </div>
                          {e.summary && <p className="mt-0.5 text-xs text-gray-500">{e.summary}</p>}
                        </li>
                      ))}
                    </ol>
                  ) : <p className="text-sm text-gray-500">No dated history captured.</p>}
                </section>

                {selected.education?.length > 0 && (
                  <section className="mb-5">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Education</h3>
                    <ul className="space-y-1 text-sm text-gray-700">
                      {selected.education.map((ed, i) => (
                        <li key={i}>{[ed.degree, ed.field, ed.school, ed.year].filter(Boolean).join(' · ')}</li>
                      ))}
                    </ul>
                  </section>
                )}

                <section className="mb-5">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Skills</h3>
                  <div className="flex flex-wrap gap-1">
                    {selected.skills.map((s) => (
                      <span key={s} className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{s}</span>
                    ))}
                  </div>
                </section>

                {/* Provenance — the thing no other ATS shows you */}
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Where this came from
                  </h3>
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 text-gray-500">
                        <tr>
                          <th className="px-3 py-1.5 text-left font-medium">Field</th>
                          <th className="px-3 py-1.5 text-left font-medium">Value</th>
                          <th className="px-3 py-1.5 text-left font-medium">Source</th>
                          <th className="px-3 py-1.5 text-right font-medium">Trust</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.provenance.map((p, i) => (
                          <tr key={i} className="border-t border-gray-100">
                            <td className="px-3 py-1.5 text-gray-500">{p.field}</td>
                            <td className="max-w-[220px] truncate px-3 py-1.5 text-gray-800">
                              {typeof p.value === 'string' ? p.value : JSON.stringify(p.value)}
                            </td>
                            <td className="px-3 py-1.5 text-gray-600">{p.source_key}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{p.confidence}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-xs text-gray-400">
                    Conflicting values are kept, not silently resolved — the higher trust
                    score wins in the resolved view, but both remain auditable.
                  </p>
                </section>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
