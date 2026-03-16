'use client'

import { useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import type { Scorecard, ScorecardRecommendation } from '@/lib/types/database'

// ── Config ────────────────────────────────────────────────────────────────────

export const RECOMMENDATION_CONFIG: Record<ScorecardRecommendation, { label: string; badge: string; active: string; btn: string }> = {
  strong_yes: { label: 'Strong Yes', badge: 'bg-emerald-100 text-emerald-700', active: 'bg-emerald-600 text-white border-emerald-600', btn: 'border border-emerald-200 text-emerald-700 hover:bg-emerald-50' },
  yes:        { label: 'Yes',        badge: 'bg-blue-100 text-blue-700',       active: 'bg-blue-600 text-white border-blue-600',       btn: 'border border-blue-200 text-blue-700 hover:bg-blue-50'       },
  maybe:      { label: 'Maybe',      badge: 'bg-amber-100 text-amber-700',     active: 'bg-amber-500 text-white border-amber-500',     btn: 'border border-amber-200 text-amber-700 hover:bg-amber-50'   },
  no:         { label: 'No',         badge: 'bg-red-100 text-red-700',         active: 'bg-red-600 text-white border-red-600',         btn: 'border border-red-200 text-red-700 hover:bg-red-50'         },
}

export const RATING_CONFIG = [
  { value: 1 as const, label: 'Poor',      dot: 'bg-red-400',     active: 'bg-red-500 text-white border-red-500',         btn: 'border border-red-200 text-red-600 hover:bg-red-50'         },
  { value: 2 as const, label: 'Fair',      dot: 'bg-amber-400',   active: 'bg-amber-500 text-white border-amber-500',     btn: 'border border-amber-200 text-amber-600 hover:bg-amber-50'   },
  { value: 3 as const, label: 'Good',      dot: 'bg-blue-400',    active: 'bg-blue-500 text-white border-blue-500',       btn: 'border border-blue-200 text-blue-600 hover:bg-blue-50'       },
  { value: 4 as const, label: 'Excellent', dot: 'bg-emerald-400', active: 'bg-emerald-500 text-white border-emerald-500', btn: 'border border-emerald-200 text-emerald-600 hover:bg-emerald-50' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtRelative(d: string) {
  const diff = Date.now() - new Date(d).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

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
