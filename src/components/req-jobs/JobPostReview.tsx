'use client'

import { useState } from 'react'
import { ScanText, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface Dimension { key: string; score: number; note: string }
interface Issue { severity: 'high' | 'medium' | 'low'; category: string; quote?: string | null; suggestion: string }
interface Review { dimensions: Dimension[]; issues: Issue[]; tightened_summary?: string | null }

const DIM_LABEL: Record<string, string> = {
  clarity: 'Clarity',
  inclusivity: 'Inclusivity',
  engagement: 'Engagement',
  completeness: 'Completeness',
}
const SEV: Record<Issue['severity'], string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-100 text-slate-600',
}

/** Component 13 — a one-click AI QA pass over the job post. Read-only: it suggests;
 *  the recruiter edits the description themselves. */
export function JobPostReview({ jobId }: { jobId: string }) {
  const [loading, setLoading] = useState(false)
  const [review, setReview] = useState<Review | null>(null)

  async function run() {
    setLoading(true)
    const res = await fetch(`/api/jobs/${jobId}/post-review`, { method: 'POST' })
    setLoading(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error ?? 'Could not review the job post')
      return
    }
    const { data } = await res.json()
    setReview(data as Review)
  }

  return (
    <div className="mt-5 pt-4 border-t border-slate-100">
      <div className="flex items-center justify-between gap-2">
        <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">AI post review</dt>
        <Button size="sm" variant="outline" onClick={run} loading={loading}>
          <ScanText className="h-3.5 w-3.5" /> {review ? 'Re-review' : 'Review job post'}
        </Button>
      </div>

      {review && (
        <div className="mt-3 space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {review.dimensions.map((d) => (
              <div key={d.key} className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5" title={d.note}>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-medium text-slate-600">{DIM_LABEL[d.key] ?? d.key}</span>
                  <span className={`text-sm font-bold ${d.score >= 4 ? 'text-emerald-600' : d.score >= 3 ? 'text-amber-600' : 'text-red-600'}`}>{d.score}/5</span>
                </div>
                <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">{d.note}</p>
              </div>
            ))}
          </div>

          {review.issues.length > 0 && (
            <div className="space-y-2">
              {review.issues.map((it, i) => (
                <div key={i} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${SEV[it.severity]}`}>{it.severity}</span>
                    <span className="text-xs font-medium text-slate-600">{it.category}</span>
                  </div>
                  {it.quote && <p className="mt-1.5 border-l-2 border-slate-200 pl-2 text-xs italic text-slate-500">“{it.quote}”</p>}
                  <p className="mt-1.5 text-xs text-slate-700">{it.suggestion}</p>
                </div>
              ))}
            </div>
          )}

          {review.tightened_summary && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                <AlertTriangle className="h-3 w-3" /> Suggested opening
              </div>
              <p className="text-xs text-slate-700">{review.tightened_summary}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
