'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import {
  Loader2, CheckCircle, AlertCircle, Sparkles, Wand2, PenLine,
  RefreshCw, Pencil, Paperclip, X,
} from 'lucide-react'
import { inputClsWhite } from '@/lib/ui/styles'

// ─── Constants ────────────────────────────────────────────────────────────────

const LEVEL_OPTIONS = ['Intern', 'Junior', 'Mid-level', 'Senior', 'Lead', 'Staff', 'Principal', 'Director', 'VP']

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
    <div className="flex flex-wrap gap-2 p-2.5 rounded-xl border border-slate-200 bg-white min-h-[44px] focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition">
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

  // Editable position title
  const [positionTitle, setPositionTitle] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)

  const [form, setForm] = useState({
    team_context: '',
    level: '',
    headcount: 1,
    remote_ok: false,
    key_requirements: '',
    nice_to_haves: '',
    budget_min: '',
    budget_max: '',
    target_start_date: '',
    additional_notes: '',
  })
  const [location, setLocation] = useState('')
  const [companies, setCompanies] = useState<string[]>([])

  // JD state
  const [jd, setJd] = useState('')
  const [jdMode, setJdMode] = useState<'ai' | 'manual' | null>(null)
  const [generatingJD, setGeneratingJD] = useState(false)
  const [jdGenError, setJdGenError] = useState<string | null>(null)

  // File import
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importingField, setImportingField] = useState<string | null>(null)
  const pendingField = useRef<string | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [statusUrl, setStatusUrl] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/intake/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setLoadError(d.error)
        else { setRequestInfo(d.data); setPositionTitle(d.data.position_title) }
        setLoading(false)
      })
      .catch(() => { setLoadError('Failed to load form.'); setLoading(false) })
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
      const append = (prev: string) => prev ? prev + '\n\n' + data.text : data.text
      if (field === 'jd') setJd(append)
      else if (field === 'team_context') set('team_context', append(form.team_context))
      else if (field === 'key_requirements') set('key_requirements', append(form.key_requirements))
      else if (field === 'nice_to_haves') set('nice_to_haves', append(form.nice_to_haves))
      else if (field === 'additional_notes') set('additional_notes', append(form.additional_notes))
    }
    if (e.target) e.target.value = ''
  }

  const ImportBtn = ({ field }: { field: string }) => (
    <button
      type="button"
      onClick={() => openFileImport(field)}
      disabled={importingField === field}
      className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-blue-600 transition-colors mt-1.5"
    >
      {importingField === field
        ? <Loader2 className="h-3 w-3 animate-spin" />
        : <Paperclip className="h-3 w-3" />}
      {importingField === field ? 'Extracting…' : 'Import from PDF / TXT'}
    </button>
  )

  // ── JD Generation ──
  const handleGenerateJD = async () => {
    if (!form.team_context.trim() || !form.key_requirements.trim()) {
      setJdGenError('Please fill in Team Context and Key Requirements above before generating.')
      return
    }
    setJdMode('ai'); setGeneratingJD(true); setJdGenError(null)
    const res = await fetch(`/api/intake/${token}/generate-jd`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        location,
        headcount: Number(form.headcount),
        budget_min: form.budget_min ? Number(form.budget_min) : undefined,
        budget_max: form.budget_max ? Number(form.budget_max) : undefined,
      }),
    })
    const data = await res.json()
    setGeneratingJD(false)
    if (!res.ok) setJdGenError(data.error ?? 'Failed to generate JD.')
    else setJd(data.jd)
  }

  // ── Submit ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.team_context.trim() || !form.key_requirements.trim()) {
      setSubmitError('Please fill in the team context and key requirements.')
      return
    }
    if (!jd.trim()) {
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
  }

  const wordCount = jd.trim() ? jd.trim().split(/\s+/).length : 0

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

  if (requestInfo?.status !== 'intake_pending') return (
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
          className="inline-block mt-4 text-sm text-blue-600 hover:underline"
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
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
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
          {/* Editable position title */}
          <div className="flex items-center justify-center gap-2 mt-1">
            {editingTitle ? (
              <input
                autoFocus
                value={positionTitle}
                onChange={e => setPositionTitle(e.target.value)}
                onBlur={() => setEditingTitle(false)}
                onKeyDown={e => e.key === 'Enter' && setEditingTitle(false)}
                className="text-center text-base font-semibold text-slate-800 bg-white border-b-2 border-blue-400 outline-none px-2 py-0.5 rounded"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingTitle(true)}
                className="flex items-center gap-1.5 text-base font-semibold text-slate-700 hover:text-blue-600 transition-colors group"
              >
                {positionTitle}
                <Pencil className="h-3.5 w-3.5 opacity-40 group-hover:opacity-100 transition-opacity" />
              </button>
            )}
          </div>
          <p className="text-slate-500 text-xs mt-1">
            Click the title above to edit it if needed.
          </p>
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
                <label className={labelCls}>Level / Seniority</label>
                <select value={form.level} onChange={e => set('level', e.target.value)} className={inputCls}>
                  <option value="">Select level…</option>
                  {LEVEL_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Number of Openings</label>
                <input type="number" min={1} max={50} value={form.headcount} onChange={e => set('headcount', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Location</label>
                <LocationInput value={location} onChange={setLocation} />
              </div>
              <div className="flex flex-col justify-end">
                <label className="flex items-center gap-2.5 cursor-pointer py-2.5">
                  <input type="checkbox" checked={form.remote_ok} onChange={e => set('remote_ok', e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
                  <span className="text-sm font-semibold text-slate-700">Remote OK</span>
                </label>
              </div>
            </div>
          </div>

          {/* Team & Requirements */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Team & Role Context</h2>
            <div>
              <label className={labelCls}>What does this person do on your team? <span className="text-red-500">*</span></label>
              <textarea required rows={4} value={form.team_context} onChange={e => set('team_context', e.target.value)} placeholder="They'll own the checkout flow, work closely with design, lead 2 junior engineers…" className={inputCls + ' resize-none'} />
              <ImportBtn field="team_context" />
            </div>
            <div>
              <label className={labelCls}>Key Requirements <span className="text-red-500">*</span></label>
              <textarea required rows={4} value={form.key_requirements} onChange={e => set('key_requirements', e.target.value)} placeholder="5+ years React, Node.js, shipped production apps, strong communicator…" className={inputCls + ' resize-none'} />
              <ImportBtn field="key_requirements" />
            </div>
            <div>
              <label className={labelCls}>Nice to Have</label>
              <textarea rows={3} value={form.nice_to_haves} onChange={e => set('nice_to_haves', e.target.value)} placeholder="Next.js, fintech background, startup experience…" className={inputCls + ' resize-none'} />
              <ImportBtn field="nice_to_haves" />
            </div>
          </div>

          {/* Target Companies */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-3">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Target Companies</h2>
            <p className="text-xs text-slate-400">Companies you&apos;d specifically like to hire from (optional)</p>
            <TagInput tags={companies} onChange={setCompanies} />
          </div>

          {/* Compensation */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Compensation & Timeline</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Salary Min ($)</label>
                <input type="number" min={0} value={form.budget_min} onChange={e => set('budget_min', e.target.value)} placeholder="120000" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Salary Max ($)</label>
                <input type="number" min={0} value={form.budget_max} onChange={e => set('budget_max', e.target.value)} placeholder="160000" className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Target Start Date</label>
                <input value={form.target_start_date} onChange={e => set('target_start_date', e.target.value)} placeholder="ASAP, Q2 2025, June…" className={inputCls} />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <label className={labelCls}>Anything else we should know?</label>
            <textarea rows={3} value={form.additional_notes} onChange={e => set('additional_notes', e.target.value)} placeholder="Unique perks, team culture, must-haves not covered above…" className={inputCls + ' resize-none'} />
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
              {jd && <span className="text-xs text-slate-400">{wordCount} words</span>}
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
                  <Loader2 className="h-5 w-5 animate-spin" />Claude is writing the JD…
                </div>
              ) : (
                <div>
                  <textarea
                    rows={20}
                    value={jd}
                    onChange={e => setJd(e.target.value)}
                    placeholder={jdMode === 'manual' ? 'Write your JD here, or import from a file below…' : 'The AI-generated JD will appear here. You can edit it freely.'}
                    className={inputCls + ' resize-y font-mono text-xs leading-relaxed'}
                  />
                  <ImportBtn field="jd" />
                  {jd && (
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
            disabled={submitting || !jd.trim()}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {submitting
              ? <><Loader2 className="h-4 w-4 animate-spin" />Submitting ticket…</>
              : <><CheckCircle className="h-4 w-4" />Submit Ticket</>
            }
          </button>

          {!jd.trim() && jdMode !== null && !generatingJD && (
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
