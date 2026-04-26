'use client'

import { useEffect, useState } from 'react'
import { DollarSign, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'

interface Band {
  id:            string
  name:          string
  level:         string
  department_id: string | null
  location_id:   string | null
  min_salary:    number
  max_salary:    number
  currency:      string
  is_active:     boolean
}

interface Lookup { id: string; name: string }

export function CompBandsCard() {
  const [items, setItems]     = useState<Band[]>([])
  const [depts, setDepts]     = useState<Lookup[]>([])
  const [locs,  setLocs]      = useState<Lookup[]>([])
  const [loaded, setLoaded]   = useState(false)
  const [open,   setOpen]     = useState<{ mode: 'add' } | { mode: 'edit'; row: Band } | null>(null)

  async function refresh() {
    const [b, d, l] = await Promise.all([
      fetch('/api/compensation-bands?include_inactive=1').then(r => r.json()),
      fetch('/api/departments').then(r => r.json()),
      fetch('/api/locations').then(r => r.json()),
    ])
    setItems(b.data ?? [])
    setDepts(d.data ?? [])
    setLocs(l.data ?? [])
    setLoaded(true)
  }
  useEffect(() => { refresh() }, [])

  async function archive(id: string) {
    if (!confirm('Archive this comp band?')) return
    const res = await fetch(`/api/compensation-bands/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Archive failed')
      return
    }
    toast.success('Archived')
    refresh()
  }

  const deptName = (id: string | null) => depts.find(d => d.id === id)?.name ?? '—'
  const locName  = (id: string | null) => locs.find(l => l.id === id)?.name ?? '—'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-amber-600" /> Compensation bands
        </CardTitle>
        <CardDescription>Salary ranges keyed by level + department + location. Auto-fills the opening form.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex justify-end mb-3">
          <Button size="sm" onClick={() => setOpen({ mode: 'add' })}><Plus className="h-4 w-4" /> Add</Button>
        </div>
        {!loaded ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-slate-500">No bands yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map(b => (
              <div key={b.id} className={`flex items-center justify-between gap-3 py-2.5 ${!b.is_active && 'opacity-50'}`}>
                <div className="min-w-0 flex-1">
                  <button onClick={() => setOpen({ mode: 'edit', row: b })} className="text-sm font-medium text-slate-900 hover:text-emerald-700 text-left">
                    {b.name}
                  </button>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {b.level} · {deptName(b.department_id)} · {locName(b.location_id)} · {b.currency} {Number(b.min_salary).toLocaleString()}–{Number(b.max_salary).toLocaleString()}
                  </div>
                  {!b.is_active && <span className="text-[10px] uppercase font-semibold text-slate-400">archived</span>}
                </div>
                {b.is_active && (
                  <Button variant="ghost" size="sm" onClick={() => archive(b.id)}><Trash2 className="h-4 w-4 text-slate-400" /></Button>
                )}
              </div>
            ))}
          </div>
        )}
        {open && <BandDialog mode={open.mode} row={open.mode === 'edit' ? open.row : undefined} depts={depts} locs={locs} onClose={() => { setOpen(null); refresh() }} />}
      </CardContent>
    </Card>
  )
}

function BandDialog({ mode, row, depts, locs, onClose }: { mode: 'add' | 'edit'; row?: Band; depts: Lookup[]; locs: Lookup[]; onClose: () => void }) {
  const [form, setForm] = useState({
    name:          row?.name ?? '',
    level:         row?.level ?? '',
    department_id: row?.department_id ?? '',
    location_id:   row?.location_id ?? '',
    min_salary:    row?.min_salary !== undefined ? String(row.min_salary) : '',
    max_salary:    row?.max_salary !== undefined ? String(row.max_salary) : '',
    currency:      row?.currency ?? 'USD',
    is_active:     row?.is_active ?? true,
  })
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    if (!form.name.trim() || !form.level.trim()) { toast.error('Name and level are required'); return }
    const min = Number(form.min_salary), max = Number(form.max_salary)
    if (!Number.isFinite(min) || !Number.isFinite(max)) { toast.error('Min and max must be numbers'); return }
    if (min > max) { toast.error('Min must be ≤ max'); return }

    setSubmitting(true)
    const url    = mode === 'add' ? '/api/compensation-bands' : `/api/compensation-bands/${row?.id}`
    const method = mode === 'add' ? 'POST' : 'PATCH'
    const payload = {
      name:          form.name.trim(),
      level:         form.level.trim(),
      department_id: form.department_id || null,
      location_id:   form.location_id   || null,
      min_salary:    min,
      max_salary:    max,
      currency:      form.currency.toUpperCase().slice(0, 3),
      is_active:     form.is_active,
    }
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setSubmitting(false)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(body.error ?? 'Save failed'); return }
    toast.success(mode === 'add' ? 'Band added' : 'Saved')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-900">{mode === 'add' ? 'New comp band' : 'Edit comp band'}</h3>
          <button type="button" onClick={onClose}><X className="h-4 w-4 text-slate-500" /></button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Name</Label><Input placeholder="IC4 Engineer — SF" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus /></div>
            <div className="space-y-1.5"><Label>Level</Label><Input placeholder="IC4 / L5 / Senior" value={form.level} onChange={e => setForm({ ...form, level: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select value={form.department_id} onChange={e => setForm({ ...form, department_id: e.target.value })}>
                <option value="">—</option>
                {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Select value={form.location_id} onChange={e => setForm({ ...form, location_id: e.target.value })}>
                <option value="">—</option>
                {locs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label>Min</Label><Input type="number" value={form.min_salary} onChange={e => setForm({ ...form, min_salary: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Max</Label><Input type="number" value={form.max_salary} onChange={e => setForm({ ...form, max_salary: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Currency</Label><Input maxLength={3} value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} /></div>
          </div>
          {mode === 'edit' && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} /> Active
            </label>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={submitting}>{mode === 'add' ? 'Create' : 'Save'}</Button>
        </div>
      </div>
    </div>
  )
}
