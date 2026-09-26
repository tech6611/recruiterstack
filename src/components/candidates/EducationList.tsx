'use client'

import { BrandIcon } from '@/components/ui/BrandIcon'

export interface EducationEntry {
  degree?: string | null
  field?: string | null
  school?: string | null
  year?: number | null
}

/**
 * Education, in Juicebox's order: the institution on the strong line, the
 * qualification grey beneath it, the year last. The school is what a recruiter scans
 * for, so it leads — the reverse of how a CV usually writes it.
 *
 * School logos resolve far less often than company ones (most of the misses are
 * secondary schools, which have no logo anywhere), so the monogram carries more of this
 * list than the one above it. That is why <BrandIcon> styles it as a real mark.
 */
export function EducationList({ education }: { education: EducationEntry[] }) {
  const entries = (education ?? []).filter((e) => e.degree || e.field || e.school)
  if (!entries.length) return null

  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-slate-900">Education</h3>
      <div className="space-y-3">
        {entries.map((entry, i) => {
          const qualification = [entry.degree, entry.field].filter(Boolean).join(', ')
          return (
            <div key={i} className="flex gap-3">
              <BrandIcon name={entry.school} kind="school" size={32} className="mt-0.5" />
              <div className="min-w-0 flex-1">
                {/* With no school recorded, the qualification becomes the strong line
                    rather than leaving an empty heading above it. */}
                <p className="text-sm font-semibold leading-snug text-slate-900">
                  {entry.school || qualification}
                </p>
                {entry.school && qualification && (
                  <p className="text-sm leading-snug text-slate-600">{qualification}</p>
                )}
                {entry.year && <p className="mt-0.5 text-xs text-slate-400">{entry.year}</p>}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
