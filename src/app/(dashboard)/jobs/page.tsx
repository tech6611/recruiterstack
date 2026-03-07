'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Briefcase, Plus, Search, Clock, ChevronRight, X,
  ArrowLeft, Send, CheckCircle, Copy, Check, Users, PenLine,
  Wand2, RefreshCw, Loader2, Sparkles, Paperclip,
} from 'lucide-react'
import type { JobListItem, HiringRequestStatus, StageColor } from '@/lib/types/database'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const JOB_TITLES = [
  'Product Manager', 'Senior Product Manager', 'Principal Product Manager', 'Director of Product',
  'Software Engineer', 'Senior Software Engineer', 'Staff Software Engineer', 'Principal Engineer',
  'Frontend Engineer', 'Backend Engineer', 'Full Stack Engineer', 'iOS Engineer', 'Android Engineer',
  'Engineering Manager', 'Director of Engineering', 'VP of Engineering', 'CTO',
  'Data Scientist', 'Senior Data Scientist', 'ML Engineer', 'Data Engineer', 'Analytics Engineer',
  'UX Designer', 'Senior UX Designer', 'Product Designer', 'UI Designer', 'Design Lead',
  'DevOps Engineer', 'Site Reliability Engineer', 'Platform Engineer', 'Security Engineer',
  'Sales Manager', 'Account Executive', 'Senior Account Executive', 'Business Development Manager',
  'Marketing Manager', 'Growth Manager', 'Content Manager', 'Brand Manager',
  'HR Manager', 'Talent Acquisition Specialist', 'Recruiter', 'People Operations Manager',
  'Finance Manager', 'Financial Analyst', 'Senior Financial Analyst', 'CFO',
  'Operations Manager', 'Chief of Staff', 'Strategy Manager', 'Program Manager',
]

const DEPARTMENTS = [
  'Engineering', 'Product', 'Design', 'Data Science', 'Machine Learning', 'AI',
  'Sales', 'Marketing', 'Growth', 'Customer Success', 'Customer Support',
  'HR', 'People Operations', 'Talent Acquisition', 'Finance', 'Legal', 'Compliance',
  'Operations', 'Strategy', 'Business Development', 'Partnerships', 'Revenue',
  'Security', 'Infrastructure', 'Platform', 'Mobile', 'Frontend', 'Backend',
]

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

type NewJobMode = 'send_to_hm' | 'fill_myself' | null

const inputCls = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition'
const labelCls = 'block text-xs font-semibold text-slate-500 mb-1.5'

// ─────────────────────────────────────────────────────────────────────────────
// Shared sub-components (form helpers)
// ─────────────────────────────────────────────────────────────────────────────

function AutocompleteInput({ value, onChange, options, placeholder, className }: {
  value: string; onChange: (v: string) => void; options: string[]
  placeholder?: string; className?: string
}) {
  const [open, setOpen] = useState(false)
  const suggestions = options.filter(o => o.toLowerCase().includes(value.toLowerCase()) && value.length > 0).slice(0, 7)
  return (
    <div className="relative">
      <input
        value={value} onChange={e => onChange(e.target.value)}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder} className={className ?? inputCls}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-20 bg-white border border-slate-200 rounded-xl shadow-lg mt-1 overflow-hidden">
          {suggestions.map(s => (
            <button key={s} type="button" onMouseDown={() => { onChange(s); setOpen(false) }}
              className="w-full px-3.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 transition-colors">
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function TagInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [input, setInput] = useState('')
  const add = () => {
    const v = input.trim().replace(/,$/, '')
    if (v && !tags.includes(v)) onChange([...tags, v])
    setInput('')
  }
  return (
    <div className="flex flex-wrap gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50 min-h-[44px] focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition">
      {tags.map(t => (
        <span key={t} className="flex items-center gap-1 bg-white border border-slate-200 text-slate-700 text-xs rounded-full px-2.5 py-1 shadow-sm">
          {t}
          <button type="button" onClick={() => onChange(tags.filter(x => x !== t))}>
            <X className="h-3 w-3 text-slate-400 hover:text-slate-600" />
          </button>
        </span>
      ))}
      <input
        value={input} onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() } }}
        onBlur={add}
        placeholder={tags.length === 0 ? 'Google, Meta, Stripe… press Enter to add' : 'Add more…'}
        className="flex-1 min-w-[140px] bg-transparent outline-none text-sm text-slate-700 placeholder-slate-400 px-1"
      />
    </div>
  )
}

function FileImportButton({ onExtract, field }: { onExtract: (text: string) => void; field: string }) {
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    const fd = new FormData(); fd.append('file', file)
    const res = await fetch('/api/parse-document', { method: 'POST', body: fd })
    const data = await res.json()
    setLoading(false)
    if (res.ok) onExtract(data.text)
    if (ref.current) ref.current.value = ''
  }
  return (
    <>
      <input ref={ref} type="file" accept=".pdf,.txt,.md" onChange={handle} className="hidden" id={`fi-${field}`} />
      <button type="button" onClick={() => ref.current?.click()} disabled={loading}
        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-blue-600 transition-colors mt-1.5">
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
        {loading ? 'Extracting…' : 'Import from PDF / TXT'}
      </button>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// New Job Drawer
// ─────────────────────────────────────────────────────────────────────────────

function NewJobDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [mode, setMode] = useState<NewJobMode>(null)

  // Shared fields
  const [positionTitle, setPositionTitle] = useState('')
  const [department, setDepartment] = useState('')
  const [hmName, setHmName] = useState('')
  const [hmEmail, setHmEmail] = useState('')
  const [hmSlack, setHmSlack] = useState('')

  // Option B fields
  const [level, setLevel] = useState('')
  const [headcount, setHeadcount] = useState(1)
  const [location, setLocation] = useState('')
  const [remoteOk, setRemoteOk] = useState(false)
  const [teamContext, setTeamContext] = useState('')
  const [keyReqs, setKeyReqs] = useState('')
  const [niceToHave, setNiceToHave] = useState('')
  const [targetCompanies, setTargetCompanies] = useState<string[]>([])
  const [budgetMin, setBudgetMin] = useState('')
  const [budgetMax, setBudgetMax] = useState('')
  const [startDate, setStartDate] = useState('')
  const [notes, setNotes] = useState('')
  const [jd, setJd] = useState('')
  const [jdMode, setJdMode] = useState<'ai' | 'manual' | null>(null)
  const [generatingJD, setGeneratingJD] = useState(false)
  const [jdGenError, setJdGenError] = useState<string | null>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ ticketNumber: string; intakeUrl?: string; positionTitle: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const append = (setter: React.Dispatch<React.SetStateAction<string>>) => (text: string) =>
    setter(prev => prev ? prev + '\n\n' + text : text)

  const handleGenerateJD = async () => {
    if (!teamContext.trim() || !keyReqs.trim()) {
      setJdGenError('Please fill in Team Context and Key Requirements before generating.')
      return
    }
    setJdMode('ai'); setGeneratingJD(true); setJdGenError(null)
    const res = await fetch('/api/intake/preview-jd', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        position_title: positionTitle, department, level, location,
        remote_ok: remoteOk, headcount,
        team_context: teamContext, key_requirements: keyReqs,
        nice_to_haves: niceToHave,
        budget_min: budgetMin ? Number(budgetMin) : undefined,
        budget_max: budgetMax ? Number(budgetMax) : undefined,
        target_start_date: startDate, additional_notes: notes,
      }),
    })
    const data = await res.json()
    setGeneratingJD(false)
    if (!res.ok) setJdGenError(data.error ?? 'Failed to generate JD.')
    else setJd(data.jd)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError(null)

    const body: Record<string, unknown> = {
      position_title: positionTitle,
      department: department || undefined,
      hiring_manager_name: hmName,
    }

    if (mode === 'send_to_hm') {
      body.hiring_manager_email = hmEmail
      body.hiring_manager_slack = hmSlack || undefined
    } else {
      body.filled_by_recruiter = true
      body.hiring_manager_email = hmEmail || undefined
      body.hiring_manager_slack = hmSlack || undefined
      body.team_context = teamContext
      body.level = level || undefined
      body.headcount = headcount
      body.location = location || undefined
      body.remote_ok = remoteOk
      body.key_requirements = keyReqs
      body.nice_to_haves = niceToHave || undefined
      body.target_companies = targetCompanies.join(', ') || undefined
      body.budget_min = budgetMin ? Number(budgetMin) : undefined
      body.budget_max = budgetMax ? Number(budgetMax) : undefined
      body.target_start_date = startDate || undefined
      body.additional_notes = notes || undefined
      body.generated_jd = jd
    }

    const res = await fetch('/api/hiring-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    setLoading(false)
    if (!res.ok) { setError(json.error ?? 'Something went wrong'); return }

    setSuccess({ ticketNumber: json.data?.ticket_number ?? '', intakeUrl: json.intake_url, positionTitle })
    onCreated() // refresh jobs list immediately
  }

  const copyIntakeUrl = () => {
    if (!success?.intakeUrl) return
    navigator.clipboard.writeText(success.intakeUrl)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  // ── Drawer inner content ────────────────────────────────────────────────────

  const innerContent = () => {
    // Success screen
    if (success) {
      return (
        <div className="p-6">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center space-y-4">
            <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto" />
            <div>
              <p className="text-xs font-mono text-emerald-600 font-semibold mb-1">{success.ticketNumber}</p>
              <h2 className="text-xl font-bold text-emerald-900">
                {mode === 'send_to_hm' ? 'Intake sent!' : 'Job created!'}
              </h2>
              <p className="text-sm text-emerald-700 mt-2">
                {mode === 'send_to_hm'
                  ? `An email and Slack message have been sent to ${hmName} with the intake form link.`
                  : `The hiring request for ${success.positionTitle} has been created with the JD ready.`}
              </p>
            </div>
            {success.intakeUrl && (
              <div className="rounded-xl border border-emerald-200 bg-white p-3 text-left">
                <p className="text-xs font-semibold text-slate-500 mb-1.5">Intake form link</p>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-slate-600 truncate flex-1 font-mono">{success.intakeUrl}</p>
                  <button onClick={copyIntakeUrl} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 shrink-0">
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setSuccess(null); setMode(null) }}
                className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                New Job
              </button>
              <button
                onClick={onClose}
                className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )
    }

    // Mode selector
    if (mode === null) {
      return (
        <div className="p-6 space-y-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">New Hiring Request</h2>
            <p className="text-sm text-slate-500 mt-1">How would you like to create this request?</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => setMode('send_to_hm')}
              className="group text-left rounded-2xl border-2 border-slate-200 bg-white p-6 hover:border-blue-400 hover:shadow-sm transition-all"
            >
              <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors">
                <Send className="h-5 w-5 text-blue-600" />
              </div>
              <h3 className="font-bold text-slate-900 text-sm mb-1">Send to Hiring Manager</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                You have the position title and HM details. They fill in requirements and write the JD on their form.
              </p>
              <p className="text-xs text-blue-600 font-medium mt-3">→ Sends intake link to HM</p>
            </button>
            <button
              onClick={() => setMode('fill_myself')}
              className="group text-left rounded-2xl border-2 border-slate-200 bg-white p-6 hover:border-violet-400 hover:shadow-sm transition-all"
            >
              <div className="h-10 w-10 rounded-xl bg-violet-50 flex items-center justify-center mb-4 group-hover:bg-violet-100 transition-colors">
                <Users className="h-5 w-5 text-violet-600" />
              </div>
              <h3 className="font-bold text-slate-900 text-sm mb-1">Fill Everything Myself</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                You have all the details ready. Fill requirements and generate or write the JD right now.
              </p>
              <p className="text-xs text-violet-600 font-medium mt-3">→ No HM email sent</p>
            </button>
          </div>
        </div>
      )
    }

    // Form
    return (
      <div className="p-6 space-y-5">
        <div>
          <button onClick={() => setMode(null)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4 transition-colors">
            <ArrowLeft className="h-4 w-4" />Back
          </button>
          <h2 className="text-lg font-bold text-slate-900">
            {mode === 'send_to_hm' ? 'Send Intake to Hiring Manager' : 'Create Full Hiring Request'}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {mode === 'send_to_hm'
              ? "Fill in the basics — we&apos;ll email the intake form link to your hiring manager."
              : 'Fill everything yourself — no email will be sent.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          {/* Position */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Position</p>
            <div>
              <label className={labelCls}>Job Title <span className="text-red-500">*</span></label>
              <AutocompleteInput value={positionTitle} onChange={setPositionTitle} options={JOB_TITLES} placeholder="Senior Product Manager" />
            </div>
            <div>
              <label className={labelCls}>Department / Team</label>
              <AutocompleteInput value={department} onChange={setDepartment} options={DEPARTMENTS} placeholder="Engineering, Product, Sales…" />
            </div>
          </div>

          {/* Hiring Manager */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Hiring Manager</p>
            <div>
              <label className={labelCls}>Full Name <span className="text-red-500">*</span></label>
              <input required value={hmName} onChange={e => setHmName(e.target.value)} placeholder="Alex Johnson" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>
                Email {mode === 'send_to_hm' && <span className="text-red-500">*</span>}
                {mode === 'fill_myself' && <span className="text-slate-400 font-normal"> (optional)</span>}
              </label>
              <input required={mode === 'send_to_hm'} type="email" value={hmEmail}
                onChange={e => setHmEmail(e.target.value)} placeholder="alex@company.com" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Slack Handle <span className="text-slate-400 font-normal">(optional)</span></label>
              <input value={hmSlack} onChange={e => setHmSlack(e.target.value)} placeholder="@alexj" className={inputCls} />
            </div>
          </div>

          {/* Option B: full form */}
          {mode === 'fill_myself' && (
            <>
              <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Role Details</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Level / Seniority</label>
                    <select value={level} onChange={e => setLevel(e.target.value)} className={inputCls}>
                      <option value="">Select level…</option>
                      {LEVEL_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Openings</label>
                    <input type="number" min={1} max={50} value={headcount}
                      onChange={e => setHeadcount(Number(e.target.value))} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Location</label>
                    <AutocompleteInput value={location} onChange={setLocation} options={CITIES} placeholder="New York, Remote, Hybrid…" />
                  </div>
                  <div className="flex flex-col justify-end">
                    <label className="flex items-center gap-2 cursor-pointer py-2.5">
                      <input type="checkbox" checked={remoteOk} onChange={e => setRemoteOk(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
                      <span className="text-sm font-semibold text-slate-700">Remote OK</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Team & Requirements</p>
                <div>
                  <label className={labelCls}>What does this person do on the team? <span className="text-red-500">*</span></label>
                  <textarea required rows={4} value={teamContext} onChange={e => setTeamContext(e.target.value)}
                    placeholder="They'll own the checkout flow, work with design, lead 2 junior engineers…" className={inputCls + ' resize-none'} />
                  <FileImportButton onExtract={append(setTeamContext)} field="team-context" />
                </div>
                <div>
                  <label className={labelCls}>Key Requirements <span className="text-red-500">*</span></label>
                  <textarea required rows={4} value={keyReqs} onChange={e => setKeyReqs(e.target.value)}
                    placeholder="5+ years React, Node.js, shipped production apps…" className={inputCls + ' resize-none'} />
                  <FileImportButton onExtract={append(setKeyReqs)} field="key-reqs" />
                </div>
                <div>
                  <label className={labelCls}>Nice to Have</label>
                  <textarea rows={3} value={niceToHave} onChange={e => setNiceToHave(e.target.value)}
                    placeholder="Next.js, fintech background, startup experience…" className={inputCls + ' resize-none'} />
                  <FileImportButton onExtract={append(setNiceToHave)} field="nice-to-have" />
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Target Companies</p>
                <p className="text-xs text-slate-400">Companies you&apos;d specifically like to hire from (optional)</p>
                <TagInput tags={targetCompanies} onChange={setTargetCompanies} />
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Compensation & Timeline</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Salary Min ($)</label>
                    <input type="number" min={0} value={budgetMin} onChange={e => setBudgetMin(e.target.value)} placeholder="120000" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Salary Max ($)</label>
                    <input type="number" min={0} value={budgetMax} onChange={e => setBudgetMax(e.target.value)} placeholder="160000" className={inputCls} />
                  </div>
                  <div className="col-span-2">
                    <label className={labelCls}>Target Start Date</label>
                    <input value={startDate} onChange={e => setStartDate(e.target.value)} placeholder="ASAP, Q2 2025, June…" className={inputCls} />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <label className={labelCls}>Anything else to know?</label>
                <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Unique perks, team culture, must-haves…" className={inputCls + ' resize-none'} />
                <FileImportButton onExtract={append(setNotes)} field="notes" />
              </div>

              {/* JD Section */}
              <div className="rounded-xl border-2 border-violet-200 bg-white p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Job Description <span className="text-red-500">*</span>
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">Generate with AI or write manually</p>
                  </div>
                  {jd && <span className="text-xs text-slate-400">{jd.trim().split(/\s+/).length} words</span>}
                </div>

                {jdGenError && (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">{jdGenError}</div>
                )}

                {jdMode === null ? (
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button type="button" onClick={handleGenerateJD}
                      className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-700 transition-colors">
                      <Wand2 className="h-4 w-4" />Generate with AI
                    </button>
                    <button type="button" onClick={() => setJdMode('manual')}
                      className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors">
                      <PenLine className="h-4 w-4" />Write Manually
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button type="button" onClick={handleGenerateJD} disabled={generatingJD}
                      className="flex items-center gap-1.5 rounded-lg bg-violet-50 border border-violet-200 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50 transition-colors">
                      {generatingJD ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      {generatingJD ? 'Generating…' : 'Regenerate with AI'}
                    </button>
                  </div>
                )}

                {jdMode !== null && (
                  generatingJD ? (
                    <div className="flex items-center justify-center gap-3 rounded-xl border border-violet-100 bg-violet-50 py-10 text-sm text-violet-600">
                      <Loader2 className="h-5 w-5 animate-spin" />Claude is writing the JD…
                    </div>
                  ) : (
                    <div>
                      <textarea rows={18} value={jd} onChange={e => setJd(e.target.value)}
                        placeholder="The JD will appear here — you can edit it freely before submitting."
                        className={inputCls + ' resize-y font-mono text-xs leading-relaxed'} />
                      <FileImportButton onExtract={append(setJd)} field="jd" />
                    </div>
                  )
                )}
              </div>
            </>
          )}

          {/* Option A info box */}
          {mode === 'send_to_hm' && (
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-700 space-y-1">
              <p className="font-semibold">What happens next:</p>
              <p>1. {hmName || 'The hiring manager'} gets an email + Slack with their personal intake link</p>
              <p>2. They fill in role details and requirements</p>
              <p>3. They generate a JD with AI (or write their own) directly on the form</p>
              <p>4. They submit — you get notified and pick it up from here</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || (mode === 'fill_myself' && !jd.trim())}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors shadow-sm"
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Creating request…</>
            ) : mode === 'send_to_hm' ? (
              <><Send className="h-4 w-4" />Send Intake Request</>
            ) : (
              <><Sparkles className="h-4 w-4" />Create Hiring Request</>
            )}
          </button>
        </form>
      </div>
    )
  }

  return innerContent()
}

// ─────────────────────────────────────────────────────────────────────────────
// Jobs list helpers
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<HiringRequestStatus, string> = {
  intake_pending:   'Intake Pending',
  intake_submitted: 'Intake Submitted',
  jd_generated:     'JD Generated',
  jd_sent:          'JD Sent',
  jd_approved:      'Active',
  posted:           'Posted',
}

const STATUS_COLORS: Record<HiringRequestStatus, string> = {
  intake_pending:   'bg-slate-100 text-slate-600',
  intake_submitted: 'bg-blue-50 text-blue-700',
  jd_generated:     'bg-violet-50 text-violet-700',
  jd_sent:          'bg-amber-50 text-amber-700',
  jd_approved:      'bg-emerald-50 text-emerald-700',
  posted:           'bg-green-50 text-green-700',
}

const STAGE_DOT: Record<StageColor, string> = {
  slate: 'bg-slate-400', blue: 'bg-blue-500', violet: 'bg-violet-500',
  amber: 'bg-amber-500', emerald: 'bg-emerald-500', green: 'bg-green-500',
  red: 'bg-red-500', pink: 'bg-pink-500',
}

function daysSince(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

function PipelineBar({ stages }: { stages: JobListItem['stage_counts'] }) {
  const total = stages.reduce((s, c) => s + c.count, 0)
  if (total === 0) return <span className="text-xs text-slate-400">No candidates yet</span>
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {stages.filter(s => s.count > 0).map(s => (
        <div key={s.stage_id} className="flex items-center gap-1">
          <span className={`h-2 w-2 rounded-full ${STAGE_DOT[s.color] ?? 'bg-slate-400'}`} />
          <span className="text-xs text-slate-600 font-medium">{s.count}</span>
          <span className="text-xs text-slate-400">{s.stage_name}</span>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function JobsPage() {
  const router = useRouter()
  const [jobs, setJobs] = useState<JobListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [showDrawer, setShowDrawer] = useState(false)

  const fetchJobs = useCallback(() => {
    setLoading(true)
    fetch('/api/jobs')
      .then(r => r.json())
      .then(j => setJobs(j.data ?? []))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchJobs() }, [fetchJobs])

  const filtered = useMemo(() => {
    let list = jobs
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(j =>
        j.position_title.toLowerCase().includes(q) ||
        (j.department ?? '').toLowerCase().includes(q) ||
        (j.location ?? '').toLowerCase().includes(q)
      )
    }
    if (statusFilter !== 'all') list = list.filter(j => j.status === statusFilter)
    return list
  }, [jobs, search, statusFilter])

  const totals = useMemo(() => ({
    all: jobs.length,
    active: jobs.filter(j => j.status === 'jd_approved' || j.status === 'posted').length,
    pending: jobs.filter(j => ['intake_pending', 'intake_submitted', 'jd_generated', 'jd_sent'].includes(j.status)).length,
  }), [jobs])

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="px-8 pt-8 pb-6 border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Jobs</h1>
            <p className="text-sm text-slate-500 mt-0.5">Manage open roles and candidate pipelines</p>
          </div>
          <button
            onClick={() => setShowDrawer(true)}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" />
            New Job
          </button>
        </div>

        {/* Stat pills */}
        <div className="flex gap-3">
          {[
            { label: 'All Jobs', value: totals.all, key: 'all' },
            { label: 'Active', value: totals.active, key: 'active' },
            { label: 'Pending', value: totals.pending, key: 'pending' },
          ].map(pill => (
            <button
              key={pill.key}
              onClick={() => setStatusFilter(
                pill.key === 'active' ? 'jd_approved' :
                pill.key === 'pending' ? 'intake_pending' : 'all'
              )}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors border ${
                (pill.key === 'all' && statusFilter === 'all') ||
                (pill.key === 'active' && statusFilter === 'jd_approved') ||
                (pill.key === 'pending' && statusFilter === 'intake_pending')
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span className="text-base font-bold">{pill.value}</span>
              <span>{pill.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-8 py-4 bg-white border-b border-slate-100">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search jobs..."
            className="w-full rounded-xl border border-slate-200 pl-9 pr-4 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <select
          value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All statuses</option>
          <option value="jd_approved">Active</option>
          <option value="posted">Posted</option>
          <option value="intake_pending">Intake Pending</option>
          <option value="jd_sent">JD Sent</option>
        </select>
      </div>

      {/* Table */}
      <div className="flex-1 px-8 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 text-sm gap-2">
            <div className="h-4 w-4 rounded-full border-2 border-slate-300 border-t-blue-500 animate-spin" />
            Loading jobs…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Briefcase className="h-10 w-10 text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium">No jobs found</p>
            <p className="text-sm text-slate-400 mt-1">
              {search || statusFilter !== 'all' ? 'Try clearing your filters' : 'Create your first job to get started'}
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            <div className="grid grid-cols-[2fr_1fr_2fr_1.5fr_1fr_auto] gap-4 px-5 py-3 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <span>Role</span>
              <span>Location</span>
              <span>Pipeline</span>
              <span>Hiring Manager</span>
              <span>Status</span>
              <span />
            </div>
            {filtered.map(job => (
              <div
                key={job.id}
                onClick={() => router.push(`/jobs/${job.id}`)}
                className="grid grid-cols-[2fr_1fr_2fr_1.5fr_1fr_auto] gap-4 items-center px-5 py-4 border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer transition-colors group"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900 group-hover:text-blue-700 transition-colors truncate">
                      {job.position_title}
                    </p>
                    {job.ticket_number && (
                      <span className="font-mono text-xs text-slate-400 shrink-0">{job.ticket_number}</span>
                    )}
                  </div>
                  {job.department && <p className="text-xs text-slate-400 mt-0.5 truncate">{job.department}</p>}
                </div>
                <div className="text-sm text-slate-600 truncate">
                  {job.location ?? <span className="text-slate-400">—</span>}
                </div>
                <PipelineBar stages={job.stage_counts} />
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                    <span className="text-xs font-semibold text-blue-700">{initials(job.hiring_manager_name)}</span>
                  </div>
                  <span className="text-sm text-slate-600 truncate">{job.hiring_manager_name}</span>
                </div>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[job.status]}`}>
                  {STATUS_LABELS[job.status]}
                </span>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 text-xs text-slate-400">
                    <Clock className="h-3.5 w-3.5" />
                    {daysSince(job.created_at)}d
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-500 transition-colors" />
                </div>
              </div>
            ))}
          </div>
        )}
        {!loading && (
          <p className="text-xs text-slate-400 mt-4 text-center">
            Showing {filtered.length} of {jobs.length} job{jobs.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* ── New Job Drawer ────────────────────────────────────────────────── */}
      {showDrawer && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="flex-1 bg-black/30 backdrop-blur-sm"
            onClick={() => setShowDrawer(false)}
          />
          {/* Panel */}
          <div className="w-full max-w-2xl bg-white border-l border-slate-200 shadow-2xl flex flex-col h-full">
            {/* Sticky drawer header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
              <span className="text-sm font-semibold text-slate-500">New Job</span>
              <button
                onClick={() => setShowDrawer(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* Scrollable form body */}
            <div className="flex-1 overflow-y-auto">
              <NewJobDrawer
                onClose={() => setShowDrawer(false)}
                onCreated={fetchJobs}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
