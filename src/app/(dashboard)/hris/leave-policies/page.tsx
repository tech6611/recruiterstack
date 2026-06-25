'use client'

import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, Plus, Trash2 } from 'lucide-react'
import { flags } from '@/lib/flags'
import { inputCls, labelCls } from '@/lib/ui/styles'
import type { Holiday, LeavePolicy, TimeOffRequestType } from '@/lib/types/database'

const TYPE_LABEL: Record<TimeOffRequestType, string> = {
  vacation: 'Vacation',
  sick:     'Sick',
  personal: 'Personal',
  unpaid:   'Unpaid',
}

export default function LeavePoliciesPage() {
  const { orgId } = useAuth()
  const [policies, setPolicies] = useState<LeavePolicy[]>([])
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [loading, setLoading] = useState(true)
  const [editingDays, setEditingDays] = useState<Record<string, number>>({})

  // Holiday-add form state.
  const [hDate, setHDate] = useState('')
  const [hName, setHName] = useState('')
  const [hCountry, setHCountry] = useState('')
  const [addingHoliday, setAddingHoliday] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [pRes, hRes] = await Promise.all([
      fetch('/api/hris/leave-policies'),
      fetch('/api/hris/holidays'),
    ])
    if (pRes.ok) {
      const j = await pRes.json()
      const list = (j.data ?? []) as LeavePolicy[]
      setPolicies(list)
      const init: Record<string, number> = {}
      for (const p of list) init[p.id] = p.annual_days
      setEditingDays(init)
    }
    if (hRes.ok) {
      const j = await hRes.json()
      setHolidays((j.data ?? []) as Holiday[])
    }
    setLoading(false)
  }, [])

  useEffect(() => { if (orgId) fetchAll() }, [fetchAll, orgId])

  async function savePolicy(p: LeavePolicy) {
    const newDays = editingDays[p.id]
    if (newDays === p.annual_days) return
    const r = await fetch(`/api/hris/leave-policies/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ annual_days: newDays }),
    })
    if (r.ok) await fetchAll()
  }

  async function addHoliday() {
    if (!hDate || !hName.trim()) return
    setAddingHoliday(true)
    const r = await fetch('/api/hris/holidays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: hDate,
        name: hName.trim(),
        country: hCountry.trim() ? hCountry.trim().toUpperCase().slice(0, 2) : null,
      }),
    })
    if (r.ok) {
      setHDate(''); setHName(''); setHCountry('')
      await fetchAll()
    }
    setAddingHoliday(false)
  }

  async function removeHoliday(id: string) {
    if (!confirm('Delete this holiday?')) return
    const r = await fetch(`/api/hris/holidays/${id}`, { method: 'DELETE' })
    if (r.ok) await fetchAll()
  }

  if (!flags.hris) return <div className="p-8 text-sm text-slate-500">The HRIS module is not enabled.</div>

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50">
          <CalendarDays className="h-4 w-4 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Leave policies & holidays</h1>
          <p className="text-sm text-slate-500">
            Annual day grants per leave type (used to compute every employee&rsquo;s balance) and the org holiday calendar.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Policies */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Annual grants</h2>
          {loading ? (
            <p className="py-2 text-sm text-slate-400">Loading…</p>
          ) : policies.length === 0 ? (
            <p className="py-2 text-sm text-slate-400">No policies yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {policies.map(p => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                  <span className="font-medium text-slate-800">{TYPE_LABEL[p.leave_type]}</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={365}
                      className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right text-sm"
                      value={editingDays[p.id] ?? 0}
                      onChange={e => setEditingDays(s => ({ ...s, [p.id]: Math.max(0, Number(e.target.value) || 0) }))}
                    />
                    <span className="text-xs text-slate-500">days / year</span>
                    {editingDays[p.id] !== p.annual_days && (
                      <button
                        onClick={() => savePolicy(p)}
                        className="rounded-lg bg-[#221b14] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#33271b]"
                      >
                        Save
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Holidays */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Holiday calendar</h2>

          {/* Add row */}
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div>
              <label className={labelCls}>Date</label>
              <input type="date" className={inputCls} value={hDate} onChange={e => setHDate(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Name</label>
              <input className={inputCls} value={hName} onChange={e => setHName(e.target.value)} placeholder="Independence Day" />
            </div>
            <div>
              <label className={labelCls}>Country (opt.)</label>
              <input className={inputCls} value={hCountry} onChange={e => setHCountry(e.target.value)} placeholder="US" maxLength={2} />
            </div>
          </div>
          <div className="mb-4 flex justify-end">
            <button
              onClick={addHoliday}
              disabled={!hDate || !hName.trim() || addingHoliday}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#221b14] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#33271b] disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              {addingHoliday ? 'Adding…' : 'Add holiday'}
            </button>
          </div>

          {/* List */}
          {holidays.length === 0 ? (
            <p className="py-2 text-sm text-slate-400">No holidays on the calendar yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {holidays.map(h => (
                <li key={h.id} className="flex items-center justify-between py-2 text-sm">
                  <span>
                    <span className="font-medium text-slate-800">{h.date}</span>
                    <span className="ml-2 text-slate-600">{h.name}</span>
                    {h.country && <span className="ml-2 text-xs text-slate-400">({h.country})</span>}
                  </span>
                  <button
                    onClick={() => removeHoliday(h.id)}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
