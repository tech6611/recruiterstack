'use client'

import { useEffect, useState } from 'react'
import { Building2, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Department {
  id:        string
  name:      string
  slug:      string | null
  parent_id: string | null
  is_active: boolean
}

export function DepartmentsCard() {
  const [items, setItems]     = useState<Department[]>([])
  const [loaded, setLoaded]   = useState(false)
  const [open, setOpen]       = useState<{ mode: 'add' } | { mode: 'edit'; row: Department } | null>(null)

  async function refresh() {
    const res = await fetch('/api/departments?include_inactive=1')
    const body = await res.json()
    setItems(body.data ?? [])
    setLoaded(true)
  }
  useEffect(() => { refresh() }, [])

  async function archive(id: string) {
    if (!confirm('Archive this department?')) return
    const res = await fetch(`/api/departments/${id}`, { method: 'DELETE' })
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
          <Building2 className="h-4 w-4 text-emerald-600" /> Departments
        </CardTitle>
        <CardDescription>Used by openings and jobs. Archived departments hide from dropdowns.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex justify-end mb-3">
          <Button size="sm" onClick={() => setOpen({ mode: 'add' })}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
        {!loaded ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-slate-500">No departments yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map(d => (
              <div key={d.id} className={`flex items-center justify-between py-2.5 ${!d.is_active && 'opacity-50'}`}>
                <div className="min-w-0 flex-1">
                  <button onClick={() => setOpen({ mode: 'edit', row: d })} className="text-sm font-medium text-slate-900 hover:text-emerald-700 text-left">
                    {d.name}
                  </button>
                  {d.slug && <span className="ml-2 text-xs text-slate-400">/{d.slug}</span>}
                  {!d.is_active && <span className="ml-2 text-[10px] uppercase font-semibold text-slate-400">archived</span>}
                </div>
                {d.is_active && (
                  <Button variant="ghost" size="sm" onClick={() => archive(d.id)} aria-label="Archive">
                    <Trash2 className="h-4 w-4 text-slate-400" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
        {open && <DeptDialog mode={open.mode} row={open.mode === 'edit' ? open.row : undefined} onClose={() => { setOpen(null); refresh() }} />}
      </CardContent>
    </Card>
  )
}

function DeptDialog({ mode, row, onClose }: { mode: 'add' | 'edit'; row?: Department; onClose: () => void }) {
  const [name, setName]   = useState(row?.name ?? '')
  const [slug, setSlug]   = useState(row?.slug ?? '')
  const [active, setActive] = useState(row?.is_active ?? true)
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    if (!name.trim()) { toast.error('Name is required'); return }
    setSubmitting(true)
    const url    = mode === 'add' ? '/api/departments' : `/api/departments/${row?.id}`
    const method = mode === 'add' ? 'POST' : 'PATCH'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), slug: slug.trim() || null, is_active: active }),
    })
    setSubmitting(false)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(body.error ?? 'Save failed'); return }
    toast.success(mode === 'add' ? 'Department added' : 'Saved')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-900">{mode === 'add' ? 'New department' : 'Edit department'}</h3>
          <button type="button" onClick={onClose} aria-label="Close"><X className="h-4 w-4 text-slate-500" /></button>
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="dept-name">Name</Label>
            <Input id="dept-name" value={name} onChange={e => setName(e.target.value)} placeholder="Engineering" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dept-slug">Slug (optional)</Label>
            <Input id="dept-slug" value={slug} onChange={e => setSlug(e.target.value)} placeholder="engineering" />
          </div>
          {mode === 'edit' && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
              Active
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
