'use client'

import { useEffect, useState } from 'react'
import { Briefcase } from 'lucide-react'
import { ProfileDocument } from '@/components/candidates/ProfileDocument'
import { ProfileIdentity } from '@/components/candidates/ProfileIdentity'
import type { CompanyFactsMap } from '@/lib/company-facts'
import { formatLocation } from '@/lib/ui/location'

/**
 * Right-hand profile panel for a market match — the pool's version of the candidate
 * profile, and the surface Juicebox's drawer most directly corresponds to.
 *
 * It renders the SAME components as the ATS profile: the grouped experience timeline
 * with employer marks and promotion badges, the education list, the Skill Map, all
 * behind the anchor tabs. It used to hand-roll a flatter version of each, which meant
 * the pool and the pipeline described the same person differently — a candidate's
 * history would visibly change shape the moment they were unlocked. One set of
 * components removes that.
 *
 * Contacts stay hidden until the org unlocks the profile; nothing here reveals them.
 * Pure over `detail` so the dev preview can feed it a fixture.
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

export function PoolProfilePanel({
  profileId,
  tags,
  onClose,
  initialDetail,
}: {
  profileId: string
  tags?: string[]
  onClose: () => void
  initialDetail?: PoolProfileDetailView | null
}) {
  const [detail, setDetail] = useState<PoolProfileDetailView | null>(initialDetail ?? null)
  const [companies, setCompanies] = useState<CompanyFactsMap>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialDetail) return
    setDetail(null); setError(null)
    fetch(`/api/pool/${profileId}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error ?? 'Could not load')
        setDetail(j.profile)
        setCompanies(j.companies ?? {})
      })
      .catch((e) => setError(e.message))
  }, [profileId, initialDetail])

  const place = (detail && formatLocation(detail)) ?? ''

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl">
      <div className="border-b border-slate-100 px-4 pb-3 pt-4">
        {/* One identity block, shared with the /pool drawer and the ATS rail: name,
            location, the employer and school marks, the source links — same things in
            the same order whichever surface you opened the person from. */}
        <ProfileIdentity
          name={detail?.display_name ?? '…'}
          location={place || null}
          currentCompany={detail?.current_company}
          education={detail?.education}
          onClose={onClose}
        />
        <div className="-mt-3 flex flex-wrap gap-1">
          {(tags ?? []).map((t) => (
            <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{t}</span>
          ))}
          {(detail?.sources ?? []).map((s) => (
            <span key={s} className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] text-sky-700">
              {s.replace('vendor:', '').replace('upload:', '')}
            </span>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {error && <p className="text-xs text-rose-600">{error}</p>}
        {!detail && !error && <p className="text-xs text-slate-400">Loading…</p>}
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
              {detail.experience_years != null && (
                <span className="inline-flex items-center gap-1"><Briefcase className="h-3 w-3" />{detail.experience_years} yrs</span>
              )}
              {!detail.unlocked && (
                <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">contacts after unlock</span>
              )}
            </div>

            <ProfileDocument
              experiences={(detail.experiences ?? []).map((e) => ({
                title: e.title ?? null,
                employer: e.employer ?? null,
                location: e.location ?? null,
                start_date: e.start_date ?? null,
                end_date: e.end_date ?? null,
                is_current: Boolean(e.is_current),
                summary: e.summary ?? null,
              }))}
              education={detail.education ?? []}
              skills={detail.skills ?? []}
              companies={companies}
            />
          </div>
        )}
      </div>
    </aside>
  )
}
