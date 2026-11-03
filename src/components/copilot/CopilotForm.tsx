'use client'

/**
 * CopilotForm — the click-through form the copilot shows instead of a wall of
 * questions. The coordinator AI calls `ask_user_form` with a list of fields;
 * the route streams it here as a `form` event. The AI only picks WHICH fields
 * to show and their type — option lists for dropdowns come from the org's own
 * data (departments, locations, teammates) or fixed lists below, never from
 * the AI, so they can't be made up.
 *
 * On submit, answers go back to the copilot as one chat message (each line
 * labelled with the field key so the AI can map it to the right tool arg).
 */

import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, Check, Sparkles, Loader2 } from 'lucide-react'
import { RichTextEditor } from '@/components/RichTextEditor'

// Spec types live in ./form-spec (shared with the server route).
import type { FormField, FormFieldType, FormSpec } from './form-spec'
export type { FormSpec } from './form-spec'

// ── Fixed option lists ─────────────────────────────────────────────────────────

const LEVELS = ['Intern', 'Junior', 'Mid', 'Senior', 'Lead', 'Manager', 'Director', 'VP']
const EMPLOYMENT_TYPES: { value: string; label: string }[] = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contract',  label: 'Contract' },
  { value: 'intern',    label: 'Internship' },
  { value: 'temp',      label: 'Temporary' },
]
const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'SGD', 'AED', 'AUD', 'CAD']
const OTHER = '__other__'

type Teammate = { name: string; email: string }

// ── Helpers ────────────────────────────────────────────────────────────────────

function isBlank(v: string | undefined): boolean {
  if (!v) return true
  // Rich-text editors produce "<p></p>" when empty.
  return v.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim() === ''
}

function textLength(v: string | undefined): number {
  return (v ?? '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim().length
}

/** Turn the answers into (a) the message the AI reads and (b) the short line
 *  shown in the user's chat bubble. */
export function buildFormAnswer(spec: FormSpec, values: Record<string, string>): { message: string; display: string } {
  const lines: string[] = []
  const skipped: string[] = []
  for (const f of spec.fields) {
    const v = values[f.key]
    if (isBlank(v)) {
      if (!f.required) skipped.push(f.label)
      continue
    }
    lines.push(`- ${f.label} [${f.key}]: ${v}`)
  }
  const message = [
    `Here are my answers from the form${spec.steps.length ? ` (steps: ${spec.steps.join(' → ')})` : ''}.`,
    `Submitting this form is my approval to carry out these steps.`,
    '',
    ...lines,
    skipped.length ? `\nLeft blank (optional — leave unset): ${skipped.join(', ')}` : '',
  ].join('\n').trim()
  // The chat bubble stays short — the details go only to the AI.
  return { message, display: '✓ Details submitted' }
}

// ── Component ──────────────────────────────────────────────────────────────────

const inputCls =
  'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 ' +
  'focus:outline-none focus:ring-2 focus:ring-emerald-400 placeholder:text-slate-400'

export function CopilotForm({
  spec,
  disabled,
  onSubmit,
}: {
  spec: FormSpec
  disabled?: boolean
  onSubmit: (answer: { message: string; display: string }) => void
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const f of spec.fields) {
      if (!f.default) continue
      // The AI may suggest a label ("Full-time") where the dropdown stores a code
      // ("full_time") — match either, case-insensitively.
      if (f.type === 'employment_type') {
        const d = f.default.trim().toLowerCase()
        const hit = EMPLOYMENT_TYPES.find(o => o.value === d || o.label.toLowerCase() === d)
        if (hit) init[f.key] = hit.value
        continue
      }
      if (f.type === 'level' || f.type === 'currency') {
        const list = f.type === 'level' ? LEVELS : CURRENCIES
        const hit = list.find(x => x.toLowerCase() === f.default!.trim().toLowerCase())
        init[f.key] = hit ?? f.default
        continue
      }
      if (f.type === 'yes_no') {
        const d = f.default.trim().toLowerCase()
        init[f.key] = ['yes', 'true', 'y'].includes(d) ? 'yes' : ['no', 'false', 'n'].includes(d) ? 'no' : ''
        continue
      }
      init[f.key] = f.default
    }
    return init
  })
  const [otherMode, setOtherMode] = useState<Record<string, boolean>>({})
  const [personParts, setPersonParts] = useState<Record<string, { name: string; email: string }>>(() => {
    // A suggested person arrives as "Name <email>" — split it into the two boxes.
    const init: Record<string, { name: string; email: string }> = {}
    for (const f of spec.fields) {
      if (f.type !== 'person' || !f.default) continue
      const m = f.default.match(/^(.*?)\s*<([^>]+)>\s*$/)
      init[f.key] = m ? { name: m[1].trim(), email: m[2].trim() }
        : f.default.includes('@') ? { name: '', email: f.default.trim() } : { name: f.default.trim(), email: '' }
    }
    return init
  })
  const [showErrors, setShowErrors] = useState(false)
  // "Write with AI": which field is drafting, per-field errors, and a version
  // counter that remounts the editor so it shows the new draft.
  const [drafting, setDrafting]     = useState<string | null>(null)
  const [draftError, setDraftError] = useState<Record<string, string>>({})
  const [editorVersion, setEditorVersion] = useState<Record<string, number>>({})

  const [departments, setDepartments] = useState<string[] | null>(null)
  const [locations,   setLocations]   = useState<string[] | null>(null)
  const [teammates,   setTeammates]   = useState<Teammate[]>([])

  const needs = useMemo(() => new Set(spec.fields.map(f => f.type)), [spec.fields])

  // Load the org's own lists, only for the field types this form uses.
  useEffect(() => {
    const load = async (url: string) => {
      try {
        const r = await fetch(url)
        if (!r.ok) return []
        const j = await r.json()
        return Array.isArray(j?.data) ? j.data : []
      } catch { return [] }
    }
    if (needs.has('department')) {
      load('/api/departments').then((rows: { name: string; is_active?: boolean }[]) =>
        setDepartments(rows.filter(r => r.is_active !== false).map(r => r.name)))
    }
    if (needs.has('location')) {
      load('/api/locations').then((rows: { name: string; is_active?: boolean }[]) =>
        setLocations(rows.filter(r => r.is_active !== false).map(r => r.name)))
    }
    if (needs.has('person')) {
      load('/api/team').then((rows: { is_active?: boolean; users?: { email?: string; full_name?: string; first_name?: string; last_name?: string } }[]) =>
        setTeammates(rows
          .filter(r => r.is_active !== false && r.users?.email)
          .map(r => ({
            email: r.users!.email!,
            name:  r.users!.full_name || [r.users!.first_name, r.users!.last_name].filter(Boolean).join(' ') || r.users!.email!,
          }))))
    }
  }, [needs])

  // A suggested department/location that isn't in the org's list can't be saved
  // (the requisition would reject it), so clear it once the list has loaded and
  // let the recruiter pick a real one.
  useEffect(() => {
    const lists: [FormFieldType, string[] | null][] = [['department', departments], ['location', locations]]
    setValues(prev => {
      let next = prev
      for (const [type, list] of lists) {
        if (list === null) continue
        for (const f of spec.fields) {
          if (f.type !== type) continue
          const v = prev[f.key]
          const hit = v ? list.find(x => x.toLowerCase() === v.toLowerCase()) : undefined
          if (v && hit !== v) next = { ...next, [f.key]: hit ?? '' }
        }
      }
      return next
    })
  }, [departments, locations, spec.fields])

  const set = (key: string, v: string) => setValues(prev => ({ ...prev, [key]: v }))

  const setPerson = (key: string, part: 'name' | 'email', v: string) => {
    setPersonParts(prev => {
      const cur = { ...(prev[key] ?? { name: '', email: '' }), [part]: v }
      // Picking a teammate's name from the suggestions fills in their email.
      if (part === 'name') {
        const match = teammates.find(t => t.name.toLowerCase() === v.trim().toLowerCase())
        if (match && !cur.email) cur.email = match.email
      }
      const combined = cur.name.trim() && cur.email.trim()
        ? `${cur.name.trim()} <${cur.email.trim()}>`
        : (cur.name.trim() || cur.email.trim())
      set(key, combined)
      return { ...prev, [key]: cur }
    })
  }

  /** Everything filled in so far, as label → readable value, for the AI. */
  const contextForAi = (except: string): Record<string, string> => {
    const out: Record<string, string> = {}
    for (const f of spec.fields) {
      if (f.key === except) continue
      const v = values[f.key]
      if (isBlank(v)) continue
      let text = v!
      if (f.type === 'rich_text') text = v!.replace(/<\/(p|li|h[1-6])>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
      if (f.type === 'employment_type') text = EMPLOYMENT_TYPES.find(o => o.value === v)?.label ?? v!
      out[f.label] = text.slice(0, 4000)
    }
    return out
  }

  const draftWithAi = async (f: FormField) => {
    setDrafting(f.key)
    setDraftError(e => ({ ...e, [f.key]: '' }))
    try {
      const res = await fetch('/api/copilot/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field_key:   f.key,
          field_label: f.label,
          subject:     spec.subject,
          intro:       spec.intro,
          context:     contextForAi(f.key),
          current:     isBlank(values[f.key]) ? undefined : values[f.key],
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || typeof j.html !== 'string') {
        setDraftError(e => ({ ...e, [f.key]: j.error ?? "Couldn't write a draft — try again." }))
        return
      }
      set(f.key, j.html)
      setEditorVersion(v => ({ ...v, [f.key]: (v[f.key] ?? 0) + 1 }))
    } catch {
      setDraftError(e => ({ ...e, [f.key]: "Couldn't write a draft — try again." }))
    } finally {
      setDrafting(null)
    }
  }

  const errorFor = (f: FormField): string | null => {
    const v = values[f.key]
    if (f.required && isBlank(v)) return 'Required'
    if (f.min_length && !isBlank(v) && textLength(v) < f.min_length) {
      return `At least ${f.min_length} characters (${textLength(v)} so far)`
    }
    return null
  }

  const required = spec.fields.filter(f => f.required)
  const optional = spec.fields.filter(f => !f.required)
  const hasErrors = spec.fields.some(f => errorFor(f))

  const handleSubmit = () => {
    if (hasErrors) { setShowErrors(true); return }
    onSubmit(buildFormAnswer(spec, values))
  }

  // ── Field renderers ──────────────────────────────────────────────────────────

  const renderSelect = (f: FormField, opts: { value: string; label: string }[], allowOther: boolean, loading = false) => {
    const v = values[f.key] ?? ''
    const inList = opts.some(o => o.value === v)
    if (otherMode[f.key] || (allowOther && v && !inList && !loading)) {
      return (
        <div className="flex gap-1.5">
          <input className={inputCls} value={v} autoFocus placeholder={`Type ${f.label.toLowerCase()}`}
            onChange={e => set(f.key, e.target.value)} disabled={disabled} />
          <button type="button" className="text-xs text-slate-500 hover:text-slate-700 px-1.5"
            onClick={() => { setOtherMode(m => ({ ...m, [f.key]: false })); set(f.key, '') }}>
            List
          </button>
        </div>
      )
    }
    return (
      <select className={inputCls} value={inList ? v : ''} disabled={disabled}
        onChange={e => {
          if (e.target.value === OTHER) { setOtherMode(m => ({ ...m, [f.key]: true })); set(f.key, ''); return }
          set(f.key, e.target.value)
        }}>
        <option value="">{loading ? 'Loading…' : opts.length ? 'Select…' : 'None set up yet'}</option>
        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        {allowOther && <option value={OTHER}>Other…</option>}
      </select>
    )
  }

  const renderField = (f: FormField) => {
    const v = values[f.key] ?? ''
    const asOpts = (xs: string[]) => xs.map(x => ({ value: x, label: x }))
    switch (f.type) {
      case 'rich_text':
        return (
          <div className={drafting === f.key ? 'opacity-60 pointer-events-none' : ''}>
            <RichTextEditor key={editorVersion[f.key] ?? 0} value={v} minHeight={90}
              placeholder={f.help ?? `Write the ${f.label.toLowerCase()}, or click "Write with AI"…`}
              onChange={html => set(f.key, html)} />
          </div>
        )
      case 'number':
        return <input type="number" className={inputCls} value={v} disabled={disabled} onChange={e => set(f.key, e.target.value)} />
      case 'date':
        return <input type="date" className={inputCls} value={v} disabled={disabled} onChange={e => set(f.key, e.target.value)} />
      case 'yes_no':
        return renderSelect(f, [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }], false)
      case 'select':
        return renderSelect(f, asOpts(f.options ?? []), true)
      case 'department':
        return renderSelect(f, asOpts(departments ?? []), false, departments === null)
      case 'location':
        return renderSelect(f, asOpts(locations ?? []), false, locations === null)
      case 'level':
        return renderSelect(f, asOpts(LEVELS), true)
      case 'employment_type':
        return renderSelect(f, EMPLOYMENT_TYPES, false)
      case 'currency':
        return renderSelect(f, asOpts(CURRENCIES), true)
      case 'person': {
        const p = personParts[f.key] ?? { name: '', email: '' }
        const listId = `copilot-team-${f.key}`
        return (
          <div className="grid grid-cols-2 gap-1.5">
            <input className={inputCls} placeholder="Name" list={listId} value={p.name} disabled={disabled}
              onChange={e => setPerson(f.key, 'name', e.target.value)} />
            <input className={inputCls} placeholder="Email" type="email" value={p.email} disabled={disabled}
              onChange={e => setPerson(f.key, 'email', e.target.value)} />
            <datalist id={listId}>
              {teammates.map(t => <option key={t.email} value={t.name}>{t.email}</option>)}
            </datalist>
          </div>
        )
      }
      case 'text':
      default:
        return <input className={inputCls} value={v} disabled={disabled} onChange={e => set(f.key, e.target.value)} />
    }
  }

  const renderGroup = (title: string, fields: FormField[], note?: string) => fields.length > 0 && (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
        {note && <p className="text-[11px] text-slate-400">{note}</p>}
      </div>
      {fields.map(f => {
        const err = showErrors ? errorFor(f) : null
        return (
          <div key={f.key} className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <label className="block text-xs font-medium text-slate-700">
                {f.label}{f.required && <span className="text-red-500"> *</span>}
              </label>
              {f.type === 'rich_text' && (
                <button type="button" disabled={disabled || drafting !== null}
                  onClick={() => draftWithAi(f)}
                  title={isBlank(values[f.key]) ? 'Draft this from the details above' : 'Improve this draft using the details above'}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50">
                  {drafting === f.key
                    ? <><Loader2 className="w-3 h-3 animate-spin" /> Writing…</>
                    : <><Sparkles className="w-3 h-3" /> {isBlank(values[f.key]) ? 'Write with AI' : 'Improve with AI'}</>}
                </button>
              )}
            </div>
            {renderField(f)}
            {draftError[f.key] && <p className="text-[11px] text-red-600">{draftError[f.key]}</p>}
            {err
              ? <p className="text-[11px] text-red-600">{err}</p>
              : f.help && f.type !== 'rich_text' && <p className="text-[11px] text-slate-400">{f.help}</p>}
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3.5 space-y-4">
      <div className="flex items-start gap-2">
        <ClipboardList className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
        <div className="space-y-1.5 min-w-0">
          {spec.intro && <p className="text-sm text-slate-700">{spec.intro}</p>}
          {spec.steps.length > 0 && (
            <ol className="flex flex-wrap items-center gap-1 text-[11px] text-slate-600">
              {spec.steps.map((s, i) => (
                <li key={i} className="flex items-center gap-1">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5">{i + 1}. {s}</span>
                  {i < spec.steps.length - 1 && <span className="text-slate-300">→</span>}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {renderGroup('Required', required)}
      {renderGroup('Optional', optional, 'Defaults filled in — change only if needed')}

      <div className="flex items-center justify-end gap-2 pt-1">
        {showErrors && hasErrors && <p className="text-[11px] text-red-600 mr-auto">Fill the highlighted fields</p>}
        <button type="button" onClick={handleSubmit} disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">
          <Check className="w-3.5 h-3.5" /> Submit &amp; continue
        </button>
      </div>
    </div>
  )
}
