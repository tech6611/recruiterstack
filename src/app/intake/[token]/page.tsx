'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import {
  Loader2, CheckCircle, AlertCircle, Sparkles, Wand2, PenLine,
  RefreshCw, Paperclip, X, Pencil,
} from 'lucide-react'
import { inputClsWhite } from '@/lib/ui/styles'
import { trackEvent } from '@/lib/analytics'
import { RichTextEditor, isHtmlEmpty, stripHtml } from '@/components/RichTextEditor'
import type { Editor } from '@tiptap/react'

// ─── Constants ────────────────────────────────────────────────────────────────

const LEVEL_OPTIONS = ['Intern', 'Junior', 'Mid-level', 'Senior', 'Lead', 'Staff', 'Principal', 'Director', 'VP']

const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship', 'Temporary']

// Work arrangement. Value is the stored key; label is what the HM sees.
const WORK_MODELS = [
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite', label: 'On-site' },
] as const

const CITIES = [
  'Remote', 'Hybrid',
  'New York, NY', 'San Francisco, CA', 'Los Angeles, CA', 'Chicago, IL', 'Austin, TX',
  'Seattle, WA', 'Boston, MA', 'Denver, CO', 'Atlanta, GA', 'Miami, FL',
  'Washington, DC', 'Dallas, TX', 'Phoenix, AZ', 'Portland, OR', 'Nashville, TN',
  'London, UK', 'Dubai, UAE', 'Singapore', 'Mumbai, India', 'Bangalore, India',
  'Toronto, Canada', 'Vancouver, Canada', 'Sydney, Australia', 'Berlin, Germany',
  'Amsterdam, Netherlands', 'Paris, France', 'Zurich, Switzerland', 'Tel Aviv, Israel',
  'Hong Kong', 'Tokyo, Japan', 'São Paulo, Brazil',
]

// The rich editor seeds from HTML. Prefill / imported / AI-generated values may
// arrive as plain text (newlines, no markup), which the editor would collapse.
// Convert blank-line blocks into <p> paragraphs (single newlines → <br>);
// anything that already contains HTML tags is passed through untouched.
const HTML_TAG = /<\/?[a-z][\s\S]*>/i
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function textToHtml(value: string | null | undefined): string {
  if (!value) return ''
  if (HTML_TAG.test(value)) return value
  return value
    .split(/\n{2,}/)
    .map(block => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

interface IntakePrefill {
  level: string | null
  employment_type: string | null
  headcount: number | null
  location: string | null
  work_model: string | null
  budget_min: string | null
  budget_max: string | null
  target_start_date: string | null
  team_context: string | null
  key_requirements: string | null
  nice_to_haves: string | null
  target_companies: string | null
  additional_notes: string | null
}

interface RequestInfo {
  id: string
  ticket_number: string | null
  position_title: string
  department: string | null
  hiring_manager_name: string
  status: string
  intake_submitted_at: string | null
  jd_sent_at: string | null
  created_at: string
  prefill?: IntakePrefill
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const inputCls = inputClsWhite
const labelCls = 'block text-sm font-semibold text-slate-700 mb-1.5'

// ─── Location autocomplete ────────────────────────────────────────────────────
function LocationInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const suggestions = CITIES.filter(c => c.toLowerCase().includes(value.toLowerCase()) && value.length > 0).slice(0, 6)
  return (
    <div className="relative">
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="New York, Remote, Hybrid…"
        className={inputCls}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-20 bg-white border border-slate-200 rounded-xl shadow-lg mt-1 overflow-hidden">
          {suggestions.map(c => (
            <button
              key={c}
              type="button"
              onMouseDown={() => { onChange(c); setOpen(false) }}
              className="w-full px-3.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Tag input ────────────────────────────────────────────────────────────────
function TagInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [input, setInput] = useState('')
  const add = () => {
    const v = input.trim().replace(/,$/, '')
    if (v && !tags.includes(v)) onChange([...tags, v])
    setInput('')
  }
  return (
    <div className="flex flex-wrap gap-2 p-2.5 rounded-xl border border-slate-200 bg-white min-h-[44px] focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-emerald-100 transition">
      {tags.map(t => (
        <span key={t} className="flex items-center gap-1 bg-slate-100 text-slate-700 text-xs rounded-full px-2.5 py-1">
          {t}
          <button type="button" onClick={() => onChange(tags.filter(x => x !== t))}>
            <X className="h-3 w-3 text-slate-400 hover:text-slate-600" />
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() } }}
        onBlur={add}
        placeholder={tags.length === 0 ? 'Google, Meta, Stripe… press Enter to add' : 'Add more…'}
        className="flex-1 min-w-[140px] bg-transparent outline-none text-sm text-slate-800 placeholder-slate-400 px-1"
      />
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function IntakePage() {
  const { token } = useParams<{ token: string }>()

  const [requestInfo, setRequestInfo] = useState<RequestInfo | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Position title flows through locked from the requisition (display only).
  const [positionTitle, setPositionTitle] = useState('')

  const [form, setForm] = useState({
    team_context: '',
    level: '',
    employment_type: '',
    headcount: 1,
    work_model: '',
    key_requirements: '',
    nice_to_haves: '',
    budget_min: '',
    budget_max: '',
    target_start_date: '',
    additional_notes: '',
  })
  const [location, setLocation] = useState('')
  const [companies, setCompanies] = useState<string[]>([])

  // Fields that arrived pre-filled from the requisition — used to show the
  // "pre-filled, editable" pencil marker next to their labels.
  const [prefilledFields, setPrefilledFields] = useState<Set<string>>(new Set())

  // JD state
  const [jd, setJd] = useState('')
  const [jdMode, setJdMode] = useState<'ai' | 'manual' | null>(null)
  const [generatingJD, setGeneratingJD] = useState(false)
  const [jdGenError, setJdGenError] = useState<string | null>(null)

  // Live Tiptap editor instances, keyed by field. The rich editor doesn't react
  // to `value` changes after mount, so programmatic inserts (file import) go
  // through the instance instead of form state.
  const editorsRef = useRef<Record<string, Editor | null>>({})

  // File import
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importingField, setImportingField] = useState<string | null>(null)
  const pendingField = useRef<string | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [statusUrl, setStatusUrl] = useState<string | null>(null)

  // Seed the form with whatever the recruiter/requisition already provided, and
  // remember which fields were pre-filled so we can flag them as editable.
  const applyPrefill = (pf?: IntakePrefill) => {
    if (!pf) return
    const filled = new Set<string>()
    const mark = (key: string, v: unknown) => {
      if (v !== null && v !== undefined && v !== '') filled.add(key)
    }
    setForm(f => ({
      ...f,
      level:             pf.level ?? f.level,
      employment_type:   pf.employment_type ?? f.employment_type,
      headcount:         pf.headcount ?? f.headcount,
      work_model:        pf.work_model ?? f.work_model,
      team_context:      pf.team_context ? textToHtml(pf.team_context) : f.team_context,
      key_requirements:  pf.key_requirements ? textToHtml(pf.key_requirements) : f.key_requirements,
      nice_to_haves:     pf.nice_to_haves ? textToHtml(pf.nice_to_haves) : f.nice_to_haves,
      budget_min:        pf.budget_min ?? f.budget_min,
      budget_max:        pf.budget_max ?? f.budget_max,
      target_start_date: pf.target_start_date ?? f.target_start_date,
      additional_notes:  pf.additional_notes ? textToHtml(pf.additional_notes) : f.additional_notes,
    }))
    if (pf.location) setLocation(pf.location)
    if (pf.target_companies) {
      setCompanies(pf.target_companies.split(',').map(s => s.trim()).filter(Boolean))
    }
    mark('level', pf.level); mark('employment_type', pf.employment_type)
    mark('headcount', pf.headcount); mark('location', pf.location)
    mark('work_model', pf.work_model); mark('budget_min', pf.budget_min)
    mark('budget_max', pf.budget_max); mark('target_start_date', pf.target_start_date)
    mark('team_context', pf.team_context); mark('key_requirements', pf.key_requirements)
    mark('nice_to_haves', pf.nice_to_haves); mark('target_companies', pf.target_companies)
    mark('additional_notes', pf.additional_notes)
    setPrefilledFields(filled)
  }

  useEffect(() => {
    fetch(`/api/intake/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setLoadError(d.error)
        else {
          setRequestInfo(d.data); setPositionTitle(d.data.position_title)
          applyPrefill(d.data.prefill as IntakePrefill | undefined)
          trackEvent('intake_page_viewed', { position_title: d.data.position_title })
        }
        setLoading(false)
      })
      .catch(() => { setLoadError('Failed to load form.'); setLoading(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const set = (key: keyof typeof form, value: string | number | boolean) =>
    setForm(f => ({ ...f, [key]: value }))

  // ── File import ──
  const openFileImport = (field: string) => {
    pendingField.current = field
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const field = pendingField.current
    if (!file || !field) return
    setImportingField(field)

    const fd = new FormData(); fd.append('file', file)
    const res = await fetch('/api/parse-document', { method: 'POST', body: fd })
    const data = await res.json()
    setImportingField(null)

    if (res.ok) {
      // The rich editors don't re-read `value` after mount, so append the
      // extracted text through the live editor instance (which fires onChange
      // and keeps form state in sync).
      const ed = editorsRef.current[field]
      const html = textToHtml(data.text)
      if (ed) ed.chain().focus('end').insertContent(html).run()
    }
    if (e.target) e.target.value = ''
  }

  const ImportBtn = ({ field }: { field: string }) => (
    <button
      type="button"
      onClick={() => openFileImport(field)}
      disabled={importingField === field}
      className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-600 transition-colors mt-1.5"
    >
      {importingField === field
        ? <Loader2 className="h-3 w-3 animate-spin" />
        : <Paperclip className="h-3 w-3" />}
      {importingField === field ? 'Extracting…' : 'Import from PDF / TXT'}
    </button>
  )

  // ── JD Generation ──
  const handleGenerateJD = async () => {
    if (isHtmlEmpty(form.team_context) || isHtmlEmpty(form.key_requirements)) {
      setJdGenError('Please fill in Team Context and Key Requirements above before generating.')
      return
    }
    trackEvent('jd_generation_started', { source: 'intake' })
    setJdMode('ai'); setGeneratingJD(true); setJdGenError(null)
    const res = await fetch(`/api/intake/${token}/generate-jd`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        // The rich fields hold HTML; the AI prompt wants plain text.
        team_context: stripHtml(form.team_context),
        key_requirements: stripHtml(form.key_requirements),
        nice_to_haves: stripHtml(form.nice_to_haves),
        additional_notes: stripHtml(form.additional_notes),
        location,
        headcount: Number(form.headcount),
        budget_min: form.budget_min ? Number(form.budget_min) : undefined,
        budget_max: form.budget_max ? Number(form.budget_max) : undefined,
      }),
    })
    const data = await res.json()
    // Seed the JD editor with the generated text before we drop the loading
    // state — the editor remounts on !generatingJD and reads `jd` as its content.
    if (res.ok) setJd(textToHtml(data.jd))
    setGeneratingJD(false)
    if (!res.ok) setJdGenError(data.error ?? 'Failed to generate JD.')
    else {
      trackEvent('jd_generated', { source: 'intake', word_count: stripHtml(data.jd).trim().split(/\s+/).length })
    }
  }

  // ── Submit ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.level)            { setSubmitError('Please choose a Level / Seniority.'); return }
    if (!form.employment_type)  { setSubmitError('Please choose an Employment Type.'); return }
    if (!form.work_model)       { setSubmitError('Please choose a Work model (Remote / Hybrid / On-site).'); return }
    if (!location.trim())       { setSubmitError('Please add a Location.'); return }
    if (isHtmlEmpty(form.team_context) || isHtmlEmpty(form.key_requirements)) {
      setSubmitError('Please fill in the team context and key requirements.')
      return
    }
    if (isHtmlEmpty(jd)) {
      setSubmitError('Please add a Job Description before submitting.')
      return
    }
    setSubmitting(true); setSubmitError(null)

    const res = await fetch(`/api/intake/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        position_title: positionTitle,
        ...form,
        location,
        headcount: Number(form.headcount),
        budget_min: form.budget_min ? Number(form.budget_min) : undefined,
        budget_max: form.budget_max ? Number(form.budget_max) : undefined,
        target_companies: companies.join(', ') || undefined,
        final_jd: jd,
      }),
    })
    const json = await res.json()
    setSubmitting(false)
    if (!res.ok) { setSubmitError(json.error ?? 'Something went wrong. Please try again.'); return }
    setStatusUrl(json.status_url ?? null)
    setSubmitted(true)
    trackEvent('intake_submitted', { position_title: positionTitle, has_jd: !isHtmlEmpty(jd) })
  }

  const jdText = stripHtml(jd)
  const wordCount = jdText ? jdText.split(/\s+/).length : 0

  // Small "pre-filled, editable" marker shown next to fields we seeded from the
  // requisition. It's a hint, not a control — the field itself stays editable.
  const Prefilled = ({ field }: { field: string }) =>
    prefilledFields.has(field) ? (
      <span
        title="Pre-filled from the requisition — edit if needed"
        className="inline-flex items-center gap-0.5 ml-1.5 align-middle text-[11px] font-medium text-emerald-600"
      >
        <Pencil className="h-3 w-3" />
      </span>
    ) : null

  // ────────────────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <Loader2 className="h-7 w-7 animate-spin text-slate-300" />
    </div>
  )

  if (loadError) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-lg font-bold text-slate-800">Link not valid</h2>
        <p className="text-sm text-slate-500 mt-2">{loadError}</p>
      </div>
    </div>
  )

  // Intake is "pending" (form should show) while the role hasn't been submitted.
  // Legacy hiring_requests use status 'intake_pending'; canonical intake jobs
  // (Phase 3 / C5.5) use 'draft' until submit/approve flips them to 'open'.
  const intakePending =
    requestInfo?.status === 'intake_pending' || requestInfo?.status === 'draft'

  if (!intakePending) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <CheckCircle className="h-12 w-12 text-emerald-400 mx-auto mb-4" />
        <h2 className="text-lg font-bold text-slate-800">Already submitted</h2>
        <p className="text-sm text-slate-500 mt-2">
          The intake for <strong>{requestInfo?.position_title}</strong> has already been completed.
          Your recruiter has been notified.
        </p>
        <a
          href={`/intake/${token}/status`}
          className="inline-block mt-4 text-sm text-emerald-600 hover:underline"
        >
          Track request status →
        </a>
      </div>
    </div>
  )

  if (submitted) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-10 text-center max-w-md w-full space-y-4">
        <div className="flex items-center justify-center gap-2">
          <Sparkles className="h-6 w-6 text-violet-500" />
          <span className="text-sm font-semibold text-violet-600 uppercase tracking-wide">RecruiterStack</span>
        </div>
        <CheckCircle className="h-14 w-14 text-emerald-500 mx-auto" />
        <div>
          {requestInfo?.ticket_number && (
            <p className="text-xs font-mono font-semibold text-slate-400 mb-1">{requestInfo.ticket_number}</p>
          )}
          <h2 className="text-2xl font-bold text-slate-900">Ticket submitted!</h2>
          <p className="text-slate-500 mt-2 text-sm leading-relaxed">
            Your requirements and JD for <strong>{positionTitle}</strong> have been submitted.
            Your recruiter has been notified and will take it from here.
          </p>
        </div>
        {statusUrl && (
          <a
            href={statusUrl}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
          >
            Track your request →
          </a>
        )}
        <p className="text-xs text-slate-400">You can close this window or track your request above.</p>
      </div>
    </div>
  )

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      {/* Hidden file input — shared by all import buttons */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.md"
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Sparkles className="h-5 w-5 text-violet-500" />
            <span className="text-sm font-semibold text-violet-600 uppercase tracking-wide">RecruiterStack</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">
            Hi {requestInfo?.hiring_manager_name?.split(' ')[0]}! 👋
          </h1>
          {/* Position title is set once on the requisition and flows through
              locked, so the approved requisition stays the single source of truth. */}
          <div className="flex items-center justify-center gap-2 mt-1">
            <span className="text-base font-semibold text-slate-700">{positionTitle}</span>
          </div>
          <p className="text-slate-500 text-sm max-w-md mx-auto">
            Fill in the details below
            {requestInfo?.department ? ` for ${requestInfo.department}` : ''}, then generate or write the Job Description.
            Once you&apos;re happy, submit the ticket.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {submitError && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {submitError}
            </div>
          )}

          {/* Role Details */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Role Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Level / Seniority <span className="text-red-500">*</span><Prefilled field="level" /></label>
                <select value={form.level} onChange={e => set('level', e.target.value)} className={inputCls}>
                  <option value="">Select level…</option>
                  {LEVEL_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Employment Type <span className="text-red-500">*</span><Prefilled field="employment_type" /></label>
                <select value={form.employment_type} onChange={e => set('employment_type', e.target.value)} className={inputCls}>
                  <option value="">Select type…</option>
                  {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Number of Openings<Prefilled field="headcount" /></label>
                <input type="number" min={1} max={50} value={form.headcount} onChange={e => set('headcount', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Location <span className="text-red-500">*</span><Prefilled field="location" /></label>
                <LocationInput value={location} onChange={setLocation} />
              </div>
              <div>
                <label className={labelCls}>Work model <span className="text-red-500">*</span><Prefilled field="work_model" /></label>
                <select value={form.work_model} onChange={e => set('work_model', e.target.value)} className={inputCls}>
                  <option value="">Select…</option>
                  {WORK_MODELS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Team & Requirements */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Team & Role Context</h2>
            <div>
              <label className={labelCls}>What does this person do on your team? <span className="text-red-500">*</span><Prefilled field="team_context" /></label>
              <RichTextEditor
                value={form.team_context}
                onChange={v => set('team_context', v)}
                onEditorReady={ed => { editorsRef.current.team_context = ed }}
                placeholder="They'll own the checkout flow, work closely with design, lead 2 junior engineers…"
                minHeight={120}
              />
              <ImportBtn field="team_context" />
            </div>
            <div>
              <label className={labelCls}>Key Requirements <span className="text-red-500">*</span><Prefilled field="key_requirements" /></label>
              <RichTextEditor
                value={form.key_requirements}
                onChange={v => set('key_requirements', v)}
                onEditorReady={ed => { editorsRef.current.key_requirements = ed }}
                placeholder="5+ years React, Node.js, shipped production apps, strong communicator…"
                minHeight={120}
              />
              <ImportBtn field="key_requirements" />
            </div>
            <div>
              <label className={labelCls}>Nice to Have<Prefilled field="nice_to_haves" /></label>
              <RichTextEditor
                value={form.nice_to_haves}
                onChange={v => set('nice_to_haves', v)}
                onEditorReady={ed => { editorsRef.current.nice_to_haves = ed }}
                placeholder="Next.js, fintech background, startup experience…"
                minHeight={96}
              />
              <ImportBtn field="nice_to_haves" />
            </div>
          </div>

          {/* Target Companies */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-3">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Target Companies<Prefilled field="target_companies" /></h2>
            <p className="text-xs text-slate-400">Companies you&apos;d specifically like to hire from (optional)</p>
            <TagInput tags={companies} onChange={setCompanies} />
          </div>

          {/* Compensation */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Compensation & Timeline</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Salary Min ($)<Prefilled field="budget_min" /></label>
                <input type="number" min={0} value={form.budget_min} onChange={e => set('budget_min', e.target.value)} placeholder="120000" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Salary Max ($)<Prefilled field="budget_max" /></label>
                <input type="number" min={0} value={form.budget_max} onChange={e => set('budget_max', e.target.value)} placeholder="160000" className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Target Start Date<Prefilled field="target_start_date" /></label>
                <input value={form.target_start_date} onChange={e => set('target_start_date', e.target.value)} placeholder="ASAP, Q2 2025, June…" className={inputCls} />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <label className={labelCls}>Anything else we should know?<Prefilled field="additional_notes" /></label>
            <RichTextEditor
              value={form.additional_notes}
              onChange={v => set('additional_notes', v)}
              onEditorReady={ed => { editorsRef.current.additional_notes = ed }}
              placeholder="Unique perks, team culture, must-haves not covered above…"
              minHeight={96}
            />
            <ImportBtn field="additional_notes" />
          </div>

          {/* JD Section */}
          <div className="bg-white rounded-2xl border-2 border-violet-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                  Job Description <span className="text-red-500">*</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">Generate with AI from your input above, or write it yourself.</p>
              </div>
              {!isHtmlEmpty(jd) && <span className="text-xs text-slate-400">{wordCount} words</span>}
            </div>

            {jdGenError && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">{jdGenError}</div>
            )}

            {jdMode === null ? (
              <div className="flex flex-col sm:flex-row gap-3">
                <button type="button" onClick={handleGenerateJD} className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-700 transition-colors shadow-sm">
                  <Wand2 className="h-4 w-4" />Generate JD with AI
                </button>
                <button type="button" onClick={() => setJdMode('manual')} className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors">
                  <PenLine className="h-4 w-4" />Write Manually
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button type="button" onClick={handleGenerateJD} disabled={generatingJD} className="flex items-center gap-1.5 rounded-lg bg-violet-50 border border-violet-200 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50 transition-colors">
                  {generatingJD ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  {generatingJD ? 'Generating…' : jd ? 'Regenerate with AI' : 'Generate with AI'}
                </button>
                {jdMode === 'ai' && (
                  <button type="button" onClick={() => setJdMode('manual')} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                    <PenLine className="h-3.5 w-3.5" />Write Manually
                  </button>
                )}
              </div>
            )}

            {jdMode !== null && (
              generatingJD ? (
                <div className="flex items-center justify-center gap-3 rounded-xl border border-violet-100 bg-violet-50 py-12 text-sm text-violet-600">
                  <Loader2 className="h-5 w-5 animate-spin" />Gemini is writing the JD…
                </div>
              ) : (
                <div>
                  <RichTextEditor
                    value={jd}
                    onChange={setJd}
                    onEditorReady={ed => { editorsRef.current.jd = ed }}
                    placeholder={jdMode === 'manual' ? 'Write your JD here, or import from a file below…' : 'The AI-generated JD will appear here. You can edit it freely.'}
                    minHeight={360}
                  />
                  <ImportBtn field="jd" />
                  {!isHtmlEmpty(jd) && (
                    <p className="text-xs text-slate-400 mt-2">
                      You can edit the text above — this is the final version the recruiter will receive.
                    </p>
                  )}
                </div>
              )
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || isHtmlEmpty(jd)}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {submitting
              ? <><Loader2 className="h-4 w-4 animate-spin" />Submitting ticket…</>
              : <><CheckCircle className="h-4 w-4" />Submit Ticket</>
            }
          </button>

          {isHtmlEmpty(jd) && jdMode !== null && !generatingJD && (
            <p className="text-xs text-slate-400 text-center -mt-2">Add a Job Description above to enable submission.</p>
          )}

          <p className="text-xs text-slate-400 text-center pb-4">
            Once submitted, the recruiter will be notified and take it from here.
          </p>
        </form>
      </div>
    </div>
  )
}
