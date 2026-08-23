'use client'

import { useState } from 'react'
import { Plus, Trash2, Loader2, Zap, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { RULE_FIELDS, ruleField, operatorsForField, isValidCondition, describeCondition } from '@/lib/pipeline/rule-fields'
import type {
  PipelineAutomation, RuleCondition, RuleField, RuleOperator,
  AutomationActionType, AutomationMode, AutomationTrigger, ConditionMatch,
} from '@/lib/types/pipeline-automations'

const WHEN_OPTS: { v: AutomationTrigger; l: string }[] = [
  { v: 'stage_entry', l: 'When a candidate enters this stage' },
  { v: 'sla_elapsed', l: 'Each day a candidate waits here' },
]
const ACTION_OPTS: { v: AutomationActionType; l: string }[] = [
  { v: 'move_stage', l: 'Move to…' },
  { v: 'archive', l: 'Archive (reject)' },
  { v: 'request_approval', l: 'Request approval' },
  { v: 'send_email', l: 'Send an email' },
]
const MODE_OPTS: { v: AutomationMode; l: string }[] = [
  { v: 'auto', l: 'Automatically' },
  { v: 'suggest', l: 'Suggest to me' },
  { v: 'approval_required', l: 'Needs approval' },
]
const actionLabel = (a: AutomationActionType) => ACTION_OPTS.find(o => o.v === a)?.l ?? a
const modeLabel = (m: AutomationMode) => MODE_OPTS.find(o => o.v === m)?.l ?? m

type Stage = { id: string; name: string }
type DraftCond = { field: RuleField; operator: RuleOperator; value: string }

const firstOp = (field: RuleField): RuleOperator => operatorsForField(field)[0]?.op ?? 'is'
const blankCond = (): DraftCond => ({ field: 'days_in_stage', operator: firstOp('days_in_stage'), value: '' })

function describeRule(r: PipelineAutomation, stages: Stage[]): string {
  const when = WHEN_OPTS.find(w => w.v === r.trigger)?.l ?? r.trigger
  const conds = r.config?.conditions ?? []
  const joiner = (r.config?.match ?? 'all') === 'all' ? ' and ' : ' or '
  const ifText = conds.length ? `, if ${conds.map(c => describeCondition(c.field, c.operator, c.value)).join(joiner)}` : ''
  const action = r.action_type === 'move_stage'
    ? `move to ${stages.find(s => s.id === r.config?.target_stage_id)?.name ?? '—'}`
    : actionLabel(r.action_type).toLowerCase()
  return `${when}${ifText} → ${action}`
}

export function StageRules({
  jobId, stageId, stages, rules, onChanged,
}: {
  jobId: string
  stageId: string
  stages: Stage[]
  rules: PipelineAutomation[]
  onChanged: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  // draft rule state
  const [trigger, setTrigger] = useState<AutomationTrigger>('stage_entry')
  const [conds, setConds] = useState<DraftCond[]>([blankCond()])
  const [match, setMatch] = useState<ConditionMatch>('all')
  const [action, setAction] = useState<AutomationActionType>('move_stage')
  const [target, setTarget] = useState<string>('')
  const [mode, setMode] = useState<AutomationMode>('suggest')

  const resetDraft = () => {
    setTrigger('stage_entry'); setConds([blankCond()]); setMatch('all')
    setAction('move_stage'); setTarget(''); setMode('suggest'); setAdding(false)
  }

  const setCond = (i: number, patch: Partial<DraftCond>) =>
    setConds(cs => cs.map((c, idx) => {
      if (idx !== i) return c
      const next = { ...c, ...patch }
      // when the field changes, snap the operator to a valid one for the new type
      if (patch.field && patch.field !== c.field) next.operator = firstOp(patch.field)
      return next
    }))

  const condValue = (c: DraftCond): string | number | undefined => {
    const def = ruleField(c.field)
    if (!def || def.type === 'boolean') return undefined
    if (def.type === 'number') return c.value === '' ? NaN : Number(c.value)
    return c.value
  }
  const condsValid = conds.every(c => isValidCondition(c.field, c.operator, condValue(c)))
  const actionValid = action !== 'move_stage' || !!target
  const canSave = condsValid && actionValid && !saving

  const save = async () => {
    setSaving(true)
    try {
      const conditions: RuleCondition[] = conds.map(c => {
        const v = condValue(c)
        return v === undefined ? { field: c.field, operator: c.operator } : { field: c.field, operator: c.operator, value: v }
      })
      const rule = {
        stage_id: stageId, trigger, action_type: action, mode, uses_agent: false, enabled: true,
        config: { conditions, match, target_stage_id: action === 'move_stage' ? target : null },
        guardrails: {},
      }
      const res = await fetch(`/api/jobs/${jobId}/automations`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create', rule }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Failed to save rule')
      toast.success('Rule added.')
      resetDraft()
      onChanged()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to save rule') } finally { setSaving(false) }
  }

  const remove = async (id: string) => {
    setBusyId(id)
    try {
      const res = await fetch(`/api/jobs/${jobId}/automations`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed')
      onChanged()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed to delete rule') } finally { setBusyId(null) }
  }

  return (
    <div className="mt-3 border-t border-slate-200 pt-3">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        <Zap className="h-3 w-3 text-amber-500" /> Automations
      </div>

      {rules.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {rules.map(r => (
            <li key={r.id} className="flex items-start gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] text-slate-700">
              <span className="mt-0.5 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">{modeLabel(r.mode)}</span>
              <span className="flex-1">{describeRule(r, stages)}</span>
              <button onClick={() => remove(r.id)} disabled={busyId === r.id} aria-label="Delete rule" className="mt-0.5 shrink-0 text-slate-300 hover:text-red-500 disabled:opacity-40">
                {busyId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </button>
            </li>
          ))}
        </ul>
      )}

      {!adding ? (
        <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700">
          <Plus className="h-3.5 w-3.5" /> Add rule
        </button>
      ) : (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">New rule</span>
            <button onClick={resetDraft} aria-label="Cancel" className="text-slate-400 hover:text-slate-600"><X className="h-3.5 w-3.5" /></button>
          </div>

          {/* WHEN */}
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-400">When</span>
            <Select value={trigger} onChange={e => setTrigger(e.target.value as AutomationTrigger)} className="h-8 w-full text-sm">
              {WHEN_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </Select>
          </label>

          {/* IF */}
          <div>
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-400">If {conds.length > 1 ? <>({match === 'all' ? 'all' : 'any'} match)</> : null}</span>
            <div className="space-y-1.5">
              {conds.map((c, i) => {
                const def = ruleField(c.field)
                return (
                  <div key={i} className="flex items-center gap-1.5">
                    <Select value={c.field} onChange={e => setCond(i, { field: e.target.value as RuleField })} className="h-8 flex-1 text-sm">
                      {RULE_FIELDS.map(f => <option key={f.field} value={f.field}>{f.label}</option>)}
                    </Select>
                    <Select value={c.operator} onChange={e => setCond(i, { operator: e.target.value as RuleOperator })} className="h-8 w-32 text-sm">
                      {operatorsForField(c.field).map(o => <option key={o.op} value={o.op}>{o.label}</option>)}
                    </Select>
                    {def?.type === 'number' && (
                      <Input type="number" value={c.value} onChange={e => setCond(i, { value: e.target.value })} placeholder={def.unit} className="h-8 w-20 text-sm" />
                    )}
                    {def?.type === 'choice' && (
                      <Select value={c.value} onChange={e => setCond(i, { value: e.target.value })} className="h-8 w-28 text-sm">
                        <option value="">—</option>
                        {def.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </Select>
                    )}
                    {conds.length > 1 && (
                      <button onClick={() => setConds(cs => cs.filter((_, idx) => idx !== i))} aria-label="Remove condition" className="text-slate-300 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="mt-1.5 flex items-center gap-3">
              <button onClick={() => setConds(cs => [...cs, blankCond()])} className="flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-indigo-600"><Plus className="h-3 w-3" /> condition</button>
              {conds.length > 1 && (
                <Select value={match} onChange={e => setMatch(e.target.value as ConditionMatch)} className="h-7 w-28 text-xs">
                  <option value="all">match all</option>
                  <option value="any">match any</option>
                </Select>
              )}
            </div>
          </div>

          {/* THEN */}
          <div className="flex items-end gap-1.5">
            <label className="flex-1">
              <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-400">Then</span>
              <Select value={action} onChange={e => setAction(e.target.value as AutomationActionType)} className="h-8 w-full text-sm">
                {ACTION_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </Select>
            </label>
            {action === 'move_stage' && (
              <Select value={target} onChange={e => setTarget(e.target.value)} className="h-8 w-40 text-sm">
                <option value="">choose stage…</option>
                {stages.filter(s => s.id !== stageId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            )}
          </div>

          {/* MODE */}
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-400">Run it</span>
            <Select value={mode} onChange={e => setMode(e.target.value as AutomationMode)} className="h-8 w-full text-sm">
              {MODE_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </Select>
          </label>

          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" onClick={save} disabled={!canSave} className="bg-indigo-600 hover:bg-indigo-700">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Add rule
            </Button>
            <button onClick={resetDraft} className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
          </div>
          <p className="text-[11px] text-slate-400">Rules are saved now; the engine that runs them ships next.</p>
        </div>
      )}
    </div>
  )
}
