'use client'

import { useState } from 'react'
import { X, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import type { JobTemplate, JobTemplatePosting } from '@/lib/types/requisitions'
import { RichTextEditor, isHtmlEmpty } from '@/components/RichTextEditor'
import { Button } from '@/components/ui/button'
import { inputCls, labelCls } from '@/lib/ui/styles'

// Side-panel editor for a full job template (create + edit). Mirrors the New
// Job drawer's vocabulary (same level / work-model / employment-type choices)
// so what a template stores is exactly what the drawer can prefill.

export interface EditorOption { id: string; name: string }
export interface PlanTemplateOption { id: string; name: string }

const LEVEL_OPTIONS = ['Intern', 'Junior', 'Mid-level', 'Senior', 'Lead', 'Staff', 'Principal', 'Director', 'VP']
const WORK_MODELS = [
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite', label: 'On-site' },
] as const
const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship', 'Temporary']
const CHANNELS: Array<{ value: NonNullable<JobTemplatePosting['channel']>; label: string }> = [
  { value: 'careers_page', label: 'Careers page' },
  { value: 'linkedin',     label: 'LinkedIn' },
  { value: 'indeed',       label: 'Indeed' },
  { value: 'glassdoor',    label: 'Glassdoor' },
  { value: 'custom',       label: 'Custom' },
]

interface FormState {
  name: string
  description: string
  title: string
  department_id: string
  location_id: string
  level: string
  work_model: string
  employment_type: string
  confidentiality: 'public' | 'confidential'
  comp_min: string
  comp_max: string
  comp_currency: string
  plan_template_id: string
  jd: string
  team_context: string
  key_requirements: string
  nice_to_have: string
  target_companies: string       // comma-separated in the UI
  notes: string
  posting_enabled: boolean
  posting_title: string
  posting_channel: NonNullable<JobTemplatePosting['channel']>
  posting_visibility: 'listed' | 'unlisted'
}

function fromTemplate(t: JobTemplate | null): FormState {
  return {
    name:             t?.name ?? '',
    description:      t?.description ?? '',
    title:            t?.title ?? '',
    department_id:    t?.department_id ?? '',
    location_id:      t?.location_id ?? '',
    level:            t?.level ?? '',
    work_model:       t?.work_model ?? '',
    employment_type:  t?.employment_type ?? '',
    confidentiality:  t?.confidentiality ?? 'public',
    comp_min:         t?.comp_min != null ? String(t.comp_min) : '',
    comp_max:         t?.comp_max != null ? String(t.comp_max) : '',
    comp_currency:    t?.comp_currency ?? '',
    plan_template_id: t?.plan_template_id ?? '',
    jd:               t?.jd ?? '',
    team_context:     (t?.intake?.team_context as string | undefined) ?? '',
    key_requirements: (t?.intake?.key_requirements as string | undefined) ?? '',
    nice_to_have:     (t?.intake?.nice_to_have as string | undefined) ?? '',
    target_companies: (t?.intake?.target_companies ?? []).join(', '),
    notes:            (t?.intake?.notes as string | undefined) ?? '',
    posting_enabled:  !!t?.posting,
    posting_title:    t?.posting?.title ?? '',
    posting_channel:  t?.posting?.channel ?? 'careers_page',
    posting_visibility: t?.posting?.visibility ?? 'listed',
  }
}

function toPayload(f: FormState) {
  const clean = (html: string) => (isHtmlEmpty(html) ? null : html)
  return {
    name:             f.name.trim(),
    description:      f.description.trim() || null,
    title:            f.title.trim() || null,
    department_id:    f.department_id || null,
    location_id:      f.location_id || null,
    level:            f.level || null,
    work_model:       f.work_model || null,
    employment_type:  f.employment_type || null,
    confidentiality:  f.confidentiality,
    comp_min:         f.comp_min === '' ? null : Number(f.comp_min),
    comp_max:         f.comp_max === '' ? null : Number(f.comp_max),
    comp_currency:    f.comp_currency.trim().toUpperCase() || null,
    plan_template_id: f.plan_template_id || null,
    jd:               clean(f.jd),
    intake: {
      team_context:     clean(f.team_context),
      key_requirements: clean(f.key_requirements),
      nice_to_have:     clean(f.nice_to_have),
      target_companies: f.target_companies.split(',').map(s => s.trim()).filter(Boolean),
      notes:            f.notes.trim() || null,
    },
    posting: f.posting_enabled
      ? { title: f.posting_title.trim() || null, channel: f.posting_channel, visibility: f.posting_visibility }
      : null,
  }
}

interface Props {
  template: JobTemplate | null            // null → create
  departments: EditorOption[]
  locations: EditorOption[]
  planTemplates: PlanTemplateOption[]
  onClose: () => void
  onSaved: (tpl: JobTemplate) => void
}

export function JobTemplateEditor({ template, departments, locations, planTemplates, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(() => fromTemplate(template))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(f => ({ ...f, [k]: v }))

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Give the template a name.'); return }
    if (form.comp_min !== '' && form.comp_max !== '' && Number(form.comp_min) > Number(form.comp_max)) {
      setError('Salary min can\'t be higher than salary max.'); return
    }
    setSaving(true); setError(null)
    const url    = template ? `/api/job-templates/${template.id}` : '/api/job-templates'
    const method = template ? 'PATCH' : 'POST'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toPayload(form)) })
    const json = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setError(json.error ?? 'Could not save the template.'); return }
    toast.success(template ? 'Template updated.' : 'Template created.')
    onSaved(json.data as JobTemplate)
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} aria-hidden />
      <div className="relative h-full w-full max-w-2xl overflow-y-auto bg-slate-50 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">{template ? 'Edit job template' : 'New job template'}</h2>
            <p className="text-xs text-slate-500 mt-0.5">Everything here prefills the New Job form. Jobs created from it are independent afterwards.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={save} className="space-y-5 p-6">
          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Template</p>
            <div>
              <label className={labelCls}>Template name <span className="text-red-500">*</span></label>
              <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Senior Backend Engineer — Bengaluru" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>What is it for? <span className="font-normal text-slate-400">(optional)</span></label>
              <input value={form.description} onChange={e => set('description', e.target.value)} placeholder="Standard IC engineering hire in the platform team" className={inputCls} />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Job fields</p>
            <div>
              <label className={labelCls}>Job title</label>
              <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Senior Backend Engineer" className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Department</label>
                <select value={form.department_id} onChange={e => set('department_id', e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Location</label>
                <select value={form.location_id} onChange={e => set('location_id', e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Level / seniority</label>
                <select value={form.level} onChange={e => set('level', e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {LEVEL_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                  {form.level && !LEVEL_OPTIONS.includes(form.level) && <option value={form.level}>{form.level}</option>}
                </select>
              </div>
              <div>
                <label className={labelCls}>Work model</label>
                <select value={form.work_model} onChange={e => set('work_model', e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {WORK_MODELS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Employment type</label>
                <select value={form.employment_type} onChange={e => set('employment_type', e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  {form.employment_type && !EMPLOYMENT_TYPES.includes(form.employment_type) && <option value={form.employment_type}>{form.employment_type}</option>}
                </select>
              </div>
              <div>
                <label className={labelCls}>Confidentiality</label>
                <select value={form.confidentiality} onChange={e => set('confidentiality', e.target.value as FormState['confidentiality'])} className={inputCls}>
                  <option value="public">Public</option>
                  <option value="confidential">Confidential</option>
                </select>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Compensation</p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Salary min</label>
                <input type="number" min={0} value={form.comp_min} onChange={e => set('comp_min', e.target.value)} placeholder="120000" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Salary max</label>
                <input type="number" min={0} value={form.comp_max} onChange={e => set('comp_max', e.target.value)} placeholder="160000" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Currency</label>
                <input value={form.comp_currency} onChange={e => set('comp_currency', e.target.value)} maxLength={3} placeholder="INR" className={inputCls + ' uppercase'} />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Interview plan</p>
            <div>
              <label className={labelCls}>Plan template</label>
              <select value={form.plan_template_id} onChange={e => set('plan_template_id', e.target.value)} className={inputCls}>
                <option value="">None — keep the default pipeline</option>
                {planTemplates.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <p className="mt-1.5 text-xs text-slate-400">Applied to the new job&apos;s pipeline right after it is created (stages, funnel steps, automation rules).</p>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Job description</p>
            <RichTextEditor value={form.jd} onChange={v => set('jd', v)} minHeight={180}
              placeholder="The job description candidates will see. Leave blank to write or generate it per job." />
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Team &amp; requirements</p>
            <div>
              <label className={labelCls}>What does this person do on the team?</label>
              <RichTextEditor value={form.team_context} onChange={v => set('team_context', v)} minHeight={90}
                placeholder="They'll own the checkout flow, work with design…" />
            </div>
            <div>
              <label className={labelCls}>Key requirements</label>
              <RichTextEditor value={form.key_requirements} onChange={v => set('key_requirements', v)} minHeight={90}
                placeholder="5+ years React, Node.js, shipped production apps…" />
            </div>
            <div>
              <label className={labelCls}>Nice to have</label>
              <RichTextEditor value={form.nice_to_have} onChange={v => set('nice_to_have', v)} minHeight={70}
                placeholder="Next.js, fintech background…" />
            </div>
            <div>
              <label className={labelCls}>Target companies <span className="font-normal text-slate-400">(comma-separated)</span></label>
              <input value={form.target_companies} onChange={e => set('target_companies', e.target.value)} placeholder="Stripe, Razorpay, Flipkart" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Anything else to know?</label>
              <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Unique perks, team culture, must-haves…" className={inputCls + ' resize-none'} />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Draft posting</p>
                <p className="mt-1 text-xs text-slate-400">Create an unpublished posting on the new job so it is ready to review and publish.</p>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.posting_enabled} onChange={e => set('posting_enabled', e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                Include
              </label>
            </div>
            {form.posting_enabled && (
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className={labelCls}>Posting title <span className="font-normal text-slate-400">(defaults to the job title)</span></label>
                  <input value={form.posting_title} onChange={e => set('posting_title', e.target.value)} placeholder="Same as job title" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Channel</label>
                  <select value={form.posting_channel} onChange={e => set('posting_channel', e.target.value as FormState['posting_channel'])} className={inputCls}>
                    {CHANNELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Visibility</label>
                  <select value={form.posting_visibility} onChange={e => set('posting_visibility', e.target.value as FormState['posting_visibility'])} className={inputCls}>
                    <option value="listed">Listed on the careers page</option>
                    <option value="unlisted">Unlisted — direct link only</option>
                  </select>
                </div>
                <p className="col-span-2 text-xs text-slate-400">The posting&apos;s description starts as the job description above.</p>
              </div>
            )}
          </section>

          <div className="flex items-center justify-end gap-2 pb-4">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
              {template ? 'Save changes' : 'Create template'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
