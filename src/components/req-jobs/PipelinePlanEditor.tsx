'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Save, GitBranch, Flag } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { StageZone } from '@/lib/pipeline/zones'
import { ZONE_SEQUENCE } from '@/lib/pipeline/zones'
import type { RejectDestination, ZonedStage } from '@/lib/types/pipeline-automations'

// How each zone is introduced to the recruiter. Order follows ZONE_SEQUENCE.
const ZONE_META: Record<StageZone, { title: string; blurb: string }> = {
  lead: {
    title: 'Lead zone',
    blurb: 'Sourced people you’re reaching out to — before they formally apply.',
  },
  active: {
    title: 'Active pipeline',
    blurb: 'Candidates moving through screening and interviews.',
  },
  offer: {
    title: 'Offer',
    blurb: 'Terms, approvals, and closing.',
  },
  completed: {
    title: 'Completed',
    blurb: 'Final outcomes — hired or archived.',
  },
}

const REJECT_OPTIONS: { value: RejectDestination; label: string }[] = [
  { value: 'archive', label: 'Archive' },
  { value: 'hold', label: 'Hold' },
  { value: 'review', label: 'Send to review' },
]

// Local editable shape, one per stage.
type Edit = { entry_intent: string; advance_criteria: string; reject_to: RejectDestination }

function editFrom(s: ZonedStage): Edit {
  return {
    entry_intent: s.playbook?.entry_intent ?? '',
    advance_criteria: s.playbook?.advance_criteria ?? '',
    reject_to: s.playbook?.reject_to ?? 'archive',
  }
}

/** The pipeline plan: the recruiter sketches, per stage, what happens when a
 *  candidate lands there and the rule for moving them forward. This is the sketch
 *  that automation agents will later read (Slice 3+). No agents run yet. */
export function PipelinePlanEditor({ jobId }: { jobId: string }) {
  const [stages, setStages] = useState<ZonedStage[]>([])
  const [edits, setEdits] = useState<Record<string, Edit>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/jobs/${jobId}/pipeline-plan`).then(r => r.json()).catch(() => null)
    const list = (res?.data?.stages ?? []) as ZonedStage[]
    setStages(list)
    setEdits(Object.fromEntries(list.map(s => [s.id, editFrom(s)])))
    setLoading(false)
  }, [jobId])
  useEffect(() => { load() }, [load])

  const update = (stageId: string, patch: Partial<Edit>) =>
    setEdits(e => ({ ...e, [stageId]: { ...e[stageId], ...patch } }))

  const save = async () => {
    setSaving(true)
    try {
      const playbooks = stages.map(s => ({
        stage_id: s.id,
        entry_intent: edits[s.id]?.entry_intent.trim() || null,
        advance_criteria: edits[s.id]?.advance_criteria.trim() || null,
        reject_to: edits[s.id]?.reject_to ?? 'archive',
      }))
      const res = await fetch(`/api/jobs/${jobId}/pipeline-plan`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playbooks }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Failed to save')
      toast.success('Pipeline plan saved.')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save plan')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </CardContent>
      </Card>
    )
  }

  // Group stages by zone, preserving funnel order within each.
  const byZone = ZONE_SEQUENCE
    .map(zone => ({ zone, stages: stages.filter(s => s.zone === zone).sort((a, b) => a.order_index - b.order_index) }))
    .filter(g => g.stages.length > 0)

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-slate-500" /> Pipeline Plan
          </CardTitle>
          <CardDescription>
            For each stage, note what should happen when a candidate lands there and the rule for moving
            them forward. This sketch is what automation agents will act on later — for now it’s just your plan.
          </CardDescription>
        </div>
        <Button onClick={save} size="sm" disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save plan
        </Button>
      </CardHeader>

      <CardContent className="space-y-6">
        {byZone.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center">
            <p className="text-sm font-medium text-slate-600">No stages yet</p>
            <p className="mt-1 text-xs text-slate-400">This job has no pipeline stages to plan.</p>
          </div>
        ) : (
          byZone.map(({ zone, stages: zoneStages }) => (
            <section key={zone} className="space-y-3">
              <div className="border-b border-slate-100 pb-1.5">
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {ZONE_META[zone].title}
                </h4>
                <p className="text-xs text-slate-400">{ZONE_META[zone].blurb}</p>
              </div>

              {zoneStages.map(s => (
                <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-700">{s.name}</span>
                    {s.is_promotion_gate && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-600 ring-1 ring-violet-200">
                        <Flag className="h-2.5 w-2.5" /> Promotion gate
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <Label className="mb-1 block text-[11px] uppercase tracking-wide text-slate-400">
                        When a candidate lands here
                      </Label>
                      <Textarea
                        rows={2}
                        value={edits[s.id]?.entry_intent ?? ''}
                        onChange={e => update(s.id, { entry_intent: e.target.value })}
                        placeholder="e.g. Screen against the ideal-candidate profile"
                      />
                    </div>
                    <div>
                      <Label className="mb-1 block text-[11px] uppercase tracking-wide text-slate-400">
                        Rule for moving forward
                      </Label>
                      <Textarea
                        rows={2}
                        value={edits[s.id]?.advance_criteria ?? ''}
                        onChange={e => update(s.id, { advance_criteria: e.target.value })}
                        placeholder="e.g. Strong fit and no missing must-haves → advance"
                      />
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Label className="text-[11px] uppercase tracking-wide text-slate-400">If rejected</Label>
                    <Select
                      value={edits[s.id]?.reject_to ?? 'archive'}
                      onChange={e => update(s.id, { reject_to: e.target.value as RejectDestination })}
                      className="h-8 w-40 text-sm"
                    >
                      {REJECT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </Select>
                  </div>
                </div>
              ))}
            </section>
          ))
        )}
      </CardContent>
    </Card>
  )
}
