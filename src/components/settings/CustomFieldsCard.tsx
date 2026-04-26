'use client'

import { useEffect, useState } from 'react'
import { ListPlus, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { CustomFieldDefinition, CustomFieldObjectType, CustomFieldType } from '@/lib/types/requisitions'

const OBJECT_TYPES: CustomFieldObjectType[] = ['opening', 'job', 'posting']
const FIELD_TYPES: CustomFieldType[] = ['text', 'number', 'select', 'multi_select', 'date', 'boolean', 'user']

export function CustomFieldsCard() {
  const [items, setItems]   = useState<CustomFieldDefinition[]>([])
  const [loaded, setLoaded] = useState(false)
  const [object,  setObject] = useState<CustomFieldObjectType>('opening')
  const [open,    setOpen]   = useState<{ mode: 'add' } | { mode: 'edit'; row: CustomFieldDefinition } | null>(null)

  async function refresh() {
    const res = await fetch(`/api/admin/custom-fields?include_inactive=1&object_type=${object}`)
    const body = await res.json()
    setItems(body.data ?? [])
    setLoaded(true)
  }
  useEffect(() => { refresh() }, [object])  // eslint-disable-line react-hooks/exhaustive-deps

  async function archive(id: string) {
    if (!confirm('Archive this custom field?')) return
    const res = await fetch(`/api/admin/custom-fields/${id}`, { method: 'DELETE' })
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
          <ListPlus className="h-4 w-4 text-fuchsia-600" /> Custom fields
        </CardTitle>
        <CardDescription>Extra fields beyond the built-ins. Render dynamically on the opening form.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mb-3 gap-3">
          <Select value={object} onChange={e => setObject(e.target.value as CustomFieldObjectType)} className="w-44">
            {OBJECT_TYPES.map(o => <option key={o} value={o} className="capitalize">{o}</option>)}
          </Select>
          <Button size="sm" onClick={() => setOpen({ mode: 'add' })}><Plus className="h-4 w-4" /> Add</Button>
        </div>

        {!loaded ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-slate-500">No custom fields for {object} yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map(d => (
              <div key={d.id} className={cn('flex items-center justify-between py-2.5', !d.is_active && 'opacity-50')}>
                <div className="min-w-0 flex-1">
                  <button onClick={() => setOpen({ mode: 'edit', row: d })} className="text-sm font-medium text-slate-900 hover:text-emerald-700 text-left">
                    {d.label}
                    {d.required && <span className="ml-1 text-red-600">*</span>}
                  </button>
                  <span className="ml-2 text-xs text-slate-500">{d.field_type} · {d.field_key}</span>
                  {!d.is_active && <span className="ml-2 text-[10px] uppercase font-semibold text-slate-400">archived</span>}
                </div>
                {d.is_active && (
                  <Button variant="ghost" size="sm" onClick={() => archive(d.id)}><Trash2 className="h-4 w-4 text-slate-400" /></Button>
                )}
              </div>
            ))}
          </div>
        )}
        {open && (
          <FieldDialog
            mode={open.mode}
            row={open.mode === 'edit' ? open.row : undefined}
            defaultObjectType={object}
            onClose={() => { setOpen(null); refresh() }}
          />
        )}
      </CardContent>
    </Card>
  )
}

interface OptionDraft { value: string; label: string }

function FieldDialog({ mode, row, defaultObjectType, onClose }: {
  mode: 'add' | 'edit'
  row?: CustomFieldDefinition
  defaultObjectType: CustomFieldObjectType
  onClose: () => void
}) {
  const [form, setForm] = useState({
    object_type: row?.object_type ?? defaultObjectType,
    field_key:   row?.field_key   ?? '',
    label:       row?.label       ?? '',
    field_type:  row?.field_type  ?? ('text' as CustomFieldType),
    required:    row?.required    ?? false,
    is_active:   row?.is_active   ?? true,
    order_index: row?.order_index ?? 0,
  })
  const [options, setOptions] = useState<OptionDraft[]>(row?.options ?? [])
  const [submitting, setSubmitting] = useState(false)

  const needsOptions = form.field_type === 'select' || form.field_type === 'multi_select'

  function setOpt(i: number, patch: Partial<OptionDraft>) {
    setOptions(prev => prev.map((o, j) => (j === i ? { ...o, ...patch } : o)))
  }

  async function submit() {
    if (!form.label.trim()) { toast.error('Label is required'); return }
    if (!form.field_key.trim()) { toast.error('Field key is required'); return }
    if (needsOptions && options.length === 0) { toast.error('Add at least one option'); return }

    setSubmitting(true)
    const url    = mode === 'add' ? '/api/admin/custom-fields' : `/api/admin/custom-fields/${row?.id}`
    const method = mode === 'add' ? 'POST' : 'PATCH'
    const payload: Record<string, unknown> = {
      object_type: form.object_type,
      field_key:   form.field_key.trim(),
      label:       form.label.trim(),
      field_type:  form.field_type,
      required:    form.required,
      is_active:   form.is_active,
      order_index: form.order_index,
    }
    if (needsOptions) payload.options = options
    else              payload.options = null

    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setSubmitting(false)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(body.error ?? 'Save failed'); return }
    toast.success(mode === 'add' ? 'Field added' : 'Saved')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-900">{mode === 'add' ? 'New custom field' : 'Edit custom field'}</h3>
          <button type="button" onClick={onClose}><X className="h-4 w-4 text-slate-500" /></button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Applies to</Label>
              <Select disabled={mode === 'edit'} value={form.object_type} onChange={e => setForm({ ...form, object_type: e.target.value as CustomFieldObjectType })}>
                {OBJECT_TYPES.map(o => <option key={o} value={o} className="capitalize">{o}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.field_type} onChange={e => setForm({ ...form, field_type: e.target.value as CustomFieldType })}>
                {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Label</Label>
            <Input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="Seniority level" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Field key (slug)</Label>
            <Input
              value={form.field_key}
              onChange={e => setForm({ ...form, field_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
              placeholder="seniority_level"
              disabled={mode === 'edit'}
            />
            <p className="text-[10px] text-slate-400">Stable identifier in JSONB. Lowercase letters, numbers, underscore. Cannot change after create.</p>
          </div>

          {needsOptions && (
            <div className="space-y-1.5">
              <Label>Options</Label>
              <div className="space-y-2">
                {options.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input className="flex-1" placeholder="Value (stored)" value={o.value} onChange={e => setOpt(i, { value: e.target.value })} />
                    <Input className="flex-1" placeholder="Label (displayed)" value={o.label} onChange={e => setOpt(i, { label: e.target.value })} />
                    <Button variant="ghost" size="sm" onClick={() => setOptions(prev => prev.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4 text-slate-400" /></Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setOptions(prev => [...prev, { value: '', label: '' }])}>
                  <Plus className="h-4 w-4" /> Add option
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.required} onChange={e => setForm({ ...form, required: e.target.checked })} />
              Required
            </label>
            {mode === 'edit' && (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
                Active
              </label>
            )}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={submitting}>{mode === 'add' ? 'Create' : 'Save'}</Button>
        </div>
      </div>
    </div>
  )
}
