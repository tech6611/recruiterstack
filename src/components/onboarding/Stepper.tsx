'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StepDef, StepSlug } from '@/lib/onboarding/steps'

export function Stepper({ steps, currentSlug }: { steps: StepDef[]; currentSlug: StepSlug }) {
  const currentIdx = steps.findIndex(s => s.slug === currentSlug)

  return (
    <nav aria-label="Onboarding progress" className="flex items-center gap-1.5">
      {steps.map((s, i) => {
        const done    = i < currentIdx
        const current = i === currentIdx
        return (
          <div key={s.slug} className="flex items-center gap-1.5">
            <div
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                done    && 'bg-emerald-600 text-white',
                current && 'bg-slate-900 text-white ring-4 ring-slate-900/10',
                !done && !current && 'bg-slate-200 text-slate-500',
              )}
              aria-current={current ? 'step' : undefined}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            {i < steps.length - 1 && (
              <div className={cn('h-px w-6', done ? 'bg-emerald-600' : 'bg-slate-200')} />
            )}
          </div>
        )
      })}
    </nav>
  )
}
