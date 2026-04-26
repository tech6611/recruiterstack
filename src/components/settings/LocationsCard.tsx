'use client'

import { useEffect, useState } from 'react'
import { MapPin, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'

type RemoteType = 'onsite' | 'remote' | 'hybrid'

interface Location {
  id:          string
  name:        string
  city:        string | null
  state:       string | null
  country:     string | null
  postal_code: string | null
  remote_type: RemoteType
  timezone:    string | null
  is_active:   boolean
}

export function LocationsCard() {
  const [items, setItems]   = useState<Location[]>([])
  const [loaded, setLoaded] = useState(false)
  const [open, setOpen]     = useState<{ mode: 'add' } | { mode: 'edit'; row: Location } | null>(null)

  async function refresh() {
    const res = await fetch('/api/locations?include_inactive=1')
    const body = await res.json()
    setItems(body.data ?? [])
    setLoaded(true)
  }
  useEffect(() => { refresh() }, [])

  async function archive(id: string) {
    if (!confirm('Archive this location?')) return
    const res = await fetch(`/api/locations/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Archive failed')
      return
    }
    toast.success('Archived')
    refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-blue-600" /> Locations
        </CardTitle>
        <CardDescription>Where your team operates. Used by openings and posting feeds.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex justify-end mb-3">
          <Button size="sm" onClick={() => setOpen({ mode: 'add' })}><Plus className="h-4 w-4" /> Add</Button>
        </div>
        {!loaded ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-slate-500">No locations yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map(l => {
              const detail = [l.city, l.state, l.country].filter(Boolean).join(', ')
              return (
                <div key={l.id} className={`flex items-center justify-between py-2.5 ${!l.is_active && 'opacity-50'}`}>
                  <div className="min-w-0 flex-1">
                    <button onClick={() => setOpen({ mode: 'edit', row: l })} className="text-sm font-medium text-slate-900 hover:text-emerald-700 text-left">
                      {l.name}
                    </button>
                    <span className="ml-2 text-xs text-slate-500">{l.remote_type}{detail ? ` · ${detail}` : ''}</span>
                    {!l.is_active && <span className="ml-2 text-[10px] uppercase font-semibold text-slate-400">archived</span>}
                  </div>
                  {l.is_active && (
                    <Button variant="ghost" size="sm" onClick={() => archive(l.id)}><Trash2 className="h-4 w-4 text-slate-400" /></Button>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {open && <LocationDialog mode={open.mode} row={open.mode === 'edit' ? open.row : undefined} onClose={() => { setOpen(null); refresh() }} />}
      </CardContent>
    </Card>
  )
}

function LocationDialog({ mode, row, onClose }: { mode: 'add' | 'edit'; row?: Location; onClose: () => void }) {
  const [form, setForm] = useState({
    name:        row?.name ?? '',
    city:        row?.city ?? '',
    state:       row?.state ?? '',
    country:     row?.country ?? '',
    postal_code: row?.postal_code ?? '',
    remote_type: (row?.remote_type ?? 'onsite') as RemoteType,
    timezone:    row?.timezone ?? '',
    is_active:   row?.is_active ?? true,
  })
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    if (!form.name.trim()) { toast.error('Name is required'); return }
    setSubmitting(true)
    const url    = mode === 'add' ? '/api/locations' : `/api/locations/${row?.id}`
    const method = mode === 'add' ? 'POST' : 'PATCH'
    const payload = {
      name:        form.name.trim(),
      city:        form.city.trim() || null,
      state:       form.state.trim() || null,
      country:     form.country.trim().toUpperCase().slice(0, 2) || null,
      postal_code: form.postal_code.trim() || null,
      remote_type: form.remote_type,
      timezone:    form.timezone.trim() || null,
      is_active:   form.is_active,
    }
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setSubmitting(false)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(body.error ?? 'Save failed'); return }
    toast.success(mode === 'add' ? 'Location added' : 'Saved')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-900">{mode === 'add' ? 'New location' : 'Edit location'}</h3>
          <button type="button" onClick={onClose}><X className="h-4 w-4 text-slate-500" /></button>
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input placeholder="San Francisco HQ" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>City</Label><Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>State / region</Label><Input value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label>Country</Label><Input maxLength={2} placeholder="US" value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Postal</Label><Input value={form.postal_code} onChange={e => setForm({ ...form, postal_code: e.target.value })} /></div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.remote_type} onChange={e => setForm({ ...form, remote_type: e.target.value as RemoteType })}>
                <option value="onsite">Onsite</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5"><Label>Timezone (IANA)</Label><Input placeholder="America/Los_Angeles" value={form.timezone} onChange={e => setForm({ ...form, timezone: e.target.value })} /></div>
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
