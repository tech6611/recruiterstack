'use client'

import { useEffect, useState, useCallback } from 'react'
import { Trash2, Loader2, Plus, ChevronRight, Zap } from 'lucide-react'

type TriggerType = 'tag_added' | 'stage_moved' | 'applied' | 'status_changed'

interface Rule {
  id: string
  name: string
  enabled: boolean
  trigger_type: TriggerType
  trigger_value: string
  sequence_id: string
}

type Options = { tags: string[]; stages: string[] }

const TRIGGER_LABEL: Record<TriggerType, string> = {
  tag_added: 'When a candidate is tagged',
  stage_moved: 'When an application moves to stage',
  applied: 'When someone applies',
  status_changed: 'When application status changes to',
}
const VALUE_LABEL: Record<TriggerType, string> = { tag_added: 'Tag', stage_moved: 'Stage name', applied: '', status_changed: 'Status' }
const VALUE_PLACEHOLDER: Record<TriggerType, string> = { tag_added: 'e.g. passive-lead', stage_moved: 'e.g. Screening', applied: '', status_changed: 'e.g. rejected' }
const STATUS_OPTIONS = ['active', 'rejected', 'withdrawn', 'hired']

const inputCls = 'rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100'

// ── Shared field block ────────────────────────────────────────────────────────
// Used by BOTH the "new rule" form and the inline "edit rule" panel so the two
// stay in lock-step. Tag/stage values use a text input with a <datalist> of
// suggestions — you can pick a known one or type a new one.
function RuleFields({
  idBase, triggerType, triggerValue, name, options,
  onTriggerType, onTriggerValue, onName,
}: {
  idBase: string
  triggerType: TriggerType
  triggerValue: string
  name: string
  options: Options
  onTriggerType: (t: TriggerType) => void
  onTriggerValue: (v: string) => void
  onName: (v: string) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
        Trigger
        <select
          value={triggerType}
          onChange={e => { onTriggerType(e.target.value as TriggerType); onTriggerValue('') }}
          className={inputCls}
        >
          <option value="applied">When someone applies</option>
          <option value="stage_moved">When an application moves to stage…</option>
          <option value="status_changed">When application status changes to…</option>
          <option value="tag_added">When a candidate is tagged…</option>
        </select>
      </label>

      {triggerType === 'applied' ? (
        <div className="flex flex-col justify-end">
          <span className="mb-1 text-xs font-semibold text-slate-500">Applies to</span>
          <p className="text-[11px] text-slate-400">Every new application — no value needed.</p>
        </div>
      ) : triggerType === 'status_changed' ? (
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
          {VALUE_LABEL[triggerType]}
          <select value={triggerValue} onChange={e => onTriggerValue(e.target.value)} className={inputCls}>
            <option value="">Select a status…</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      ) : (
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
          {VALUE_LABEL[triggerType]}
          <input
            list={`${idBase}-vals`}
            value={triggerValue}
            onChange={e => onTriggerValue(e.target.value)}
            placeholder={VALUE_PLACEHOLDER[triggerType]}
            className={inputCls}
          />
          <datalist id={`${idBase}-vals`}>
            {(triggerType === 'tag_added' ? options.tags : options.stages).map(v => <option key={v} value={v} />)}
          </datalist>
        </label>
      )}

      <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500 sm:col-span-2">
        Name (optional)
        <input value={name} onChange={e => onName(e.target.value)} placeholder="e.g. Nurture passive leads" className={inputCls} />
      </label>
    </div>
  )
}

// ── One rule row (click to expand + edit) ─────────────────────────────────────
function RuleRow({
  rule, options, onSaved, onToggle, onDelete,
}: {
  rule: Rule
  options: Options
  onSaved: (updated: Rule) => void
  onToggle: (rule: Rule) => void
  onDelete: (rule: Rule) => void
}) {
  const [open, setOpen] = useState(false)
  const [triggerType, setTriggerType] = useState<TriggerType>(rule.trigger_type)
  const [triggerValue, setTriggerValue] = useState(rule.trigger_value)
  const [name, setName] = useState(rule.name ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const reset = () => {
    setTriggerType(rule.trigger_type)
    setTriggerValue(rule.trigger_value)
    setName(rule.name ?? '')
    setError('')
  }

  const dirty =
    triggerType !== rule.trigger_type ||
    triggerValue !== rule.trigger_value ||
    (name ?? '') !== (rule.name ?? '')

  const save = async () => {
    if (triggerType !== 'applied' && !triggerValue.trim()) { setError('Enter a value for the trigger.'); return }
    setSaving(true)
    setError('')
    const res = await fetch(`/api/automations/${rule.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trigger_type: triggerType,
        trigger_value: triggerType === 'applied' ? '' : triggerValue.trim(),
        name,
      }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setError(json.error ?? 'Failed to update rule'); return }
    onSaved({ ...rule, trigger_type: triggerType, trigger_value: triggerType === 'applied' ? '' : triggerValue.trim(), name })
    setOpen(false)
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={() => { if (open) reset(); setOpen(o => !o) }}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronRight className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`} />
          <div className="min-w-0">
            <p className="truncate text-sm text-slate-800">
              {TRIGGER_LABEL[rule.trigger_type]}
              {rule.trigger_type !== 'applied' && <span className="font-semibold"> &ldquo;{rule.trigger_value}&rdquo;</span>}
            </p>
            {rule.name && <p className="truncate text-xs text-slate-400">{rule.name}</p>}
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-3">
          <button
            onClick={() => onToggle(rule)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${rule.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
          >
            {rule.enabled ? 'On' : 'Off'}
          </button>
          <button onClick={() => onDelete(rule)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {open && (
        <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 px-4 py-3">
          <RuleFields
            idBase={`rule-${rule.id}`}
            triggerType={triggerType}
            triggerValue={triggerValue}
            name={name}
            options={options}
            onTriggerType={setTriggerType}
            onTriggerValue={setTriggerValue}
            onName={setName}
          />
          {error && <p className="text-xs font-medium text-red-500">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={saving || !dirty}
              className="flex items-center gap-2 rounded-xl bg-[#221b14] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#33271b] disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Save changes
            </button>
            <button
              onClick={() => { reset(); setOpen(false) }}
              className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Auto-enrollment rules for ONE sequence. Candidates are dropped into this
 * sequence automatically when a matching event fires (a tag is added, an
 * application moves to a named stage, etc.). Existing rules can be expanded and
 * edited in place.
 */
export default function SequenceAutomations({ sequenceId, active, sequenceKind = 'drip' }: { sequenceId: string; active: boolean; sequenceKind?: 'drip' | 'event' }) {
  const [rules, setRules] = useState<Rule[]>([])
  const [options, setOptions] = useState<Options>({ tags: [], stages: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // New-rule form
  const [triggerType, setTriggerType] = useState<TriggerType>('tag_added')
  const [triggerValue, setTriggerValue] = useState('')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const [rRes, oRes] = await Promise.all([
      fetch(`/api/automations?sequence_id=${sequenceId}`),
      fetch('/api/automations/options'),
    ])
    const rJson = await rRes.json()
    if (!rRes.ok) { setError(rJson.error ?? 'Failed to load rules'); setLoading(false); return }
    setRules(rJson.data ?? [])
    if (oRes.ok) { const oJson = await oRes.json(); setOptions(oJson.data ?? { tags: [], stages: [] }) }
    setLoading(false)
  }, [sequenceId])

  useEffect(() => { load() }, [load])

  const create = async () => {
    if (triggerType !== 'applied' && !triggerValue.trim()) { setError('Enter a value for the trigger.'); return }
    setSaving(true)
    setError('')
    const res = await fetch('/api/automations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, trigger_type: triggerType, trigger_value: triggerValue.trim(), sequence_id: sequenceId }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setError(json.error ?? 'Failed to create rule'); return }
    setTriggerValue(''); setName('')
    load()
  }

  const toggle = async (rule: Rule) => {
    await fetch(`/api/automations/${rule.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !rule.enabled }),
    })
    setRules(rs => rs.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r))
  }

  const remove = async (rule: Rule) => {
    await fetch(`/api/automations/${rule.id}`, { method: 'DELETE' })
    setRules(rs => rs.filter(r => r.id !== rule.id))
  }

  const applySaved = (updated: Rule) => setRules(rs => rs.map(r => r.id === updated.id ? { ...r, ...updated } : r))

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-500">
        Auto-enroll candidates into this sequence when an event happens — no manual adding.
      </p>

      {sequenceKind === 'event' && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
          <p className="text-[11px] text-emerald-700">
            This is an event notification — every email fires the moment it&apos;s due, even
            outside working hours. Pair it with a trigger like
            <span className="font-semibold"> &ldquo;When stage changes&rdquo; </span>
            so candidates get notified the instant something happens.
          </p>
        </div>
      )}

      {!active && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs font-medium text-amber-700">This sequence is a draft.</p>
          <p className="text-[11px] text-amber-600">Rules won&apos;t enroll anyone until the sequence is activated.</p>
        </div>
      )}

      {/* New rule */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">New rule</p>
        <RuleFields
          idBase="new"
          triggerType={triggerType}
          triggerValue={triggerValue}
          name={name}
          options={options}
          onTriggerType={setTriggerType}
          onTriggerValue={setTriggerValue}
          onName={setName}
        />
        <button
          onClick={create}
          disabled={saving}
          className="mt-4 flex items-center gap-2 rounded-xl bg-[#221b14] px-4 py-2 text-sm font-semibold text-white hover:bg-[#33271b] disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add rule
        </button>
      </div>

      {error && <p className="text-sm font-medium text-red-500">{error}</p>}

      {/* Rules list */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : rules.length === 0 ? (
        <p className="text-sm text-slate-400">No rules yet. Add one above to auto-enroll candidates into this sequence.</p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Active rules — click one to edit</p>
          {rules.map(rule => (
            <RuleRow key={rule.id} rule={rule} options={options} onSaved={applySaved} onToggle={toggle} onDelete={remove} />
          ))}
        </div>
      )}
    </div>
  )
}
