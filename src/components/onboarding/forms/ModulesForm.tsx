'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { submitOnboardingStep } from '@/lib/onboarding/client'
import { cn } from '@/lib/utils'
import type { AgentKey } from '@/lib/types/database'

const AGENTS: Array<{ key: AgentKey; title: string; tagline: string }> = [
  { key: 'drafter',   title: 'Drafter',   tagline: 'Generates job descriptions from hiring manager intake.' },
  { key: 'scout',     title: 'Scout',     tagline: 'Imports and parses candidate profiles and CVs.' },
  { key: 'sifter',    title: 'Sifter',    tagline: 'Scores candidates against a rubric, auto-advances or rejects.' },
  { key: 'scheduler', title: 'Scheduler', tagline: 'Books interviews via Google / Microsoft / Zoom.' },
  { key: 'closer',    title: 'Closer',    tagline: 'Drafts offer letters and manages approval workflows.' },
]

export function ModulesForm({ defaults }: { defaults: AgentKey[] }) {
  const router = useRouter()
  const [enabled, setEnabled] = useState<Set<AgentKey>>(new Set(defaults))
  const [submitting, setSubmitting] = useState(false)

  function toggle(key: AgentKey) {
    setEnabled(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function onContinue() {
    if (enabled.size === 0) return
    setSubmitting(true)
    const res = await submitOnboardingStep('/api/onboarding/modules', { enabled_agents: Array.from(enabled) })
    setSubmitting(false)
    if (res) router.push(res.next)
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        {AGENTS.map(a => {
          const on = enabled.has(a.key)
          return (
            <button
              key={a.key}
              type="button"
              onClick={() => toggle(a.key)}
              className={cn(
                'w-full rounded-lg border p-3 text-left transition-colors',
                on ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:bg-slate-50',
              )}
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{a.title}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{a.tagline}</div>
                </div>
                <span
                  className={cn(
                    'flex h-5 w-9 items-center rounded-full p-0.5 transition-colors',
                    on ? 'bg-emerald-500 justify-end' : 'bg-slate-200 justify-start',
                  )}
                >
                  <span className="h-4 w-4 rounded-full bg-white shadow" />
                </span>
              </div>
            </button>
          )
        })}
      </div>
      {enabled.size === 0 && (
        <p className="text-xs text-red-600">Enable at least one agent to continue.</p>
      )}
      <div className="flex justify-end">
        <Button onClick={onContinue} disabled={enabled.size === 0} loading={submitting}>
          Continue
        </Button>
      </div>
    </div>
  )
}
