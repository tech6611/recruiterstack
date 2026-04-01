'use client'

import { useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import type { Scorecard, ScorecardRecommendation } from '@/lib/types/database'
import { fmtRelative } from '@/lib/ui/date-utils'
import { RECOMMENDATION_CONFIG, RATING_CONFIG } from '@/lib/ui/scorecard-config'

// ── Helpers ───────────────────────────────────────────────────────────────────

export function RatingDots({ rating }: { rating: number }) {
  const cfg = RATING_CONFIG[rating - 1]
  return (
    <div className="flex gap-0.5 items-center">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className={`h-2 w-2 rounded-full ${i <= rating ? (cfg?.dot ?? 'bg-slate-400') : 'bg-slate-200'}`} />
      ))}
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

interface ScorecardCardProps {
  scorecard: Scorecard
  onDelete: (id: string) => void
}

export default function ScorecardCard({ scorecard, onDelete }: ScorecardCardProps) {
  const [deleting, setDeleting] = useState(false)
  const rec = RECOMMENDATION_CONFIG[scorecard.recommendation]

  const handleDelete = async () => {
    if (!confirm('Delete this scorecard?')) return
    setDeleting(true)
    await fetch(`/api/scorecards/${scorecard.id}`, { method: 'DELETE' })
    onDelete(scorecard.id)
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${rec.badge}`}>
            {rec.label}
          </span>
          <span className="text-sm font-semibold text-slate-800">{scorecard.interviewer_name}</span>
          {scorecard.stage_name && (
            <>
              <span className="text-slate-300">·</span>
              <span className="text-xs text-slate-500">{scorecard.stage_name}</span>
            </>
          )}
          <span className="text-slate-300">·</span>
          <span className="text-xs text-slate-400">{fmtRelative(scorecard.created_at)}</span>
        </div>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="shrink-0 p-1 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Criteria grid */}
      {scorecard.scores.length > 0 && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
          {scorecard.scores.map(s => (
            <div key={s.criterion} className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500 truncate">{s.criterion}</span>
              <RatingDots rating={s.rating} />
            </div>
          ))}
        </div>
      )}

      {/* Notes */}
      {scorecard.overall_notes && (
        <p className="text-xs text-slate-500 bg-white rounded-lg border border-slate-100 px-3 py-2 leading-relaxed">
          {scorecard.overall_notes}
        </p>
      )}
    </div>
  )
}
