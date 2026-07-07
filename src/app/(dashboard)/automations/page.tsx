'use client'

import { useEffect, useState, useCallback } from 'react'
import { Zap, Trash2, Loader2, Plus } from 'lucide-react'

type TriggerType = 'tag_added' | 'stage_moved'

interface Rule {
  id: string
  name: string
  enabled: boolean
  trigger_type: TriggerType
  trigger_value: string
  sequence_id: string
  sequences?: { name: string; status: string } | null
}

interface SequenceOption { id: string; name: string; status: string }

const TRIGGER_LABEL: Record<TriggerType, string> = {
  tag_added: 'When a candidate is tagged',
  stage_moved: 'When an application moves to stage',
}
const VALUE_LABEL: Record<TriggerType, string> = { tag_added: 'Tag', stage_moved: 'Stage name' }
const VALUE_PLACEHOLDER: Record<TriggerType, string> = { tag_added: 'e.g. passive-lead', stage_moved: 'e.g. Screening' }

export default function AutomationsPage() {
  const [rules, setRules] = useState<Rule[]>([])
  const [sequences, setSequences] = useState<SequenceOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // New-rule form
  const [triggerType, setTriggerType] = useState<TriggerType>('tag_added')
  const [triggerValue, setTriggerValue] = useState('')
  const [sequenceId, setSequenceId] = useState('')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [rRes, sRes] = await Promise.all([fetch('/api/automations'), fetch('/api/sequences')])
      const rJson = await rRes.json()
      const sJson = await sRes.json()
      if (!rRes.ok) throw new Error(rJson.error ?? 'Failed to load rules')
      setRules(rJson.data ?? [])
      setSequences((sJson.data ?? []).filter((s: SequenceOption) => s.status === 'active'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const createRule = async () => {
    if (!triggerValue.trim() || !sequenceId) {
      setError('Pick a trigger value and a sequence.')
      return
    }
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
    setTriggerValue(''); setName(''); setSequenceId('')
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

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-1 flex items-center gap-2">
        <Zap className="h-5 w-5 text-emerald-500" />
        <h1 className="text-xl font-bold text-slate-900">Automations</h1>
      </div>
      <p className="mb-6 text-sm text-slate-500">
        Auto-enroll candidates into a sequence when an event happens — no manual adding.
      </p>

      {/* New rule */}
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">New rule</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
            Trigger
            <select
              value={triggerType}
              onChange={e => setTriggerType(e.target.value as TriggerType)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="tag_added">When a candidate is tagged…</option>
              <option value="stage_moved">When an application moves to stage…</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
            {VALUE_LABEL[triggerType]}
            <input
              value={triggerValue}
              onChange={e => setTriggerValue(e.target.value)}
              placeholder={VALUE_PLACEHOLDER[triggerType]}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
            Enroll into sequence
            <select
              value={sequenceId}
              onChange={e => setSequenceId(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="">Select an active sequence…</option>
              {sequences.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
            Name (optional)
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Nurture passive leads"
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            />
          </label>
        </div>
        {sequences.length === 0 && (
          <p className="mt-2 text-[11px] text-amber-600">You have no active sequences yet — activate one first to target it.</p>
        )}
        <button
          onClick={createRule}
          disabled={saving}
          className="mt-4 flex items-center gap-2 rounded-xl bg-[#221b14] px-4 py-2 text-sm font-semibold text-white hover:bg-[#33271b] disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Create rule
        </button>
      </div>

      {error && <p className="mb-4 text-sm font-medium text-red-500">{error}</p>}

      {/* Rules list */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : rules.length === 0 ? (
        <p className="text-sm text-slate-400">No rules yet. Create one above to start auto-enrolling candidates.</p>
      ) : (
        <div className="space-y-2">
          {rules.map(rule => (
            <div key={rule.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm text-slate-800">
                  {TRIGGER_LABEL[rule.trigger_type]} <span className="font-semibold">“{rule.trigger_value}”</span>
                  {' → enroll in '}
                  <span className="font-semibold">{rule.sequences?.name ?? 'sequence'}</span>
                </p>
                {rule.name && <p className="truncate text-xs text-slate-400">{rule.name}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <button
                  onClick={() => toggle(rule)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${rule.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
                >
                  {rule.enabled ? 'On' : 'Off'}
                </button>
                <button onClick={() => remove(rule)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
