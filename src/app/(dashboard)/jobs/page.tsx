'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import {
  Briefcase, Plus, Search, Clock, X, Mail, FileText, Send,
  CheckCircle, Copy, Check, Users, PenLine, Wand2, RefreshCw, Loader2, Sparkles, Paperclip,
  ChevronUp, ChevronDown, ChevronsUpDown, ArrowLeft, GripVertical, ChevronRight, Pencil,
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
              ? "Fill in the basics — we'll email the intake form link to your hiring manager."
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
// Pipeline Funnel — stage definitions + count aggregation
// ─────────────────────────────────────────────────────────────────────────────

interface FunnelStageDef {
  id:       string
  name:     string
  keywords: string[]   // lowercase substrings to match against actual stage_name
  accent: {
    border: string   // border-t-* colour class
    dot:    string   // bg-* for dot
    badge:  string   // bg + text for count chip
  }
}

const ALL_FUNNEL_DEFS: FunnelStageDef[] = [
  { id: 'sourced',        name: 'Sourced',          keywords: ['source', 'lead', 'prospect', 'applied', 'application', 'new'],
    accent: { border: 'border-t-slate-400',   dot: 'bg-slate-400',   badge: 'bg-slate-100 text-slate-600' } },
  { id: 'screened',       name: 'Screened',         keywords: ['screen', 'phone', 'cv', 'resume', 'call'],
    accent: { border: 'border-t-blue-400',    dot: 'bg-blue-500',    badge: 'bg-blue-100 text-blue-700' } },
  { id: 'engaged',        name: 'Engaged',          keywords: ['engag', 'assess', 'task', 'test', 'challeng', 'assignment'],
    accent: { border: 'border-t-violet-400',  dot: 'bg-violet-500',  badge: 'bg-violet-100 text-violet-700' } },
  { id: 'interview',      name: 'Interview',        keywords: ['interview'],
    accent: { border: 'border-t-amber-400',   dot: 'bg-amber-500',   badge: 'bg-amber-100 text-amber-700' } },
  { id: 'offer_accepted', name: 'Offer Accepted',   keywords: ['accepted', 'accept', 'verbal'],
    accent: { border: 'border-t-green-500',   dot: 'bg-green-500',   badge: 'bg-green-100 text-green-700' } },
  { id: 'offer_out',      name: 'Offer Rolled Out', keywords: ['offer'],
    accent: { border: 'border-t-emerald-500', dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700' } },
  { id: 'hired',          name: 'Hired',            keywords: ['hired', 'hire', 'won', 'closed'],
    accent: { border: 'border-t-teal-500',    dot: 'bg-teal-500',    badge: 'bg-teal-100 text-teal-700' } },
  { id: 'onboarded',      name: 'Onboarded',        keywords: ['onboard', 'start', 'join'],
    accent: { border: 'border-t-indigo-500',  dot: 'bg-indigo-500',  badge: 'bg-indigo-100 text-indigo-700' } },
]

// Check most-specific stages first so "Offer Accepted" doesn't fall into "Offer Rolled Out"
const FUNNEL_MATCH_PRIORITY = ['offer_accepted', 'hired', 'onboarded', 'offer_out', 'interview', 'engaged', 'screened', 'sourced']

const LS_FUNNEL          = 'rs_jobs_funnel'
const DEFAULT_FUNNEL_IDS = ALL_FUNNEL_DEFS.map(d => d.id)

function computeFunnelCounts(jobs: JobListItem[]): Map<string, number> {
  const counts = new Map<string, number>()
  ALL_FUNNEL_DEFS.forEach(d => counts.set(d.id, 0))
  for (const job of jobs) {
    for (const stage of job.stage_counts) {
      const name = stage.stage_name.toLowerCase()
      for (const fid of FUNNEL_MATCH_PRIORITY) {
        const def = ALL_FUNNEL_DEFS.find(d => d.id === fid)!
        if (def.keywords.some(kw => name.includes(kw))) {
          counts.set(fid, (counts.get(fid) ?? 0) + stage.count)
          break
        }
      }
    }
  }
  return counts
}

// ─────────────────────────────────────────────────────────────────────────────
// Jobs list helpers
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<HiringRequestStatus, { label: string; color: string; icon: React.ReactNode }> = {
  intake_pending:   { label: 'Awaiting HM',     color: 'bg-amber-50 text-amber-700 border-amber-200',       icon: <Clock className="h-3 w-3" /> },
  intake_submitted: { label: 'Intake Received', color: 'bg-blue-50 text-blue-700 border-blue-200',          icon: <FileText className="h-3 w-3" /> },
  jd_generated:    { label: 'JD Generated',     color: 'bg-violet-50 text-violet-700 border-violet-200',    icon: <FileText className="h-3 w-3" /> },
  jd_sent:         { label: 'JD Sent',          color: 'bg-indigo-50 text-indigo-700 border-indigo-200',    icon: <Mail className="h-3 w-3" /> },
  jd_approved:     { label: 'JD Ready',         color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle className="h-3 w-3" /> },
  posted:          { label: 'Posted',           color: 'bg-slate-100 text-slate-600 border-slate-200',      icon: <Send className="h-3 w-3" /> },
}

type SortKey = 'ticket_number' | 'position_title' | 'hiring_manager_name' | 'status' | 'created_at'

const STAGE_DOT: Record<StageColor, string> = {
  slate: 'bg-slate-400', blue: 'bg-blue-500', violet: 'bg-violet-500',
  amber: 'bg-amber-500', emerald: 'bg-emerald-500', green: 'bg-green-500',
  red: 'bg-red-500', pink: 'bg-pink-500',
}

// ─────────────────────────────────────────────────────────────────────────────
// FunnelCustomizer — inline drag-to-reorder panel
// ─────────────────────────────────────────────────────────────────────────────

function FunnelCustomizer({
  activeIds, snapshot, onClose, onDiscard, onChange,
}: {
  activeIds: string[]
  snapshot:  string[]
  onClose:   () => void
  onDiscard: () => void
  onChange:  (ids: string[]) => void
}) {
  const [draggingId,    setDraggingId]    = useState<string | null>(null)
  const [dragOverId,    setDragOverId]    = useState<string | null>(null)
  const [showDiscard,   setShowDiscard]   = useState(false)

  const hasChanges = JSON.stringify(activeIds) !== JSON.stringify(snapshot)
  const available  = ALL_FUNNEL_DEFS.filter(d => !activeIds.includes(d.id))

  function handleDragStart(id: string) { setDraggingId(id) }
  function handleDragOver(e: React.DragEvent, id: string) { e.preventDefault(); setDragOverId(id) }
  function handleDrop(targetId: string) {
    if (!draggingId || draggingId === targetId) { setDraggingId(null); setDragOverId(null); return }
    const from = activeIds.indexOf(draggingId)
    const to   = activeIds.indexOf(targetId)
    const next = [...activeIds]
    next.splice(from, 1)
    next.splice(to, 0, draggingId)
    onChange(next)
    setDraggingId(null); setDragOverId(null)
  }
  function handleDragEnd() { setDraggingId(null); setDragOverId(null) }

  return (
    <div className="border-b border-slate-100 bg-blue-50/40 px-4 py-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-800">Customise funnel</p>
        <div className="flex items-center gap-1.5">
          {hasChanges && (
            <button onClick={() => setShowDiscard(true)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-500 hover:text-red-500 transition-colors">
              Discard
            </button>
          )}
          <button
            onClick={() => { if (hasChanges) setShowDiscard(true); else onClose() }}
            className="rounded-lg bg-blue-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-700 transition-colors">
            Done
          </button>
        </div>
      </div>

      <p className="mb-3 text-[10px] text-slate-400">Drag to reorder · click × to remove</p>

      {/* Discard dialog */}
      {showDiscard && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold text-slate-800">Save changes?</p>
          <div className="mt-2 flex gap-1.5">
            <button onClick={() => setShowDiscard(false)}
              className="flex-1 rounded-lg border border-slate-200 bg-white py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              Keep editing
            </button>
            <button onClick={onDiscard}
              className="flex-1 rounded-lg border border-red-200 bg-white py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 transition-colors">
              Discard
            </button>
            <button onClick={onClose}
              className="flex-1 rounded-lg bg-blue-600 py-1 text-[11px] font-medium text-white hover:bg-blue-700 transition-colors">
              Save
            </button>
          </div>
        </div>
      )}

      {/* Active stages */}
      <div className="mb-4">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Active stages</p>
        <div className="flex flex-wrap gap-1.5">
          {activeIds.map(id => {
            const def = ALL_FUNNEL_DEFS.find(d => d.id === id)
            if (!def) return null
            const isDragging = draggingId === id
            const isDragOver = dragOverId === id && draggingId !== id
            return (
              <div
                key={id}
                draggable
                onDragStart={() => handleDragStart(id)}
                onDragOver={e => handleDragOver(e, id)}
                onDrop={() => handleDrop(id)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1.5 cursor-grab active:cursor-grabbing select-none transition-all ${
                  isDragging ? 'opacity-40 scale-95 border-blue-300' :
                  isDragOver ? 'border-blue-400 shadow-sm ring-1 ring-blue-300 -translate-y-0.5' :
                  'border-slate-200 hover:border-slate-300'
                }`}
              >
                <GripVertical className="h-3 w-3 text-slate-300" />
                <span className={`h-2 w-2 shrink-0 rounded-full ${def.accent.dot}`} />
                <span className="text-xs font-medium text-slate-700">{def.name}</span>
                <button
                  onClick={() => onChange(activeIds.filter(x => x !== id))}
                  className="ml-0.5 text-slate-300 hover:text-red-500 transition-colors">
                  <X className="h-3 w-3" />
                </button>
              </div>
            )
          })}
          {activeIds.length === 0 && (
            <p className="py-2 text-xs text-slate-400">No active stages. Add some below.</p>
          )}
        </div>
      </div>

      {/* Available stages to add */}
      {available.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Add stages</p>
          <div className="flex flex-wrap gap-1.5">
            {available.map(def => (
              <button
                key={def.id}
                onClick={() => onChange([...activeIds, def.id])}
                className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
              >
                <Plus className="h-3 w-3" />
                {def.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PipelineFunnel — horizontal stage cards with arrows
// ─────────────────────────────────────────────────────────────────────────────

function PipelineFunnel({ jobs }: { jobs: JobListItem[] }) {
  const [stageIds,    setStageIds]    = useState<string[]>(DEFAULT_FUNNEL_IDS)
  const [customizing, setCustomizing] = useState(false)
  const [snapshot,    setSnapshot]    = useState<string[]>([])
  const [hydrated,    setHydrated]    = useState(false)

  // Drag state (for cards in the funnel view)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  // Hydrate from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_FUNNEL)
      if (saved) {
        const parsed = JSON.parse(saved) as string[]
        const validIds = new Set(ALL_FUNNEL_DEFS.map(d => d.id))
        const valid = parsed.filter(id => validIds.has(id))
        if (valid.length > 0) setStageIds(valid)
      }
    } catch {}
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try { localStorage.setItem(LS_FUNNEL, JSON.stringify(stageIds)) } catch {}
  }, [stageIds, hydrated])

  const counts = useMemo(() => computeFunnelCounts(jobs), [jobs])

  function openCustomizer() { setSnapshot(stageIds); setCustomizing(true) }

  // Drag on the cards
  function handleDragStart(id: string) { setDraggingId(id) }
  function handleDragOver(e: React.DragEvent, id: string) { e.preventDefault(); setDragOverId(id) }
  function handleDrop(targetId: string) {
    if (!draggingId || draggingId === targetId) { setDraggingId(null); setDragOverId(null); return }
    const from = stageIds.indexOf(draggingId)
    const to   = stageIds.indexOf(targetId)
    const next = [...stageIds]
    next.splice(from, 1)
    next.splice(to, 0, draggingId)
    setStageIds(next)
    setDraggingId(null); setDragOverId(null)
  }
  function handleDragEnd() { setDraggingId(null); setDragOverId(null) }

  if (!hydrated) return null

  const activeDefs = stageIds
    .map(id => ALL_FUNNEL_DEFS.find(d => d.id === id))
    .filter((d): d is FunnelStageDef => !!d)

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">

      {/* Header row */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Hiring Funnel</span>
        <button
          onClick={customizing ? undefined : openCustomizer}
          title="Customise funnel"
          className={`flex items-center justify-center rounded-lg border p-1.5 transition-colors ${
            customizing
              ? 'border-blue-300 bg-blue-50 text-blue-600 cursor-default'
              : 'border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-700'
          }`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Customizer */}
      {customizing && (
        <FunnelCustomizer
          activeIds={stageIds}
          snapshot={snapshot}
          onClose={() => setCustomizing(false)}
          onDiscard={() => { setStageIds(snapshot); setCustomizing(false) }}
          onChange={setStageIds}
        />
      )}

      {/* Funnel cards */}
      {!customizing && (
        <div className="flex items-stretch overflow-x-auto px-4 py-4 gap-0">
          {activeDefs.map((def, idx) => {
            const count     = counts.get(def.id) ?? 0
            const isLast    = idx === activeDefs.length - 1
            const isDragging = draggingId === def.id
            const isDragOver = dragOverId === def.id && draggingId !== def.id

            return (
              <div key={def.id} className="flex items-center shrink-0">
                {/* Stage card */}
                <div
                  draggable
                  onDragStart={() => handleDragStart(def.id)}
                  onDragOver={e => handleDragOver(e, def.id)}
                  onDrop={() => handleDrop(def.id)}
                  onDragEnd={handleDragEnd}
                  className={`flex flex-col rounded-xl border border-t-2 bg-white px-4 py-3 min-w-[130px] select-none cursor-grab active:cursor-grabbing transition-all ${
                    def.accent.border
                  } ${
                    isDragging  ? 'opacity-40 scale-95 shadow-none' :
                    isDragOver  ? 'shadow-md ring-1 ring-blue-300 -translate-y-1' :
                    'shadow-sm hover:shadow-md hover:-translate-y-0.5'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${def.accent.dot}`} />
                    <span className="text-[11px] font-semibold text-slate-600 truncate leading-tight">{def.name}</span>
                  </div>
                  <p className="text-2xl font-bold text-slate-800 leading-none">{count}</p>
                  <p className="text-[10px] text-slate-400 mt-1">candidates</p>
                </div>

                {/* Arrow connector between cards */}
                {!isLast && (
                  <div className="flex items-center px-1 text-slate-300 shrink-0">
                    <ChevronRight className="h-5 w-5" />
                  </div>
                )}
              </div>
            )
          })}

          {activeDefs.length === 0 && (
            <div className="flex-1 py-8 text-center text-xs text-slate-400">
              No stages in the funnel.{' '}
              <button onClick={openCustomizer} className="text-blue-500 hover:underline">Add some</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
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
  const { orgId } = useAuth()
  const [jobs, setJobs] = useState<JobListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<HiringRequestStatus | 'all'>('all')
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [showDrawer, setShowDrawer] = useState(false)

  const fetchJobs = useCallback(() => {
    setLoading(true)
    fetch('/api/jobs')
      .then(r => r.json())
      .then(j => setJobs(j.data ?? []))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { if (orgId) fetchJobs() }, [fetchJobs, orgId])

  // Refetch when the tab regains focus (e.g. after navigating back via browser Back)
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') fetchJobs() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [fetchJobs])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronsUpDown className="h-3 w-3 text-slate-300 ml-1" />
    return sortDir === 'asc'
      ? <ChevronUp className="h-3 w-3 text-blue-500 ml-1" />
      : <ChevronDown className="h-3 w-3 text-blue-500 ml-1" />
  }

  const counts = useMemo(() => ({
    total:    jobs.length,
    awaiting: jobs.filter(j => j.status === 'intake_pending').length,
    ready:    jobs.filter(j => j.status === 'jd_approved').length,
    posted:   jobs.filter(j => j.status === 'posted').length,
  }), [jobs])

  const filtered = useMemo(() => {
    let result = [...jobs]
    if (filterStatus !== 'all') result = result.filter(j => j.status === filterStatus)
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(j =>
        j.position_title.toLowerCase().includes(q) ||
        j.hiring_manager_name.toLowerCase().includes(q) ||
        j.ticket_number?.toLowerCase().includes(q) ||
        j.department?.toLowerCase().includes(q)
      )
    }
    result.sort((a, b) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vA = String((a as any)[sortKey] ?? '')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vB = String((b as any)[sortKey] ?? '')
      const cmp = vA.localeCompare(vB, undefined, { numeric: true })
      return sortDir === 'asc' ? cmp : -cmp
    })
    return result
  }, [jobs, filterStatus, search, sortKey, sortDir])

  const thCls = 'px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide select-none cursor-pointer hover:text-slate-800 transition-colors'

  return (
    <div className="p-8 max-w-6xl space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
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

      {/* Stat cards */}
      {loading ? (
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-3.5 animate-pulse">
              <div className="h-7 w-10 rounded bg-slate-200 mb-2" />
              <div className="h-3 w-20 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-3">
          {([
            { label: 'Total',       value: counts.total,    color: 'bg-slate-50 border-slate-200 text-slate-700',    filter: 'all'             },
            { label: 'Awaiting HM', value: counts.awaiting, color: 'bg-amber-50 border-amber-200 text-amber-700',    filter: 'intake_pending'  },
            { label: 'JD Ready',    value: counts.ready,    color: 'bg-emerald-50 border-emerald-200 text-emerald-700', filter: 'jd_approved'  },
            { label: 'Posted',      value: counts.posted,   color: 'bg-blue-50 border-blue-200 text-blue-700',       filter: 'posted'          },
          ] as const).map(stat => (
            <button
              key={stat.label}
              onClick={() => setFilterStatus(filterStatus === stat.filter ? 'all' : stat.filter)}
              className={`rounded-xl border p-3.5 text-left transition-all hover:shadow-sm ${stat.color} ${
                filterStatus === stat.filter ? 'ring-2 ring-offset-1 ring-blue-400' : ''
              }`}
            >
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-xs font-medium mt-0.5 opacity-70">{stat.label}</p>
            </button>
          ))}
        </div>
      )}

      {/* Pipeline Funnel */}
      <PipelineFunnel jobs={jobs} />

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search position, manager, ticket…"
            className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2">
              <X className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600" />
            </button>
          )}
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as HiringRequestStatus | 'all')}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
        >
          <option value="all">All statuses</option>
          {(Object.keys(STATUS_CONFIG) as HiringRequestStatus[]).map(s => (
            <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
          ))}
        </select>
        {(filterStatus !== 'all' || search) && (
          <button
            onClick={() => { setFilterStatus('all'); setSearch('') }}
            className="text-xs text-slate-500 hover:text-slate-800 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['w-10', 'w-40', 'w-32', 'w-32', 'w-24', 'w-24'].map((w, i) => (
                  <th key={i} className="px-4 py-3">
                    <div className={`h-3 ${w} rounded bg-slate-200 animate-pulse`} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-4"><div className="h-3 w-12 rounded bg-slate-100 animate-pulse" /></td>
                  <td className="px-4 py-4">
                    <div className="h-3.5 w-40 rounded bg-slate-200 animate-pulse mb-2" />
                    <div className="h-2.5 w-24 rounded bg-slate-100 animate-pulse" />
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex gap-1">
                      {Array.from({ length: 3 }).map((_, j) => (
                        <div key={j} className="h-5 w-10 rounded-full bg-slate-100 animate-pulse" />
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-4"><div className="h-3 w-28 rounded bg-slate-100 animate-pulse" /></td>
                  <td className="px-4 py-4"><div className="h-5 w-20 rounded-full bg-slate-100 animate-pulse" /></td>
                  <td className="px-4 py-4"><div className="h-3 w-20 rounded bg-slate-100 animate-pulse" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-16 text-center">
          <Briefcase className="h-10 w-10 text-slate-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">No jobs yet</p>
          <p className="text-xs text-slate-400 mt-1 mb-4">Create your first job to get started</p>
          <button
            onClick={() => setShowDrawer(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            New Job
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className={thCls} onClick={() => toggleSort('ticket_number')}>
                  <span className="flex items-center"># <SortIcon col="ticket_number" /></span>
                </th>
                <th className={thCls} onClick={() => toggleSort('position_title')}>
                  <span className="flex items-center">Position <SortIcon col="position_title" /></span>
                </th>
                <th className={`${thCls} cursor-default hover:text-slate-500`}>Pipeline</th>
                <th className={thCls} onClick={() => toggleSort('hiring_manager_name')}>
                  <span className="flex items-center">Hiring Manager <SortIcon col="hiring_manager_name" /></span>
                </th>
                <th className={thCls} onClick={() => toggleSort('status')}>
                  <span className="flex items-center">Status <SortIcon col="status" /></span>
                </th>
                <th className={thCls} onClick={() => toggleSort('created_at')}>
                  <span className="flex items-center">Created <SortIcon col="created_at" /></span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-400">
                    No results match your filters.
                  </td>
                </tr>
              ) : filtered.map(job => {
                const s = STATUS_CONFIG[job.status]
                return (
                  <tr
                    key={job.id}
                    onClick={() => router.push(`/jobs/${job.id}`)}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3.5">
                      <span className="text-xs font-mono font-semibold text-slate-400">
                        {job.ticket_number ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-sm text-slate-900">{job.position_title}</p>
                      {job.department && <p className="text-xs text-slate-400 mt-0.5">{job.department}</p>}
                    </td>
                    <td className="px-4 py-3.5">
                      <PipelineBar stages={job.stage_counts} />
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="text-sm text-slate-700">{job.hiring_manager_name}</p>
                      {job.hiring_manager_email && (
                        <p className="text-xs text-slate-400">{job.hiring_manager_email}</p>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${s.color}`}>
                        {s.icon}{s.label}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-400">
                      {new Date(job.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length > 0 && (
            <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50">
              <p className="text-xs text-slate-400">
                Showing {filtered.length} of {jobs.length} job{jobs.length !== 1 ? 's' : ''}
              </p>
            </div>
          )}
        </div>
      )}

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
