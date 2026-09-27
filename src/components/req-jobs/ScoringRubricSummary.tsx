'use client'

import { useEffect, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import type { ScoringCriterion } from '@/lib/types/database'

/** A read-only glance at the job's scoring rubric for the Overview sidebar —
 *  each criterion with its weight and a proportional bar.
 *
 *  `criteria` is the rubric scoring runs on today (written when an ICP is approved).
 *  The card also checks the newest ICP: if a draft is waiting, it says so, so draft
 *  edits on the Scoring tab never look like they are already in use. */
export function ScoringRubricSummary({
  jobId,
  criteria,
  onEdit,
}: {
  jobId?: string
  criteria: ScoringCriterion[]
  onEdit?: () => void
}) {
  const sorted = [...criteria].sort((a, b) => b.weight - a.weight)
  const [draftVersion, setDraftVersion] = useState<number | null>(null)

  useEffect(() => {
    if (!jobId) return
    let active = true
    fetch(`/api/jobs/${jobId}/icp?latest=1`)
      .then((r) => (r.ok ? r.json() : { data: null }))
      .then((j) => { if (active) setDraftVersion(j.data?.status === 'draft' ? j.data.version : null) })
      .catch(() => {})
    return () => { active = false }
  }, [jobId])

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <SlidersHorizontal className="h-4 w-4 text-slate-500" /> Scoring rubric
          </CardTitle>
          {criteria.length > 0 && onEdit && (
            <button onClick={onEdit} className="text-xs font-medium text-emerald-600 hover:text-emerald-800">Edit</button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {criteria.length === 0 ? (
          <p className="text-xs leading-relaxed text-slate-400">
            No rubric set — candidates are scored holistically.{' '}
            {onEdit
              ? <button onClick={onEdit} className="font-medium text-emerald-600 hover:text-emerald-800">Set one up</button>
              : <span className="font-medium text-slate-500">Set one up on the Scoring tab</span>}.
          </p>
        ) : (
          <div className="space-y-2.5">
            {sorted.map(c => (
              <div key={c.id}>
                <div className="flex items-center justify-between text-xs">
                  <span className="truncate text-slate-700">{c.name}</span>
                  <span className="ml-2 shrink-0 font-semibold tabular-nums text-slate-500">{c.weight}%</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-slate-500" style={{ width: `${c.weight}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
        {draftVersion != null && (
          <p className="mt-3 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-700">
            Draft v{draftVersion} is not approved yet, so scoring still uses {criteria.length > 0 ? 'the rubric above' : 'no rubric'}.{' '}
            {onEdit && <button onClick={onEdit} className="font-semibold underline underline-offset-2">Review on Scoring</button>}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
