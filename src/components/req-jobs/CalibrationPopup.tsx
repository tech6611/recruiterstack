'use client'

import { useState } from 'react'
import { ThumbsUp, ThumbsDown, ChevronDown, X, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * The Juicebox-style "Review N profiles to calibrate" card, as a FOLDABLE floating
 * pop-up. Presentational only — it reuses the job's existing calibration engine:
 * the trio is picked by pickCalibrationSet (diverse across the score range) and each
 * 👍/👎 flows through the same setSourcingDecision path as the matrix. "Review all"
 * opens the full diverse set in the matrix below.
 */

export interface CalibrationProfile {
  candidate_id: string
  name: string
  title: string | null
  company: string | null
  decision: string | null
}

const AVATAR_COLORS = ['#4f46e5', '#0ea5e9', '#f97316', '#db2777', '#16a34a', '#7c3aed', '#0891b2', '#ca8a04']

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  if (words.length === 1) return words[0][0].toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

function colorFor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

export function CalibrationPopup({
  profiles,
  onDecide,
  onReviewAll,
}: {
  profiles: CalibrationProfile[]
  onDecide: (candidateId: string, decision: 'yes' | 'no') => void
  onReviewAll: () => void
}) {
  const [folded, setFolded] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  if (dismissed || profiles.length === 0) return null

  return (
    <div className="fixed bottom-5 right-5 z-40 w-[min(360px,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_16px_46px_rgba(20,20,30,0.18),0_2px_8px_rgba(20,20,30,0.06)]">
      {/* header */}
      <div className="flex items-center gap-2 px-4 py-3">
        <h4 className="flex-1 text-[13px] font-semibold text-slate-800">
          Review {profiles.length} profile{profiles.length === 1 ? '' : 's'} to calibrate your search
        </h4>
        <Button size="sm" onClick={onReviewAll} title="Open the full diverse set below">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Review all
        </Button>
        <button
          type="button"
          onClick={() => setFolded((v) => !v)}
          aria-label={folded ? 'Unfold' : 'Fold'}
          title={folded ? 'Unfold' : 'Fold'}
          className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 text-slate-400 hover:bg-slate-50"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${folded ? 'rotate-180' : ''}`} />
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          title="Dismiss"
          className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-50"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* profiles (collapsible) */}
      <div
        className={`overflow-hidden transition-[max-height,opacity] duration-200 ${folded ? 'max-h-0 opacity-0' : 'max-h-[520px] opacity-100'}`}
      >
        {profiles.map((p) => {
          const yes = p.decision === 'yes'
          const no = p.decision === 'no'
          return (
            <div key={p.candidate_id} className="flex items-center gap-3 border-t border-slate-100 px-4 py-2.5">
              <span
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[12px] font-bold text-white"
                style={{ background: colorFor(p.candidate_id) }}
              >
                {initials(p.name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-slate-800">{p.name}</div>
                <div className="truncate text-[12px] text-slate-500">
                  {p.title ?? 'Unknown role'}
                  {p.company ? ` at ${p.company}` : ''}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => onDecide(p.candidate_id, 'yes')}
                  aria-label="Good fit"
                  title="Good fit"
                  className={`grid h-7 w-7 place-items-center rounded-md border ${yes ? 'border-emerald-200 bg-emerald-50 text-emerald-600' : 'border-slate-200 text-slate-400 hover:bg-slate-50'}`}
                >
                  <ThumbsUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onDecide(p.candidate_id, 'no')}
                  aria-label="Not a fit"
                  title="Not a fit"
                  className={`grid h-7 w-7 place-items-center rounded-md border ${no ? 'border-rose-200 bg-rose-50 text-rose-600' : 'border-slate-200 text-slate-400 hover:bg-slate-50'}`}
                >
                  <ThumbsDown className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )
        })}
        {/* fold grip */}
        <button
          type="button"
          onClick={() => setFolded(true)}
          aria-label="Fold"
          className="grid w-full place-items-center py-2 hover:bg-slate-50"
        >
          <span className="block h-1 w-9 rounded-full bg-slate-300" />
        </button>
      </div>
    </div>
  )
}
