'use client'

import { useEffect, useState, useCallback } from 'react'
import { ArrowUp, ArrowDown, Trash2, Plus, BookPlus, Library, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import type {
  ScreeningField,
  ScreeningFieldType,
  ScreeningQuestion,
} from '@/lib/types/database'

const FIELD_TYPES: { value: ScreeningFieldType; label: string }[] = [
  { value: 'short_text',    label: 'Short text' },
  { value: 'long_text',     label: 'Paragraph' },
  { value: 'yes_no',        label: 'Yes / No' },
  { value: 'single_select', label: 'Single choice' },
  { value: 'multi_select',  label: 'Multiple choice' },
  { value: 'number',        label: 'Number' },
  { value: 'date',          label: 'Date' },
  { value: 'file',          label: 'File upload' },
  { value: 'url',           label: 'URL' },
]

function hasChoices(t: ScreeningFieldType) {
  return t === 'single_select' || t === 'multi_select'
}

function newField(partial: Partial<ScreeningField> = {}): ScreeningField {
  return {
    id:           crypto.randomUUID(),
    question_id:  null,
    label:        '',
    help_text:    null,
    field_type:   'short_text',
    options:      [],
    required:     false,
    is_eeo:       false,
    knockout:     null,
    visible_when: null,
    ...partial,
  }
}

// The set of answer choices a knockout rule can match against, by field type.
function knockoutChoices(field: ScreeningField): string[] {
  if (field.field_type === 'yes_no') return ['yes', 'no']
  if (hasChoices(field.field_type)) return field.options
  return []
}

export function ScreeningTab({ jobId }: { jobId: string }) {
  const [fields, setFields]   = useState<ScreeningField[]>([])
  const [library, setLibrary] = useState<ScreeningQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [dirty, setDirty]     = useState(false)
  const [showLibrary, setShowLibrary] = useState(false)

  useEffect(() => {
    let active = true
    Promise.all([
      fetch(`/api/jobs/${jobId}/screening`).then(r => r.json()),
      fetch('/api/screening/questions').then(r => r.json()),
    ])
      .then(([formRes, libRes]) => {
        if (!active) return
        setFields((formRes.data?.fields ?? []) as ScreeningField[])
        setLibrary((libRes.data ?? []) as ScreeningQuestion[])
      })
      .catch(() => toast.error('Could not load the application form'))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [jobId])

  const update = useCallback((id: string, patch: Partial<ScreeningField>) => {
    setFields(prev => prev.map(f => (f.id === id ? { ...f, ...patch } : f)))
    setDirty(true)
  }, [])

  function move(index: number, dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= fields.length) return
    setFields(prev => {
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
    setDirty(true)
  }

  function remove(id: string) {
    setFields(prev => prev.filter(f => f.id !== id))
    setDirty(true)
  }

  function addBlank() {
    setFields(prev => [...prev, newField()])
    setDirty(true)
  }

  function addFromLibrary(q: ScreeningQuestion) {
    setFields(prev => [
      ...prev,
      newField({
        question_id: q.id,
        label:       q.label,
        help_text:   q.help_text,
        field_type:  q.field_type,
        options:     q.options,
        is_eeo:      q.is_eeo,
      }),
    ])
    setDirty(true)
    setShowLibrary(false)
  }

  async function saveToLibrary(field: ScreeningField) {
    if (!field.label.trim()) { toast.error('Give the question a label first'); return }
    const res = await fetch('/api/screening/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label:      field.label.trim(),
        help_text:  field.help_text,
        field_type: field.field_type,
        options:    field.options,
        is_eeo:     field.is_eeo,
      }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(body.error ?? 'Could not save to library'); return }
    setLibrary(prev => [...prev, body.data as ScreeningQuestion])
    update(field.id, { question_id: (body.data as ScreeningQuestion).id })
    toast.success('Saved to your question library')
  }

  async function save() {
    for (const f of fields) {
      if (!f.label.trim()) { toast.error('Every question needs a label'); return }
      if (hasChoices(f.field_type) && f.options.length === 0) {
        toast.error(`"${f.label}" needs at least one choice`); return
      }
    }
    setSaving(true)
    const res = await fetch(`/api/jobs/${jobId}/screening`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    })
    setSaving(false)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(body.error ?? 'Save failed'); return }
    toast.success('Application form saved')
    setDirty(false)
  }

  if (loading) return <p className="text-sm text-slate-500">Loading application form…</p>

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Application form</CardTitle>
              <CardDescription>
                Questions candidates answer when they apply. Built-in fields (name, email,
                phone, LinkedIn, résumé, cover letter) are always collected — add your own below.
              </CardDescription>
            </div>
            <Button size="sm" onClick={save} loading={saving} disabled={!dirty}>
              <Save className="h-4 w-4" /> Save form
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {fields.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">
              No custom questions yet. Add one below, or pull from your library.
            </p>
          ) : (
            <div className="space-y-3">
              {fields.map((field, i) => (
                <FieldEditor
                  key={field.id}
                  field={field}
                  index={i}
                  total={fields.length}
                  // A field can only be controlled by an earlier choice-type question.
                  priorChoiceFields={fields.slice(0, i).filter(f => f.label.trim() && knockoutChoices(f).length > 0)}
                  onChange={patch => update(field.id, patch)}
                  onMove={dir => move(i, dir)}
                  onRemove={() => remove(field.id)}
                  onSaveToLibrary={() => saveToLibrary(field)}
                />
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100">
            <Button variant="outline" size="sm" onClick={addBlank}>
              <Plus className="h-4 w-4" /> Add question
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowLibrary(v => !v)}>
              <Library className="h-4 w-4" /> Add from library
            </Button>
          </div>

          {showLibrary && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              {library.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Your library is empty. Save a question to the library (the bookmark icon) to reuse it later.
                </p>
              ) : (
                <ul className="space-y-1">
                  {library.map(q => (
                    <li key={q.id} className="flex items-center justify-between gap-3">
                      <span className="text-sm text-slate-700 truncate">
                        {q.label}
                        {q.is_eeo && <span className="ml-2 text-[10px] uppercase text-violet-600">EEO</span>}
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => addFromLibrary(q)}>
                        <Plus className="h-4 w-4" /> Add
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

interface FieldEditorProps {
  field:             ScreeningField
  index:             number
  total:             number
  priorChoiceFields: ScreeningField[]
  onChange:          (patch: Partial<ScreeningField>) => void
  onMove:            (dir: -1 | 1) => void
  onRemove:          () => void
  onSaveToLibrary:   () => void
}

function FieldEditor({ field, index, total, priorChoiceFields, onChange, onMove, onRemove, onSaveToLibrary }: FieldEditorProps) {
  const choices = knockoutChoices(field)

  function setType(t: ScreeningFieldType) {
    // Reset options + knockout when leaving a choice type so stale data doesn't linger.
    const patch: Partial<ScreeningField> = { field_type: t }
    if (!hasChoices(t)) patch.options = []
    patch.knockout = null
    onChange(patch)
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-start gap-2">
        <div className="flex flex-col gap-0.5 pt-1">
          <button onClick={() => onMove(-1)} disabled={index === 0} className="text-slate-300 hover:text-slate-600 disabled:opacity-30" aria-label="Move up">
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => onMove(1)} disabled={index === total - 1} className="text-slate-300 hover:text-slate-600 disabled:opacity-30" aria-label="Move down">
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex-1 min-w-0 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3">
            <div className="space-y-1.5">
              <Label>Question</Label>
              <Input
                value={field.label}
                onChange={e => onChange({ label: e.target.value })}
                placeholder="e.g. Are you authorized to work in India?"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={field.field_type} onChange={e => setType(e.target.value as ScreeningFieldType)}>
                {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Help text <span className="text-slate-400 font-normal">(optional)</span></Label>
            <Input
              value={field.help_text ?? ''}
              onChange={e => onChange({ help_text: e.target.value || null })}
              placeholder="Shown under the question to guide the candidate."
            />
          </div>

          {hasChoices(field.field_type) && (
            <ChoiceEditor options={field.options} onChange={options => onChange({ options })} />
          )}

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <label className="inline-flex items-center gap-1.5 text-slate-700">
              <input type="checkbox" checked={field.required} onChange={e => onChange({ required: e.target.checked })} />
              Required
            </label>
            <label className="inline-flex items-center gap-1.5 text-slate-700">
              <input type="checkbox" checked={field.is_eeo} onChange={e => onChange({ is_eeo: e.target.checked })} />
              EEO / voluntary <span className="text-slate-400">(hidden from hiring team)</span>
            </label>
          </div>

          <VisibilityEditor field={field} priorChoiceFields={priorChoiceFields} onChange={onChange} />

          {choices.length > 0 && (
            <KnockoutEditor field={field} choices={choices} onChange={onChange} />
          )}
        </div>

        <div className="flex flex-col gap-1 pt-1">
          {!field.question_id && (
            <button onClick={onSaveToLibrary} className="text-slate-300 hover:text-emerald-600" aria-label="Save to library" title="Save to library">
              <BookPlus className="h-4 w-4" />
            </button>
          )}
          <button onClick={onRemove} className="text-slate-300 hover:text-red-500" aria-label="Remove question">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

function ChoiceEditor({ options, onChange }: { options: string[]; onChange: (o: string[]) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>Choices</Label>
      <div className="space-y-1.5">
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={opt}
              onChange={e => onChange(options.map((o, j) => (j === i ? e.target.value : o)))}
              placeholder={`Choice ${i + 1}`}
            />
            <button onClick={() => onChange(options.filter((_, j) => j !== i))} className="text-slate-300 hover:text-red-500" aria-label="Remove choice">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={() => onChange([...options, ''])}>
          <Plus className="h-4 w-4" /> Add choice
        </Button>
      </div>
    </div>
  )
}

function KnockoutEditor({ field, choices, onChange }: { field: ScreeningField; choices: string[]; onChange: (patch: Partial<ScreeningField>) => void }) {
  const enabled = field.knockout != null
  const value = field.knockout?.value
  const selected = Array.isArray(value) ? value[0] ?? '' : value ?? ''

  return (
    <div className="rounded-md bg-amber-50 border border-amber-100 p-2.5 space-y-2">
      <label className="inline-flex items-center gap-1.5 text-sm text-amber-900">
        <input
          type="checkbox"
          checked={enabled}
          onChange={e => onChange({ knockout: e.target.checked ? { operator: 'eq', value: choices[0] ?? '' } : null })}
        />
        Disqualify automatically based on the answer
      </label>
      {enabled && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-amber-900">
          <span>If the answer</span>
          <select
            value={field.knockout!.operator}
            onChange={e => onChange({ knockout: { ...field.knockout!, operator: e.target.value as 'eq' | 'neq' } })}
            className="h-8 rounded-md border border-amber-200 bg-white px-2 text-sm"
          >
            <option value="eq">is</option>
            <option value="neq">is not</option>
          </select>
          <select
            value={selected}
            onChange={e => onChange({ knockout: { ...field.knockout!, value: e.target.value } })}
            className="h-8 rounded-md border border-amber-200 bg-white px-2 text-sm"
          >
            {choices.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <span>the candidate is knocked out.</span>
        </div>
      )}
    </div>
  )
}

// Conditional visibility (Phase 3d): show this question only when an earlier
// choice-type question was answered a certain way. `in` / `not_in` so the rule
// works the same for yes-no, single- and multi-select controllers.
function VisibilityEditor({
  field, priorChoiceFields, onChange,
}: { field: ScreeningField; priorChoiceFields: ScreeningField[]; onChange: (patch: Partial<ScreeningField>) => void }) {
  const rule = field.visible_when

  if (priorChoiceFields.length === 0) {
    if (!rule) return null
    // The controlling question was moved below or removed — let the recruiter clear the now-orphaned rule.
    return (
      <div className="rounded-md bg-slate-50 border border-slate-200 p-2.5 text-sm text-slate-600">
        This question’s show/hide rule points at a question that no longer comes before it.{' '}
        <button onClick={() => onChange({ visible_when: null })} className="text-emerald-700 underline">
          Clear rule
        </button>
      </div>
    )
  }

  const controller = priorChoiceFields.find(f => f.id === rule?.field_id) ?? null
  const controllerChoices = controller ? knockoutChoices(controller) : []
  const selectedValue = Array.isArray(rule?.value) ? rule?.value[0] ?? '' : rule?.value ?? ''

  function enable(on: boolean) {
    if (!on) { onChange({ visible_when: null }); return }
    const first = priorChoiceFields[0]
    onChange({ visible_when: { field_id: first.id, operator: 'in', value: knockoutChoices(first)[0] ?? '' } })
  }

  function setController(id: string) {
    const f = priorChoiceFields.find(c => c.id === id)
    onChange({ visible_when: { field_id: id, operator: rule!.operator, value: f ? knockoutChoices(f)[0] ?? '' : '' } })
  }

  return (
    <div className="rounded-md bg-sky-50 border border-sky-100 p-2.5 space-y-2">
      <label className="inline-flex items-center gap-1.5 text-sm text-sky-900">
        <input type="checkbox" checked={rule != null} onChange={e => enable(e.target.checked)} />
        Only show this question based on an earlier answer
      </label>
      {rule && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-sky-900">
          <span>Show if</span>
          <select
            value={controller?.id ?? ''}
            onChange={e => setController(e.target.value)}
            className="h-8 max-w-[180px] truncate rounded-md border border-sky-200 bg-white px-2 text-sm"
          >
            {priorChoiceFields.map(f => <option key={f.id} value={f.id}>{f.label || '(untitled)'}</option>)}
          </select>
          <select
            value={rule.operator}
            onChange={e => onChange({ visible_when: { ...rule, operator: e.target.value as 'in' | 'not_in' } })}
            className="h-8 rounded-md border border-sky-200 bg-white px-2 text-sm"
          >
            <option value="in">is</option>
            <option value="not_in">is not</option>
          </select>
          <select
            value={selectedValue}
            onChange={e => onChange({ visible_when: { ...rule, value: e.target.value } })}
            className="h-8 rounded-md border border-sky-200 bg-white px-2 text-sm"
          >
            {controllerChoices.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}
    </div>
  )
}
