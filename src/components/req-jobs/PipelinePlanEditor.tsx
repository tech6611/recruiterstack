'use client'

import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react'
import {
  Loader2, Save, Flag, ChevronRight, ChevronDown, ArrowRight, ChevronUp,
  UserPlus, Users, FileSignature, CheckCircle2, Lock, Trash2, Plus, GripVertical,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { StageZone } from '@/lib/pipeline/zones'
import { ZONE_SEQUENCE } from '@/lib/pipeline/zones'
import { FUNNEL_STEPS } from '@/lib/pipeline/funnel-steps'
import type { PipelineAutomation, RejectDestination, ZonedStage } from '@/lib/types/pipeline-automations'
import { StageRules } from '@/components/req-jobs/StageRules'

const ZONE_META: Record<StageZone, { title: string; blurb: string; icon: typeof Users; addable: boolean }> = {
  lead:      { title: 'Lead',      blurb: 'Sourced people you’re reaching out to — before they apply.', icon: UserPlus,      addable: false },
  active:    { title: 'Active',    blurb: 'Candidates moving through screening and interviews.',         icon: Users,         addable: true },
  offer:     { title: 'Offer',     blurb: 'Terms, approvals, and closing.',                              icon: FileSignature, addable: true },
  completed: { title: 'Completed', blurb: 'Final outcomes — hired or archived.',                          icon: CheckCircle2,  addable: false },
}

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
  const [rules, setRules] = useState<Record<string, PipelineAutomation[]>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false) // a structural op is in flight
  const [dragId, setDragId] = useState<string | null>(null)   // stage being dragged
  const [overId, setOverId] = useState<string | null>(null)   // stage it is hovering over
  const [armed, setArmed] = useState<string | null>(null)     // row armed for drag (grip pressed)
  const serverNames = useRef<Map<string, string>>(new Map())

  // Automation rules, grouped by stage_id.
  const loadRules = useCallback(async () => {
    const res = await fetch(`/api/jobs/${jobId}/automations`).then(r => r.json()).catch(() => null)
    const list = (res?.data?.rules ?? []) as PipelineAutomation[]
    const byStage: Record<string, PipelineAutomation[]> = {}
    for (const r of list) (byStage[r.stage_id] ??= []).push(r)
    setRules(byStage)
  }, [jobId])

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
  useEffect(() => { load(); loadRules() }, [load, loadRules])

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

  // Optimistically apply a new stage list, then persist the normalized order.
  const persistOrder = async (next: ZonedStage[]) => {
    setStages(next)
    setBusy(true)
    try { await callStages({ action: 'reorder_stages', order: normalizedOrder(next) }) }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to reorder'); await load(true) }
    finally { setBusy(false) }
  }

  const moveStage = async (s: ZonedStage, dir: -1 | 1) => {
    const zoneStages = stages.filter(x => x.zone === s.zone).sort((a, b) => a.order_index - b.order_index)
    const i = zoneStages.findIndex(x => x.id === s.id)
    const j = i + dir
    if (j < 0 || j >= zoneStages.length) return
    // swap order_index locally, then persist a normalized order
    const a = zoneStages[i], b = zoneStages[j]
    await persistOrder(stages.map(x => x.id === a.id ? { ...x, order_index: b.order_index } : x.id === b.id ? { ...x, order_index: a.order_index } : x))
  }

  // ── Drag to reorder (within a zone only) ──
  const canDrop = (target: ZonedStage) => {
    if (!dragId || dragId === target.id || isLocked(target)) return false
    const src = stages.find(x => x.id === dragId)
    return !!src && src.zone === target.zone
  }

  const dropOn = async (target: ZonedStage) => {
    const srcId = dragId
    setDragId(null)
    setOverId(null)
    if (!srcId || !canDrop(target)) return
    const zoneStages = stages.filter(x => x.zone === target.zone).sort((a, b) => a.order_index - b.order_index)
    const from = zoneStages.findIndex(x => x.id === srcId)
    const to = zoneStages.findIndex(x => x.id === target.id)
    if (from < 0 || to < 0 || from === to) return
    // Lift the dragged stage out and re-insert it at the target slot, then hand the
    // zone's existing order_index slots back out in the new sequence.
    const next = [...zoneStages]
    next.splice(to, 0, next.splice(from, 1)[0])
    const slots = zoneStages.map(x => x.order_index)
    const remap = new Map(next.map((x, i) => [x.id, slots[i]]))
    await persistOrder(stages.map(x => remap.has(x.id) ? { ...x, order_index: remap.get(x.id)! } : x))
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
        <Button size="sm" onClick={save} disabled={saving || busy}>
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
            <section key={zone}>
              <div className="flex items-baseline gap-2 border-l-[3px] border-[#221b14] bg-slate-100 px-5 py-2">
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-[#221b14]">{ZONE_META[zone].title}</h4>
                <span className="text-[11px] text-slate-500">· {ZONE_META[zone].blurb}</span>
              </div>

              <div className="flex items-center gap-3 px-7 pb-1 pt-3 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                <span className="flex-1">Stage</span>
                <span className="w-44 shrink-0">Funnel step</span>
                <span className="w-16 shrink-0 text-right">Cands.</span>
                <span className="w-16 shrink-0" />
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-200">
                {zoneStages.map((s, idx) => {
                  const e = edits[s.id]
                  const filled = (rules[s.id]?.length ?? 0) > 0
                  const locked = isLocked(s)
                  return (
                    <div key={s.id} className={idx > 0 ? 'border-t border-slate-100' : ''}>
                      <div
                        draggable={!locked && !busy && armed === s.id}
                        onDragStart={ev => { if (locked || busy) return; setDragId(s.id); ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', s.id) }}
                        onDragEnd={() => { setDragId(null); setOverId(null); setArmed(null) }}
                        onDragOver={ev => { if (!canDrop(s)) return; ev.preventDefault(); ev.dataTransfer.dropEffect = 'move'; setOverId(s.id) }}
                        onDragLeave={() => setOverId(o => (o === s.id ? null : o))}
                        onDrop={ev => { ev.preventDefault(); setArmed(null); dropOn(s) }}
                        className={[
                          'flex items-center gap-3 px-2 py-2 transition-colors',
                          dragId === s.id ? 'opacity-40' : 'hover:bg-slate-50',
                          overId === s.id && canDrop(s) ? 'bg-slate-100 ring-1 ring-inset ring-slate-300' : '',
                        ].join(' ')}
                      >
                        {/* drag handle + reorder */}
                        <div className="flex items-center gap-0.5">
                          <span
                            onMouseDown={() => { if (!locked && !busy) setArmed(s.id) }}
                            onMouseUp={() => setArmed(null)}
                            title={locked ? undefined : 'Drag to reorder'}
                          >
                            <GripVertical
                              aria-hidden
                              className={`h-4 w-4 ${locked ? 'text-transparent' : 'cursor-grab text-slate-300 hover:text-slate-500 active:cursor-grabbing'}`}
                            />
                          </span>
                          <div className="flex flex-col">
                            <button aria-label="Move up" disabled={locked || busy || idx === 0} onClick={() => moveStage(s, -1)} className="text-slate-300 hover:text-slate-600 disabled:opacity-20"><ChevronUp className="h-3 w-3" /></button>
                            <button aria-label="Move down" disabled={locked || busy || idx === zoneStages.length - 1} onClick={() => moveStage(s, 1)} className="text-slate-300 hover:text-slate-600 disabled:opacity-20"><ChevronDown className="h-3 w-3" /></button>
                          </div>
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
                              className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-medium text-slate-800 hover:border-slate-200 focus:border-[#221b14] focus:bg-white focus:outline-none"
                            />
                          )}
                          {s.is_promotion_gate && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gold-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold-700 ring-1 ring-gold-200"><Flag className="h-2.5 w-2.5" /> Gate</span>
                          )}
                          {filled && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" title="Has automation rules" />}
                        </div>

                        {/* funnel step */}
                        <select
                          value={e?.funnel_step ?? ''}
                          onChange={ev => update(s.id, { funnel_step: ev.target.value || null })}
                          className="w-44 shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-[13px] font-medium text-[#221b14] hover:border-slate-300 hover:bg-slate-50 focus:border-[#221b14] focus:outline-none"
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
                          <StageRules
                            jobId={jobId}
                            stageId={s.id}
                            stages={stages.map(x => ({ id: x.id, name: x.name }))}
                            rules={rules[s.id] ?? []}
                            onChanged={loadRules}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {ZONE_META[zone].addable && (
                <button onClick={() => addStage(zone)} disabled={busy} className="mt-2 flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-500 hover:border-[#221b14] hover:text-[#221b14] disabled:opacity-50">
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
    // Cards are `flex-1 basis-0`, so the row always fills the full width and every
    // zone gets an identical slice of it, whatever the zone count.
    <div className="flex items-stretch border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
      {byZone.map(({ zone, stages }, i) => {
        const Icon = ZONE_META[zone].icon
        const candidates = stages.reduce((n, s) => n + s.candidate_count, 0)
        return (
          <Fragment key={zone}>
            <div
              className={[
                'flex min-w-0 flex-1 basis-0 items-center gap-2.5 rounded-lg px-3 py-1.5',
                'border border-[#221b14] bg-[#221b14]',
                // gold underline marks the zones actually holding candidates
                candidates > 0 ? 'shadow-[inset_0_-3px_0_0_#ebb137]' : '',
              ].join(' ')}
            >
              <Icon className="h-4 w-4 shrink-0 text-slate-300" />
              <div className="min-w-0 leading-tight">
                <div className="truncate text-[13px] font-semibold text-slate-50">{ZONE_META[zone].title}</div>
                <div className="truncate text-[11px] text-slate-400">{candidates} candidate{candidates === 1 ? '' : 's'}</div>
              </div>
            </div>
            {i < byZone.length - 1 && (
              <div className="flex w-6 shrink-0 items-center justify-center">
                <ArrowRight className="h-3.5 w-3.5 text-slate-300" />
              </div>
            )}
          </Fragment>
        )
      })}
    </div>
  )
}
