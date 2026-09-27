'use client'

import { CheckCircle2, FileText, AlertTriangle } from 'lucide-react'
import { ResultCard } from '@/components/ui/ResultCard'
import { formatLocation } from '@/lib/ui/location'

/** The subset of a pool row a card draws. Mirrors `PoolProfileSummary`. */
export interface PoolCardRow {
  id: string
  display_name: string | null
  current_title: string | null
  current_company: string | null
  location_city: string | null
  location_region: string | null
  location_country: string | null
  sources: string[]
  employer_disputed: boolean
  unlocked?: boolean
  freshness?: 'fresh' | 'aging' | 'stale' | 'unknown'
  education: { degree?: string | null; field?: string | null; school?: string | null }[]
  recent_roles: {
    title: string | null
    employer: string | null
    start_date: string | null
    end_date: string | null
    is_current: boolean
  }[]
}

const FRESHNESS: Record<string, { label: string; cls: string }> = {
  fresh: { label: 'Verified <1 yr', cls: 'bg-emerald-50 text-emerald-700' },
  aging: { label: '1–3 yrs old', cls: 'bg-amber-50 text-amber-700' },
  stale: { label: '3 yrs+ old', cls: 'bg-rose-50 text-rose-700' },
  unknown: { label: 'Undated', cls: 'bg-slate-100 text-slate-500' },
}

/**
 * A pool profile as a card — the same shape as a candidate, through <ResultCard>.
 *
 * What is specific to the pool is what it says ABOUT the record rather than about the
 * person: how old the newest evidence is, whether two sources disagree on the current
 * employer, and whether this org has already spent an unlock. A candidate row raises
 * none of those questions; a pool row is mostly those questions until you pay to see
 * the contact details.
 */
export function PoolResultCard({ row, onOpen }: { row: PoolCardRow; onOpen: () => void }) {
  const fresh = FRESHNESS[row.freshness ?? 'unknown']
  const place = formatLocation(row) ?? ''

  return (
    <ResultCard
      onOpen={onOpen}
      person={{
        name: row.display_name || 'Unnamed',
        location: place || null,
        currentTitle: row.current_title,
        currentCompany: row.current_company,
        roles: row.recent_roles ?? [],
        education: row.education ?? [],
      }}
      badges={
        <>
          {row.unlocked && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
              <CheckCircle2 className="h-3 w-3" /> In your ATS
            </span>
          )}
          {fresh && (
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${fresh.cls}`}
              title="How old the newest evidence about this person is"
            >
              {fresh.label}
            </span>
          )}
          {(row.sources ?? []).includes('upload:cv') && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
              <FileText className="h-3 w-3" /> CV
            </span>
          )}
          {row.employer_disputed && (
            <span
              title="Two sources name different current employers — one is out of date"
              className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
            >
              <AlertTriangle className="h-3 w-3" /> Employer disputed
            </span>
          )}
        </>
      }
    />
  )
}
