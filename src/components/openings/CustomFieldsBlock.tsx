'use client'

import { ShieldAlert } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import type { CustomFieldDefinition } from '@/lib/types/requisitions'

interface Props {
  definitions: CustomFieldDefinition[]
  values:      Record<string, unknown>
  onChange:    (next: Record<string, unknown>) => void
  /** field_keys whose edits need re-approval on an approved requisition — shown with an amber hint. */
  gatedKeys?:  string[]
  /** Text shown next to gated fields instead of the default "Needs re-approval" (e.g. when a change is already pending). */
  gatedHint?:  string
  /** Disable gated fields (a change is already awaiting approval). */
  gatedDisabled?: boolean
}

/**
 * Dynamic form for custom_field_definitions.
 *
 * Field-type → input mapping:
 *   text          → <Input>
 *   number        → <Input type="number">
 *   date          → <Input type="date">
 *   boolean       → checkbox
 *   select        → <Select> (single)
 *   multi_select  → multi-checkbox list (no Combobox primitive yet)
 *   user          → text input for now (a typeahead lands when /api/team
 *                   gains a search endpoint — Phase J keeps this minimal)
 */
export function CustomFieldsBlock({ definitions, values, onChange, gatedKeys = [], gatedHint, gatedDisabled = false }: Props) {
  const gated = new Set(gatedKeys)
  if (definitions.length === 0) return null

  function set(field_key: string, value: unknown) {
    onChange({ ...values, [field_key]: value })
  }

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-700">Custom fields</h3>
        <p className="text-[11px] text-slate-500">Defined by your admin in Settings.</p>
      </div>
      {definitions.map(def => {
        const v = values[def.field_key]
        const isGated = gated.has(def.field_key)
        return (
          <div key={def.id} className="space-y-1.5">
            <Label htmlFor={def.field_key} className="flex items-center gap-1.5">
              {def.label}
              {def.required && <span className="ml-1 text-red-600">*</span>}
              {isGated && (
                <span
                  className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800"
                  title={gatedHint ?? 'Editing this field sends the change back through the approval chain.'}
                >
                  <ShieldAlert className="h-3 w-3" /> {gatedHint ?? 'Needs re-approval'}
                </span>
              )}
            </Label>
            <fieldset disabled={isGated && gatedDisabled} className="min-w-0 disabled:opacity-60">
              {renderInput(def, v, set)}
            </fieldset>
          </div>
        )
      })}
    </div>
  )
}

function renderInput(
  def:  CustomFieldDefinition,
  v:    unknown,
  set:  (key: string, value: unknown) => void,
) {
  const k = def.field_key

  if (def.field_type === 'text' || def.field_type === 'user') {
    return (
      <Input id={k} value={(v as string) ?? ''} onChange={e => set(k, e.target.value)} />
    )
  }
  if (def.field_type === 'number') {
    return (
      <Input id={k} type="number" value={v === null || v === undefined ? '' : String(v)}
        onChange={e => set(k, e.target.value === '' ? null : Number(e.target.value))} />
    )
  }
  if (def.field_type === 'date') {
    return (
      <Input id={k} type="date" value={(v as string) ?? ''} onChange={e => set(k, e.target.value || null)} />
    )
  }
  if (def.field_type === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" id={k} checked={!!v} onChange={e => set(k, e.target.checked)} />
        Yes
      </label>
    )
  }
  if (def.field_type === 'select') {
    return (
      <Select id={k} value={(v as string) ?? ''} onChange={e => set(k, e.target.value || null)}>
        <option value="">—</option>
        {(def.options ?? []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    )
  }
  if (def.field_type === 'multi_select') {
    const arr = Array.isArray(v) ? (v as string[]) : []
    return (
      <div className="grid grid-cols-2 gap-1.5">
        {(def.options ?? []).map(o => {
          const checked = arr.includes(o.value)
          return (
            <label key={o.value} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => {
                  const next = checked ? arr.filter(x => x !== o.value) : [...arr, o.value]
                  set(k, next)
                }}
              />
              {o.label}
            </label>
          )
        })}
      </div>
    )
  }
  return null
}
