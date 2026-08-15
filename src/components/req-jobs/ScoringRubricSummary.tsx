'use client'

import { SlidersHorizontal } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import type { ScoringCriterion } from '@/lib/types/database'

/** A read-only glance at the job's scoring rubric for the Overview sidebar —
 *  each criterion with its weight and a proportional bar. */
export function ScoringRubricSummary({
  criteria,
  onEdit,
}: {
  criteria: ScoringCriterion[]
  onEdit?: () => void
}) {
  const sorted = [...criteria].sort((a, b) => b.weight - a.weight)

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
      </CardContent>
    </Card>
  )
}
