'use client'

import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Plus, Target, Trash2 } from 'lucide-react'
import { flags } from '@/lib/flags'
import { inputCls, labelCls } from '@/lib/ui/styles'
import type { Okr, OkrKeyResult, OkrStatus } from '@/lib/types/database'

type OkrWithProgress = Okr & { computed_progress: number; key_result_count: number }

const STATUS_BADGE: Record<OkrStatus, string> = {
  draft:     'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
  active:    'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  achieved:  'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  missed:    'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
  abandoned: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
}

function defaultCycle(): string {
  const d = new Date()
  const q = Math.floor(d.getUTCMonth() / 3) + 1
  return `${d.getUTCFullYear()}-Q${q}`
}

export default function MyOkrsPage() {
  const { orgId } = useAuth()
  const [okrs, setOkrs] = useState<OkrWithProgress[]>([])
  const [kRsByOkr, setKrsByOkr] = useState<Map<string, OkrKeyResult[]>>(new Map())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  // Create-objective form.
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newCycle, setNewCycle] = useState(defaultCycle())

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/me/okrs')
    if (r.ok) setOkrs(((await r.json()).data ?? []) as OkrWithProgress[])
    setLoading(false)
  }, [])

  useEffect(() => { if (orgId) fetchAll() }, [fetchAll, orgId])

  async function loadKrs(okrId: string) {
    if (kRsByOkr.has(okrId)) return
    const r = await fetch(`/api/okrs/${okrId}`)
    if (r.ok) {
      const j = await r.json()
      const next = new Map(kRsByOkr)
      next.set(okrId, (j.data?.key_results ?? []) as OkrKeyResult[])
      setKrsByOkr(next)
    }
  }

  async function toggle(okrId: string) {
    const next = new Set(expanded)
    if (next.has(okrId)) next.delete(okrId)
    else { next.add(okrId); await loadKrs(okrId) }
    setExpanded(next)
  }

  async function createObjective() {
    if (!newTitle.trim()) return
    setCreating(true)
    const r = await fetch('/api/me/okrs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle.trim(), description: newDesc.trim() || null, cycle: newCycle.trim() }),
    })
    if (r.ok) {
      setNewTitle(''); setNewDesc('')
      await fetchAll()
    }
    setCreating(false)
  }

  async function addKr(okrId: string, title: string) {
    if (!title.trim()) return
    const r = await fetch(`/api/okrs/${okrId}/key-results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim() }),
    })
    if (r.ok) {
      // refresh KRs + the parent OKR progress
      const next = new Map(kRsByOkr); next.delete(okrId); setKrsByOkr(next)
      await loadKrs(okrId)
      await fetchAll()
    }
  }

  async function setKrProgress(okrId: string, krId: string, progress: number) {
    const r = await fetch(`/api/okrs/key-results/${krId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ progress }),
    })
    if (r.ok) {
      const next = new Map(kRsByOkr); next.delete(okrId); setKrsByOkr(next)
      await loadKrs(okrId)
      await fetchAll()
    }
  }

  async function deleteKr(okrId: string, krId: string) {
    if (!confirm('Delete this key result?')) return
    const r = await fetch(`/api/okrs/key-results/${krId}`, { method: 'DELETE' })
    if (r.ok) {
      const next = new Map(kRsByOkr); next.delete(okrId); setKrsByOkr(next)
      await loadKrs(okrId)
      await fetchAll()
    }
  }

  async function setStatus(okrId: string, status: OkrStatus) {
    const r = await fetch(`/api/okrs/${okrId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (r.ok) await fetchAll()
  }

  async function deleteOkrUI(okrId: string) {
    if (!confirm('Delete this objective and all its key results?')) return
    const r = await fetch(`/api/okrs/${okrId}`, { method: 'DELETE' })
    if (r.ok) {
      const next = new Map(kRsByOkr); next.delete(okrId); setKrsByOkr(next)
      const exp = new Set(expanded); exp.delete(okrId); setExpanded(exp)
      await fetchAll()
    }
  }

  if (!flags.hris) return <div className="p-8 text-sm text-slate-500">The HRIS module is not enabled.</div>

  // Group by cycle, most-recent first.
  const byCycle = new Map<string, OkrWithProgress[]>()
  for (const o of okrs) {
    const arr = byCycle.get(o.cycle) ?? []
    arr.push(o); byCycle.set(o.cycle, arr)
  }
  const cycles = Array.from(byCycle.keys()).sort().reverse()

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50">
          <Target className="h-4 w-4 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Your OKRs</h1>
          <p className="text-sm text-slate-500">Objectives and key results. Progress is the average of your KRs.</p>
        </div>
      </div>

      {/* Create objective */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Add an objective</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <label className={labelCls}>Title</label>
            <input className={inputCls} value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Ship v2 of the dashboard" />
          </div>
          <div>
            <label className={labelCls}>Cycle</label>
            <input className={inputCls} value={newCycle} onChange={e => setNewCycle(e.target.value)} placeholder="2026-Q3" />
          </div>
          <div className="sm:col-span-1 flex items-end">
            <button onClick={createObjective} disabled={!newTitle.trim() || creating} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              <Plus className="h-4 w-4" />
              {creating ? 'Adding…' : 'Add objective'}
            </button>
          </div>
          <div className="sm:col-span-4">
            <label className={labelCls}>Description (optional)</label>
            <input className={inputCls} value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Why this matters." />
          </div>
        </div>
      </div>

      {/* OKRs grouped by cycle */}
      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : okrs.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
          No objectives yet — add your first one above.
        </div>
      ) : (
        cycles.map(cycle => (
          <div key={cycle} className="mb-6">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{cycle}</p>
            <div className="space-y-3">
              {(byCycle.get(cycle) ?? []).map(o => {
                const isOpen = expanded.has(o.id)
                const krs = kRsByOkr.get(o.id) ?? []
                return (
                  <div key={o.id} className="rounded-xl border border-slate-200 bg-white p-5">
                    <button onClick={() => toggle(o.id)} className="flex w-full items-start gap-3 text-left">
                      {isOpen ? <ChevronDown className="mt-1 h-4 w-4 text-slate-400" /> : <ChevronRight className="mt-1 h-4 w-4 text-slate-400" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-semibold text-slate-900">{o.title}</p>
                          <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[o.status]}`}>{o.status}</span>
                        </div>
                        {o.description && <p className="mt-1 text-sm text-slate-500">{o.description}</p>}
                        <div className="mt-2 flex items-center gap-3">
                          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full bg-emerald-500" style={{ width: `${o.computed_progress}%` }} />
                          </div>
                          <span className="text-xs text-slate-500">{o.computed_progress}% · {o.key_result_count} KR{o.key_result_count === 1 ? '' : 's'}</span>
                        </div>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="mt-4 border-t border-slate-100 pt-4">
                        {krs.length === 0 ? (
                          <p className="mb-3 text-sm text-slate-400">No key results yet.</p>
                        ) : (
                          <ul className="mb-3 space-y-3">
                            {krs.map(k => (
                              <li key={k.id} className="flex items-center gap-3">
                                <span className="min-w-0 flex-1">
                                  <span className="text-sm font-medium text-slate-800">{k.title}</span>
                                  {k.target_metric && <span className="ml-2 text-xs text-slate-400">({k.target_metric})</span>}
                                </span>
                                <input
                                  type="range" min={0} max={100} step={5}
                                  value={k.progress}
                                  onChange={e => setKrProgress(o.id, k.id, Number(e.target.value))}
                                  className="w-32"
                                />
                                <span className="w-12 text-right text-xs font-semibold text-slate-600">{k.progress}%</span>
                                <button onClick={() => deleteKr(o.id, k.id)} className="text-slate-400 hover:text-rose-600">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                        <AddKrInline onAdd={title => addKr(o.id, title)} />

                        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                          <select value={o.status} onChange={e => setStatus(o.id, e.target.value as OkrStatus)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs">
                            <option value="draft">Draft</option>
                            <option value="active">Active</option>
                            <option value="achieved">Achieved</option>
                            <option value="missed">Missed</option>
                            <option value="abandoned">Abandoned</option>
                          </select>
                          <button onClick={() => deleteOkrUI(o.id)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-rose-600 hover:bg-rose-50">
                            Delete objective
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

function AddKrInline({ onAdd }: { onAdd: (title: string) => Promise<void> }) {
  const [v, setV] = useState('')
  return (
    <div className="flex gap-2">
      <input
        className={inputCls}
        value={v}
        onChange={e => setV(e.target.value)}
        placeholder="Add a key result…"
      />
      <button
        onClick={() => { void onAdd(v); setV('') }}
        disabled={!v.trim()}
        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        Add KR
      </button>
    </div>
  )
}
