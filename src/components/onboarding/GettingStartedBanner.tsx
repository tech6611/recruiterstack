'use client'

/**
 * First-run "Getting started" banner for the dashboard. Self-contained: fetches
 * /api/onboarding/checklist (with ?sync=1 to reconcile the notification nudges
 * once per load) and renders nothing while loading, on error, or once every
 * step the viewer sees is complete. Auto-ticks — there's no manual check-off.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Rocket, Check, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OnboardingStepState } from '@/lib/onboarding/checklist-steps'

interface ChecklistResponse {
  steps:          OnboardingStepState[]
  completedCount: number
  totalCount:     number
  complete:       boolean
}

export function GettingStartedBanner() {
  const [data, setData] = useState<ChecklistResponse | null>(null)
  const [expanded, setExpanded] = useState(true)

  useEffect(() => {
    fetch('/api/onboarding/checklist?sync=1')
      .then(r => (r.ok ? r.json() : null))
      .then((j: ChecklistResponse | null) => setData(j))
      .catch(() => setData(null))
  }, [])

  // Hide while loading, on error, with no applicable steps, or once complete.
  if (!data || data.totalCount === 0 || data.complete) return null

  const pct = Math.round((data.completedCount / data.totalCount) * 100)

  return (
    <div className="shrink-0 px-4 pt-3">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 overflow-hidden">
        {/* Header row */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600">
            <Rocket className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-800">
              Finish setting up RecruiterStack
            </p>
            <p className="text-xs text-slate-500">
              {data.completedCount} of {data.totalCount} done
            </p>
          </div>
          {/* Progress bar */}
          <div className="hidden sm:block w-32">
            <div className="h-2 w-full overflow-hidden rounded-full bg-emerald-100">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
          {expanded
            ? <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" />
            : <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />}
        </button>

        {/* Steps */}
        {expanded && (
          <div className="max-h-64 overflow-auto border-t border-emerald-100 px-2 py-2">
            {data.steps.map(step => (
              <div
                key={step.key}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-2 py-2',
                  step.done ? 'opacity-60' : 'hover:bg-white',
                )}
              >
                <div
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                    step.done
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : 'border-slate-300 bg-white',
                  )}
                >
                  {step.done && <Check className="h-3 w-3" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={cn('text-sm', step.done ? 'text-slate-500 line-through' : 'text-slate-800 font-medium')}>
                    {step.label}
                  </p>
                  {!step.done && (
                    <p className="text-xs text-slate-500">{step.description}</p>
                  )}
                </div>
                {!step.done && (
                  <Link
                    href={step.href}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#221b14] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#33271b] transition-colors"
                  >
                    Set up <ArrowRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
