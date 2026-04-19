'use client'

import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { AgentKey } from '@/lib/types/database'

const AGENTS: Array<{ key: AgentKey; title: string; tagline: string }> = [
  { key: 'drafter',   title: 'Drafter',   tagline: 'Generates job descriptions from hiring manager intake.' },
  { key: 'scout',     title: 'Scout',     tagline: 'Imports and parses candidate profiles and CVs.' },
  { key: 'sifter',    title: 'Sifter',    tagline: 'Scores candidates against a rubric.' },
  { key: 'scheduler', title: 'Scheduler', tagline: 'Books interviews via Google / Microsoft / Zoom.' },
  { key: 'closer',    title: 'Closer',    tagline: 'Drafts offer letters and manages approvals.' },
]

export function AgentsCard() {
  const [enabled, setEnabled] = useState<Set<AgentKey>>(new Set())
  const [loaded,  setLoaded]  = useState(false)
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    fetch('/api/org-settings/agents')
      .then(r => r.json())
      .then(({ data }) => {
        setEnabled(new Set((data?.enabled_agents ?? []) as AgentKey[]))
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  function toggle(key: AgentKey) {
    setEnabled(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function save() {
    if (enabled.size === 0) {
      toast.error('Enable at least one agent')
      return
    }
    setSaving(true)
    const res = await fetch('/api/org-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled_agents: Array.from(enabled) }),
    })
    setSaving(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Save failed')
      return
    }
    toast.success('Agent preferences saved')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-600" /> AI agents
        </CardTitle>
        <CardDescription>Turn on the agents your team will use.</CardDescription>
      </CardHeader>
      <CardContent>
        {!loaded ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : (
          <div className="space-y-3">
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
                    <span className={cn('flex h-5 w-9 items-center rounded-full p-0.5 transition-colors',
                      on ? 'bg-emerald-500 justify-end' : 'bg-slate-200 justify-start')}>
                      <span className="h-4 w-4 rounded-full bg-white shadow" />
                    </span>
                  </div>
                </button>
              )
            })}
            <div className="flex justify-end pt-2">
              <Button onClick={save} loading={saving}>Save</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
