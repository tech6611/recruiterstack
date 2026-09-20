'use client'

import { useEffect, useState } from 'react'
import { X, MapPin, Building2, GraduationCap, Briefcase } from 'lucide-react'

/**
 * Right-hand profile panel for a market match — what Juicebox shows in its sidebar:
 * headline, tags, role history with dates and descriptions, education, skills, sources.
 * No unlock needed (contacts stay hidden until unlocked). Pure over `detail` so the
 * dev preview can feed it a fixture.
 */
export interface PoolProfileDetailView {
  id: string
  display_name: string | null
  headline?: string | null
  current_title: string | null
  current_company: string | null
  location_city: string | null
  location_region?: string | null
  location_country?: string | null
  experience_years: number | null
  skills: string[]
  sources: string[]
  education: { degree?: string | null; field?: string | null; school?: string | null; year?: number | null }[]
  experiences: { title?: string | null; employer?: string | null; start_date?: string | null; end_date?: string | null; is_current?: boolean | null; summary?: string | null; location?: string | null }[]
  unlocked?: boolean
}

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : null)

export function PoolProfilePanel({ profileId, tags, onClose, initialDetail }: { profileId: string; tags?: string[]; onClose: () => void; initialDetail?: PoolProfileDetailView | null }) {
  const [detail, setDetail] = useState<PoolProfileDetailView | null>(initialDetail ?? null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (initialDetail) return
    setDetail(null); setError(null)
    fetch(`/api/pool/${profileId}`).then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error ?? 'Could not load'); setDetail(j.profile) }).catch((e) => setError(e.message))
  }, [profileId, initialDetail])

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl">
      <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900">{detail?.display_name ?? '…'}</div>
          <div className="truncate text-xs text-slate-500">{detail?.current_title}{detail?.current_company ? ` · ${detail.current_company}` : ''}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {(tags ?? []).map((t) => <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{t}</span>)}
            {(detail?.sources ?? []).map((s) => <span key={s} className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] text-sky-700">{s.replace('vendor:', '').replace('upload:', '')}</span>)}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 text-xs">
        {error && <p className="text-rose-600">{error}</p>}
        {!detail && !error && <p className="text-slate-400">Loading…</p>}
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3 text-slate-500">
              {(detail.location_city ?? detail.location_country) && (
                <span className="inline-flex items-center gap-1" title={[detail.location_city, detail.location_region, detail.location_country].filter(Boolean).join(' · ')}>
                  <MapPin className="h-3 w-3" />{[detail.location_city ?? detail.location_region, detail.location_country].filter(Boolean).join(', ')}
                </span>
              )}
              {detail.experience_years != null && <span className="inline-flex items-center gap-1"><Briefcase className="h-3 w-3" />{detail.experience_years} yrs</span>}
              {!detail.unlocked && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">contacts after unlock</span>}
            </div>
            <section>
              <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Experience</h4>
              <ol className="space-y-2.5">
                {detail.experiences.map((e, i) => (
                  <li key={i} className="border-l-2 border-slate-100 pl-2.5">
                    <div className="font-medium text-slate-800">{e.title ?? 'Role'}<span className="font-normal text-slate-500">{e.employer ? ` · ${e.employer}` : ''}</span></div>
                    <div className="text-[10px] text-slate-400">{fmt(e.start_date) ?? '?'} – {e.is_current ? 'now' : fmt(e.end_date) ?? '?'}{e.location ? ` · ${e.location}` : ''}</div>
                    {e.summary && <p className="mt-0.5 line-clamp-4 text-[11px] text-slate-600" title={e.summary}>{e.summary}</p>}
                  </li>
                ))}
              </ol>
            </section>
            {detail.education.length > 0 && (
              <section>
                <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Education</h4>
                <ul className="space-y-1">
                  {detail.education.map((ed, i) => <li key={i} className="inline-flex items-start gap-1.5 text-slate-700"><GraduationCap className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" /><span>{[ed.degree, ed.field].filter(Boolean).join(' in ')}{ed.school ? ` — ${ed.school}` : ''}{ed.year ? ` (${ed.year})` : ''}</span></li>)}
                </ul>
              </section>
            )}
            {detail.skills.length > 0 && (
              <section>
                <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Skills</h4>
                <div className="flex flex-wrap gap-1">{detail.skills.slice(0, 30).map((sk) => <span key={sk} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{sk}</span>)}</div>
              </section>
            )}
            {detail.current_company && <div className="inline-flex items-center gap-1 text-slate-400"><Building2 className="h-3 w-3" /> current employer as last recorded</div>}
          </div>
        )}
      </div>
    </aside>
  )
}
