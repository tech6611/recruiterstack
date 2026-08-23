'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Loader2, Save, Flag, ChevronRight, ChevronDown, ArrowRight, ChevronUp,
  UserPlus, Users, FileSignature, CheckCircle2, Lock, Trash2, Plus,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { StageZone } from '@/lib/pipeline/zones'
import { ZONE_SEQUENCE } from '@/lib/pipeline/zones'
import { FUNNEL_STEPS } from '@/lib/pipeline/funnel-steps'
import type { RejectDestination, ZonedStage } from '@/lib/types/pipeline-automations'

const ZONE_META: Record<StageZone, { title: string; blurb: string; icon: typeof Users; addable: boolean }> = {
  lead:      { title: 'Lead',      blurb: 'Sourced people you’re reaching out to — before they apply.', icon: UserPlus,      addable: false },
  active:    { title: 'Active',    blurb: 'Candidates moving through screening and interviews.',         icon: Users,         addable: true },
  offer:     { title: 'Offer',     blurb: 'Terms, approvals, and closing.',                              icon: FileSignature, addable: true },
  completed: { title: 'Completed', blurb: 'Final outcomes — hired or archived.',                          icon: CheckCircle2,  addable: false },
}

const REJECT_OPTIONS: { value: RejectDestination; label: string }[] = [
  { value: 'archive', label: 'Archive' },
  { value: 'hold', label: 'Hold' },
  { value: 'review', label: 'Send to review' },
]

const STEP_GROUPS = ZONE_SEQUENCE.map(zone => ({ zone, steps: FUNNEL_STEPS.filter(s => s.zone === zone) })).filter(g => g.steps.length > 0)

const LOCKED_NAMES = new Set(['Hired', 'Rejected', 'Archived'])
const isLocked = (s: ZonedStage) => s.zone === 'lead' || LOCKED_NAMES.has(s.name.trim())

type Edit = { entry_intent: string; advance_criteria: string; reject_to: RejectDestination; funnel_step: string | null }
const editFrom = (s: ZonedStage): Edit => ({
  entry_intent: s.playbook?.entry_intent ?? '',
  advance_criteria: s.playbook?.advance_criteria ?? '',
  reject_to: s.playbook?.reject_to ?? 'archive',
  funnel_step: s.funnel_step ?? null,
})

export function PipelinePlanEditor({ jobId }: { jobId: string }) {
  const [stages, setStages] = useState<ZonedStage[]>([])
  const [edits, setEdits] = useState<Record<string, Edit>>({})
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false) // a structural op is in flight
  const serverNames = useRef<Map<string, string>>(new Map())

  // Load stages; preserve any in-progress playbook/funnel edits (keyed by id).
  const load = useCallback(async (preserve = false) => {
    if (!preserve) setLoading(true)
    const res = await fetch(`/api/jobs/${jobId}/pipeline-plan`).then(r => r.json()).catch(() => null)
    const list = (res?.data?.stages ?? []) as ZonedStage[]
    setStages(list)
    serverNames.current = new Map(list.map(s => [s.id, s.name]))
    setEdits(prev => Object.fromEntries(list.map(s => [s.id, preserve && prev[s.id] ? prev[s.id] : editFrom(s)])))
    setLoading(false)
  }, [jobId])
  useEffect(() => { load() }, [load])

  const update = (id: string, patch: Partial<Edit>) => setEdits(e => ({ ...e, [id]: { ...e[id], ...patch } }))
  const toggle = (id: string) => setOpen(o => ({ ...o, [id]: !o[id] }))

  // ── Save playbooks + funnel mapping (batched) ──
  const save = async () => {
    setSaving(true)
    try {
      const playbooks = stages.map(s => ({
        stage_id: s.id,
        entry_intent: edits[s.id]?.entry_intent.trim() || null,
        advance_criteria: edits[s.id]?.advance_criteria.trim() || null,
        reject_to: edits[s.id]?.reject_to ?? 'archive',
        funnel_step: edits[s.id]?.funnel_step ?? null,
      }))
      const res = await fetch(`/api/jobs/${jobId}/pipeline-plan`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ playbooks }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Failed to save')
      toast.success('Pipeline plan saved.')
      await load(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save plan')
    } finally { setSaving(false) }
  }

  // ── Structural stage edits (immediate) ──
  const callStages = async (payload: Record<string, unknown>) => {
    const res = await fetch(`/api/jobs/${jobId}/pipeline-plan`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j.error || 'Something went wrong')
    return j
  }

  // Dense order_index across zones (keeps the board consistent).
  const normalizedOrder = (list: ZonedStage[]) => {
    const flat = ZONE_SEQUENCE.flatMap(z => list.filter(s => s.zone === z).sort((a, b) => a.order_index - b.order_index))
    return flat.map((s, i) => ({ id: s.id, order_index: i }))
  }

  const addStage = async (zone: StageZone) => {
    setBusy(true)
    try {
      await callStages({ action: 'create_stage', name: 'New stage', zone })
      await load(true)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to add stage') } finally { setBusy(false) }
  }

  const commitRename = async (s: ZonedStage, value: string) => {
    const name = value.trim()
    if (!name || name === serverNames.current.get(s.id)) {
      // reset to server value if blank/unchanged
      setStages(list => list.map(x => x.id === s.id ? { ...x, name: serverNames.current.get(s.id) ?? x.name } : x))
      return
    }
    try {
      await callStages({ action: 'rename_stage', stage_id: s.id, name })
      serverNames.current.set(s.id, name)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to rename')
      setStages(list => list.map(x => x.id === s.id ? { ...x, name: serverNames.current.get(s.id) ?? x.name } : x))
    }
  }

  const removeStage = async (s: ZonedStage) => {
    if (!confirm(`Delete the “${s.name}” stage? Candidates in it will be left unassigned.`)) return
    setBusy(true)
    try {
      await callStages({ action: 'delete_stage', stage_id: s.id })
      await load(true)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to delete') } finally { setBusy(false) }
  }

  const moveStage = async (s: ZonedStage, dir: -1 | 1) => {
    const zoneStages = stages.filter(x => x.zone === s.zone).sort((a, b) => a.order_index - b.order_index)
    const i = zoneStages.findIndex(x => x.id === s.id)
    const j = i + dir
    if (j < 0 || j >= zoneStages.length) return
    // swap order_index locally, then persist a normalized order
    const a = zoneStages[i], b = zoneStages[j]
    const swapped = stages.map(x => x.id === a.id ? { ...x, order_index: b.order_index } : x.id === b.id ? { ...x, order_index: a.order_index } : x)
    setStages(swapped)
    setBusy(true)
    try { await callStages({ action: 'reorder_stages', order: normalizedOrder(swapped) }) }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to reorder'); await load(true) }
    finally { setBusy(false) }
  }

  const byZone = useMemo(
    () => ZONE_SEQUENCE
      .map(zone => ({ zone, stages: stages.filter(s => s.zone === zone).sort((a, b) => a.order_index - b.order_index) }))
      .filter(g => g.stages.length > 0),
    [stages],
  )

  if (loading) {
    return <div className="rounded-xl border border-slate-200 bg-white"><div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div></div>
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h3 className="text-[15px] font-semibold text-slate-900">Pipeline Plan</h3>
          <p className="mt-0.5 text-xs text-slate-500">Add and arrange stages, map each to a funnel step, and sketch what happens there.</p>
        </div>
        <Button size="sm" onClick={save} disabled={saving || busy} className="bg-indigo-600 hover:bg-indigo-700">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save plan
        </Button>
      </div>

      <ZoneStepper byZone={byZone} />

      {byZone.length === 0 ? (
        <div className="px-5 py-14 text-center"><p className="text-sm font-medium text-slate-600">No stages yet</p></div>
      ) : (
        <div className="divide-y divide-slate-100">
          {byZone.map(({ zone, stages: zoneStages }) => (
            <section key={zone} className="px-5 py-4">
              <div className="mb-1 flex items-baseline gap-2">
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{ZONE_META[zone].title}</h4>
                <span className="text-[11px] text-slate-400">· {ZONE_META[zone].blurb}</span>
              </div>

              <div className="flex items-center gap-3 px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                <span className="flex-1">Stage</span>
                <span className="w-44 shrink-0">Funnel step</span>
                <span className="w-16 shrink-0 text-right">Cands.</span>
                <span className="w-16 shrink-0" />
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-200">
                {zoneStages.map((s, idx) => {
                  const e = edits[s.id]
                  const filled = !!(e?.entry_intent.trim() || e?.advance_criteria.trim())
                  const locked = isLocked(s)
                  return (
                    <div key={s.id} className={idx > 0 ? 'border-t border-slate-100' : ''}>
                      <div className="flex items-center gap-3 px-2 py-2 hover:bg-slate-50">
                        {/* reorder */}
                        <div className="flex flex-col">
                          <button aria-label="Move up" disabled={locked || busy || idx === 0} onClick={() => moveStage(s, -1)} className="text-slate-300 hover:text-slate-600 disabled:opacity-20"><ChevronUp className="h-3 w-3" /></button>
                          <button aria-label="Move down" disabled={locked || busy || idx === zoneStages.length - 1} onClick={() => moveStage(s, 1)} className="text-slate-300 hover:text-slate-600 disabled:opacity-20"><ChevronDown className="h-3 w-3" /></button>
                        </div>

                        {/* name (editable unless locked) */}
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          {locked ? (
                            <span className="flex items-center gap-1.5 truncate text-sm font-medium text-slate-700">
                              <Lock className="h-3 w-3 shrink-0 text-slate-300" />{s.name}
                            </span>
                          ) : (
                            <input
                              value={s.name}
                              onChange={ev => setStages(list => list.map(x => x.id === s.id ? { ...x, name: ev.target.value } : x))}
                              onBlur={ev => commitRename(s, ev.target.value)}
                              onKeyDown={ev => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur() }}
                              className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-medium text-slate-800 hover:border-slate-200 focus:border-indigo-400 focus:bg-white focus:outline-none"
                            />
                          )}
                          {s.is_promotion_gate && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-600 ring-1 ring-violet-200"><Flag className="h-2.5 w-2.5" /> Gate</span>
                          )}
                          {filled && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" title="Plan set" />}
                        </div>

                        {/* funnel step */}
                        <select
                          value={e?.funnel_step ?? ''}
                          onChange={ev => update(s.id, { funnel_step: ev.target.value || null })}
                          className="w-44 shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-[13px] font-medium text-indigo-600 hover:border-slate-300 focus:border-indigo-400 focus:outline-none"
                        >
                          <option value="">— unmapped —</option>
                          {STEP_GROUPS.map(g => (
                            <optgroup key={g.zone} label={ZONE_META[g.zone].title}>
                              {g.steps.map(st => <option key={st.id} value={st.id}>{st.label}</option>)}
                            </optgroup>
                          ))}
                        </select>

                        {/* candidate count */}
                        <span className="flex w-16 shrink-0 items-center justify-end gap-1 text-sm text-slate-500">
                          <Users className="h-3.5 w-3.5 text-slate-300" /><span className="tabular-nums">{s.candidate_count}</span>
                        </span>

                        {/* actions */}
                        <div className="flex w-16 shrink-0 items-center justify-end gap-1">
                          <button onClick={() => toggle(s.id)} aria-label="Edit plan" className="text-slate-400 hover:text-slate-600">
                            {open[s.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                          {!locked && (
                            <button onClick={() => removeStage(s)} disabled={busy} aria-label="Delete stage" className="text-slate-300 hover:text-red-500 disabled:opacity-30"><Trash2 className="h-3.5 w-3.5" /></button>
                          )}
                        </div>
                      </div>

                      {open[s.id] && (
                        <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-3">
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Field label="When a candidate lands here" value={e?.entry_intent ?? ''} onChange={v => update(s.id, { entry_intent: v })} placeholder="e.g. Screen against the ideal-candidate profile" />
                            <Field label="Rule for moving forward" value={e?.advance_criteria ?? ''} onChange={v => update(s.id, { advance_criteria: v })} placeholder="e.g. Strong fit, no missing must-haves → advance" />
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-[11px] uppercase tracking-wide text-slate-400">If rejected</span>
                            <Select value={e?.reject_to ?? 'archive'} onChange={ev => update(s.id, { reject_to: ev.target.value as RejectDestination })} className="h-8 w-40 text-sm">
                              {REJECT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </Select>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {ZONE_META[zone].addable && (
                <button onClick={() => addStage(zone)} disabled={busy} className="mt-2 flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-500 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50">
                  <Plus className="h-3.5 w-3.5" /> Add {ZONE_META[zone].title.toLowerCase()} stage
                </button>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function ZoneStepper({ byZone }: { byZone: { zone: StageZone; stages: ZonedStage[] }[] }) {
  return (
    <div className="flex items-stretch gap-1 overflow-x-auto border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
      {byZone.map(({ zone, stages }, i) => {
        const Icon = ZONE_META[zone].icon
        const candidates = stages.reduce((n, s) => n + s.candidate_count, 0)
        return (
          <div key={zone} className="flex items-center gap-1">
            <div className="flex min-w-[140px] items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5">
              <Icon className="h-4 w-4 shrink-0 text-indigo-500" />
              <div className="leading-tight">
                <div className="text-[13px] font-semibold text-slate-800">{ZONE_META[zone].title}</div>
                <div className="text-[11px] text-slate-400">{candidates} candidate{candidates === 1 ? '' : 's'} · {stages.length} stage{stages.length === 1 ? '' : 's'}</div>
              </div>
            </div>
            {i < byZone.length - 1 && <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />}
          </div>
        )
      })}
    </div>
  )
}

function Field({ label, value, onChange, placeholder, rows = 2 }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</label>
      <Textarea rows={rows} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}
