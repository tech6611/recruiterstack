'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Send, CheckCircle, Copy, Check, Users, PenLine,
  Wand2, RefreshCw, Loader2, Sparkles, Paperclip, X, Plus, GripVertical,
} from 'lucide-react'
import type { StageColor, ScoringCriterion } from '@/lib/types/database'

// ─── Constants ──────────────────────────────────────────────────────────────

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

// ─── Scoring criteria defaults ────────────────────────────────────────────────
const DEFAULT_SCORING_CRITERIA: ScoringCriterion[] = [
  { id: 'technical',     name: 'Technical Skills',  weight: 35, description: 'Relevant technical expertise and depth' },
  { id: 'experience',    name: 'Domain Experience', weight: 25, description: 'Industry or role-specific background' },
  { id: 'communication', name: 'Communication',     weight: 20, description: 'Clarity, articulation, professional presence' },
  { id: 'culture',       name: 'Culture Fit',       weight: 20, description: 'Alignment with team values and ways of working' },
]

// ─── Pipeline builder constants ───────────────────────────────────────────────
const DEFAULT_PIPELINE_STAGES: { name: string; color: StageColor }[] = [
  { name: 'Applied',      color: 'slate'   },
  { name: 'Screening',    color: 'blue'    },
  { name: 'Phone Screen', color: 'violet'  },
  { name: 'Interview',    color: 'amber'   },
  { name: 'Offer',        color: 'emerald' },
  { name: 'Hired',        color: 'green'   },
]

const PIPELINE_COLORS: { value: StageColor; dot: string }[] = [
  { value: 'slate',   dot: 'bg-slate-400'   },
  { value: 'blue',    dot: 'bg-blue-500'    },
  { value: 'violet',  dot: 'bg-violet-500'  },
  { value: 'amber',   dot: 'bg-amber-500'   },
  { value: 'emerald', dot: 'bg-emerald-500' },
  { value: 'green',   dot: 'bg-green-500'   },
  { value: 'red',     dot: 'bg-red-500'     },
  { value: 'pink',    dot: 'bg-pink-500'    },
]

const PIPELINE_DOT: Record<StageColor, string> = {
  slate: 'bg-slate-400', blue: 'bg-blue-500', violet: 'bg-violet-500',
  amber: 'bg-amber-500', emerald: 'bg-emerald-500', green: 'bg-green-500',
  red: 'bg-red-500', pink: 'bg-pink-500',
}

type Mode = 'send_to_hm' | 'fill_myself' | null

// ─── Shared input styles ─────────────────────────────────────────────────────
const inputCls = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition'
const labelCls = 'block text-xs font-semibold text-slate-500 mb-1.5'

// ─── Autocomplete input ───────────────────────────────────────────────────────
function AutocompleteInput({
  value, onChange, options, placeholder, className,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const suggestions = options.filter(o => o.toLowerCase().includes(value.toLowerCase()) && value.length > 0).slice(0, 7)
  return (
    <div className="relative">
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className={className ?? inputCls}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-20 bg-white border border-slate-200 rounded-xl shadow-lg mt-1 overflow-hidden">
          {suggestions.map(s => (
            <button
              key={s}
              type="button"
              onMouseDown={() => { onChange(s); setOpen(false) }}
              className="w-full px-3.5 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Tag input (target companies) ────────────────────────────────────────────
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
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() } }}
        onBlur={add}
        placeholder={tags.length === 0 ? 'Google, Meta, Stripe… press Enter to add' : 'Add more…'}
        className="flex-1 min-w-[140px] bg-transparent outline-none text-sm text-slate-700 placeholder-slate-400 px-1"
      />
    </div>
  )
}

// ─── File import button ───────────────────────────────────────────────────────
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
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={loading}
        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-blue-600 transition-colors mt-1.5"
      >
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
        {loading ? 'Extracting…' : 'Import from PDF / TXT'}
      </button>
    </>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function NewHiringRequestPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>(null)

  // ── Shared (both modes) ──
  const [positionTitle, setPositionTitle] = useState('')
  const [department, setDepartment] = useState('')
  const [hmName, setHmName] = useState('')
  const [hmEmail, setHmEmail] = useState('')
  const [hmSlack, setHmSlack] = useState('')

  // ── Option B (fill myself) ──
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

  // ── Pipeline builder ──
  const [pipelineStages, setPipelineStages] = useState<{ name: string; color: StageColor }[]>(DEFAULT_PIPELINE_STAGES)
  const [stageDragIdx, setStageDragIdx] = useState<number | null>(null)
  const [colorPickerIdx, setColorPickerIdx] = useState<number | null>(null)

  // ── Scoring criteria builder ──
  const [scoringCriteria, setScoringCriteria] = useState<ScoringCriterion[]>(DEFAULT_SCORING_CRITERIA)
  const [critDragIdx, setCritDragIdx] = useState<number | null>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ ticketNumber: string; intakeUrl?: string; positionTitle: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const append = (setter: React.Dispatch<React.SetStateAction<string>>) => (text: string) =>
    setter(prev => prev ? prev + '\n\n' + text : text)

  // ── JD generation for Option B ──
  const handleGenerateJD = async () => {
    if (!teamContext.trim() || !keyReqs.trim()) {
      setJdGenError('Please fill in Team Context and Key Requirements before generating.')
      return
    }
    setJdMode('ai'); setGeneratingJD(true); setJdGenError(null)
    // We don't have a token yet, so we use the general generate endpoint via a temp request
    // Instead, call the jd-generator via a lightweight helper endpoint
    const res = await fetch('/api/intake/preview-jd', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        position_title: positionTitle, department, level, location,
        remote_ok: remoteOk, headcount,
        team_context: teamContext, key_requirements: keyReqs,
        nice_to_haves: niceToHave, budget_min: budgetMin ? Number(budgetMin) : undefined,
        budget_max: budgetMax ? Number(budgetMax) : undefined,
        target_start_date: startDate, additional_notes: notes,
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
      // Option B
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

    // Always send the configured pipeline stages
    const validStages = pipelineStages.filter(s => s.name.trim())
    if (validStages.length > 0) body.pipeline_stages = validStages

    // Always send scoring criteria (only valid non-empty named ones)
    const validCriteria = scoringCriteria.filter(c => c.name.trim() && c.weight > 0)
    if (validCriteria.length > 0) body.scoring_criteria = validCriteria

    const res = await fetch('/api/hiring-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    setLoading(false)

    if (!res.ok) { setError(json.error ?? 'Something went wrong'); return }

    setSuccess({
      ticketNumber: json.data?.ticket_number ?? '',
      intakeUrl: json.intake_url,
      positionTitle,
    })
  }

  const copyIntakeUrl = () => {
    if (!success?.intakeUrl) return
    navigator.clipboard.writeText(success.intakeUrl)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Success screen
  if (success) {
    return (
      <div className="p-8 max-w-lg">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center space-y-4">
          <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto" />
          <div>
            <p className="text-xs font-mono text-emerald-600 font-semibold mb-1">{success.ticketNumber}</p>
            <h2 className="text-xl font-bold text-emerald-900">
              {mode === 'send_to_hm' ? 'Intake sent!' : 'Request created!'}
            </h2>
            <p className="text-sm text-emerald-700 mt-2">
              {mode === 'send_to_hm'
                ? `An email and Slack message have been sent to ${hmName} with the intake form link.`
                : `The hiring request for ${success.positionTitle} has been created with the JD ready for review.`}
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
              New Request
            </button>
            <button
              onClick={() => router.push('/hiring-requests')}
              className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              View All
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Mode selector
  if (mode === null) {
    return (
      <div className="p-8 max-w-2xl space-y-6">
        <div>
          <Link href="/hiring-requests" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
            <ArrowLeft className="h-4 w-4" />Back
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">New Hiring Request</h1>
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
              You have the position title and HM details. They fill in the requirements and write the JD on their own form.
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
              You have all the details ready. Fill the complete requirements and generate or write the JD right now.
            </p>
            <p className="text-xs text-violet-600 font-medium mt-3">→ No HM email sent</p>
          </button>
        </div>
      </div>
    )
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Form (both modes share the top section)
  return (
    <div className="p-8 max-w-2xl space-y-5">
      <div>
        <button onClick={() => setMode(null)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
          <ArrowLeft className="h-4 w-4" />Back
        </button>
        <h1 className="text-2xl font-bold text-slate-900">
          {mode === 'send_to_hm' ? 'Send Intake to Hiring Manager' : 'Create Full Hiring Request'}
        </h1>
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
              {mode === 'fill_myself' && <span className="text-slate-400 font-normal">(optional — for records)</span>}
            </label>
            <input
              required={mode === 'send_to_hm'}
              type="email" value={hmEmail} onChange={e => setHmEmail(e.target.value)}
              placeholder="alex@company.com" className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Slack Handle <span className="text-slate-400 font-normal">(optional)</span></label>
            <input value={hmSlack} onChange={e => setHmSlack(e.target.value)} placeholder="@alexj" className={inputCls} />
          </div>
        </div>

        {/* Option B: full intake form */}
        {mode === 'fill_myself' && (
          <>
            {/* Role Details */}
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
                  <input type="number" min={1} max={50} value={headcount} onChange={e => setHeadcount(Number(e.target.value))} className={inputCls} />
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

            {/* Team & Requirements */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Team & Requirements</p>
              <div>
                <label className={labelCls}>What does this person do on the team? <span className="text-red-500">*</span></label>
                <textarea required rows={4} value={teamContext} onChange={e => setTeamContext(e.target.value)} placeholder="They'll own the checkout flow, work with design, lead 2 junior engineers…" className={inputCls + ' resize-none'} />
                <FileImportButton onExtract={append(setTeamContext)} field="team-context" />
              </div>
              <div>
                <label className={labelCls}>Key Requirements <span className="text-red-500">*</span></label>
                <textarea required rows={4} value={keyReqs} onChange={e => setKeyReqs(e.target.value)} placeholder="5+ years React, Node.js, shipped production apps…" className={inputCls + ' resize-none'} />
                <FileImportButton onExtract={append(setKeyReqs)} field="key-reqs" />
              </div>
              <div>
                <label className={labelCls}>Nice to Have</label>
                <textarea rows={3} value={niceToHave} onChange={e => setNiceToHave(e.target.value)} placeholder="Next.js, fintech background, startup experience…" className={inputCls + ' resize-none'} />
                <FileImportButton onExtract={append(setNiceToHave)} field="nice-to-have" />
              </div>
            </div>

            {/* Target Companies */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Target Companies</p>
              <p className="text-xs text-slate-400">Companies you&apos;d specifically like to hire from (optional)</p>
              <TagInput tags={targetCompanies} onChange={setTargetCompanies} />
            </div>

            {/* Compensation */}
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

            {/* Notes */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <label className={labelCls}>Anything else to know?</label>
              <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Unique perks, team culture, must-haves…" className={inputCls + ' resize-none'} />
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
                  <button type="button" onClick={handleGenerateJD} className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-700 transition-colors">
                    <Wand2 className="h-4 w-4" />Generate with AI
                  </button>
                  <button type="button" onClick={() => setJdMode('manual')} className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors">
                    <PenLine className="h-4 w-4" />Write Manually
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button type="button" onClick={handleGenerateJD} disabled={generatingJD} className="flex items-center gap-1.5 rounded-lg bg-violet-50 border border-violet-200 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50 transition-colors">
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
                    <textarea
                      rows={18} value={jd} onChange={e => setJd(e.target.value)}
                      placeholder="The JD will appear here — you can edit it freely before submitting."
                      className={inputCls + ' resize-y font-mono text-xs leading-relaxed'}
                    />
                    <FileImportButton onExtract={append(setJd)} field="jd" />
                  </div>
                )
              )}
            </div>
          </>
        )}

        {/* Info box (Option A only) */}
        {mode === 'send_to_hm' && (
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-700 space-y-1">
            <p className="font-semibold">What happens next:</p>
            <p>1. {hmName || 'The hiring manager'} gets an email + Slack with their personal intake link</p>
            <p>2. They fill in role details and requirements</p>
            <p>3. They generate a JD with AI (or write their own) directly on the form</p>
            <p>4. They submit the ticket — you get notified and pick it up from here</p>
          </div>
        )}

        {/* ── Pipeline Builder ─────────────────────────────────────────────── */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-700">Hiring Pipeline</p>
              <p className="text-xs text-slate-400 mt-0.5">Drag to reorder · click the dot to change colour · click a name to rename</p>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
            {pipelineStages.map((stage, i) => (
              <div
                key={i}
                draggable
                onDragStart={() => setStageDragIdx(i)}
                onDragOver={e => e.preventDefault()}
                onDrop={() => {
                  if (stageDragIdx === null || stageDragIdx === i) return
                  const next = [...pipelineStages]
                  const [moved] = next.splice(stageDragIdx, 1)
                  next.splice(i, 0, moved)
                  setPipelineStages(next)
                  setStageDragIdx(null)
                }}
                onDragEnd={() => setStageDragIdx(null)}
                className={`flex items-center gap-2.5 px-3 py-2.5 bg-white hover:bg-slate-50 transition-colors group ${stageDragIdx === i ? 'opacity-40' : ''}`}
              >
                <GripVertical className="h-4 w-4 text-slate-300 cursor-grab shrink-0" />
                {/* Color dot + inline picker */}
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setColorPickerIdx(colorPickerIdx === i ? null : i)}
                    className={`h-3.5 w-3.5 rounded-full ${PIPELINE_DOT[stage.color]} ring-2 ring-offset-1 ring-transparent hover:ring-slate-200 transition-all`}
                  />
                  {colorPickerIdx === i && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setColorPickerIdx(null)} />
                      <div className="absolute left-0 top-6 z-20 flex gap-1 bg-white border border-slate-200 rounded-lg p-1.5 shadow-lg">
                        {PIPELINE_COLORS.map(c => (
                          <button
                            key={c.value}
                            type="button"
                            onClick={() => {
                              setPipelineStages(prev => prev.map((s, j) => j === i ? { ...s, color: c.value } : s))
                              setColorPickerIdx(null)
                            }}
                            className={`h-4 w-4 rounded-full ${c.dot} hover:scale-110 transition-transform ${stage.color === c.value ? 'ring-2 ring-offset-1 ring-slate-400' : ''}`}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
                {/* Editable name */}
                <input
                  value={stage.name}
                  onChange={e => setPipelineStages(prev => prev.map((s, j) => j === i ? { ...s, name: e.target.value } : s))}
                  className="flex-1 text-sm text-slate-800 bg-transparent focus:outline-none min-w-0"
                />
                {/* Stage order badge */}
                <span className="text-[10px] font-semibold text-slate-300 tabular-nums shrink-0">{i + 1}</span>
                {/* Delete */}
                <button
                  type="button"
                  onClick={() => setPipelineStages(prev => prev.filter((_, j) => j !== i))}
                  className="opacity-0 group-hover:opacity-100 h-5 w-5 rounded flex items-center justify-center text-slate-300 hover:text-red-400 transition-all shrink-0"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPipelineStages(prev => [...prev, { name: '', color: 'blue' }])}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-violet-600 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add stage
          </button>
        </div>

        {/* ── Scoring Criteria Builder ────────────────────────────────────── */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-700">Scoring Criteria</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Drag to reorder · weights must add up to 100% · used by AI scoring and interview scorecards
              </p>
            </div>
            {/* Running weight total */}
            {(() => {
              const total = scoringCriteria.reduce((s, c) => s + (Number(c.weight) || 0), 0)
              return (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  total === 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
                }`}>
                  {total}%
                </span>
              )
            })()}
          </div>

          <div className="rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
            {scoringCriteria.map((crit, i) => (
              <div
                key={crit.id}
                draggable
                onDragStart={() => setCritDragIdx(i)}
                onDragOver={e => e.preventDefault()}
                onDrop={() => {
                  if (critDragIdx === null || critDragIdx === i) return
                  const next = [...scoringCriteria]
                  const [moved] = next.splice(critDragIdx, 1)
                  next.splice(i, 0, moved)
                  setScoringCriteria(next)
                  setCritDragIdx(null)
                }}
                onDragEnd={() => setCritDragIdx(null)}
                className={`flex items-center gap-2 px-3 py-2.5 bg-white hover:bg-slate-50 transition-colors group ${critDragIdx === i ? 'opacity-40' : ''}`}
              >
                <GripVertical className="h-4 w-4 text-slate-300 cursor-grab shrink-0" />
                {/* Factor name */}
                <input
                  value={crit.name}
                  onChange={e => setScoringCriteria(prev => prev.map((c, j) => j === i ? { ...c, name: e.target.value } : c))}
                  placeholder="Factor name"
                  className="flex-1 text-sm text-slate-800 bg-transparent focus:outline-none min-w-0"
                />
                {/* Weight % */}
                <div className="flex items-center gap-0.5 shrink-0">
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={crit.weight}
                    onChange={e => setScoringCriteria(prev => prev.map((c, j) => j === i ? { ...c, weight: Number(e.target.value) || 0 } : c))}
                    className="w-10 text-right text-sm font-semibold text-slate-700 bg-transparent focus:outline-none"
                  />
                  <span className="text-xs text-slate-400">%</span>
                </div>
                {/* Delete */}
                <button
                  type="button"
                  onClick={() => setScoringCriteria(prev => prev.filter((_, j) => j !== i))}
                  className="opacity-0 group-hover:opacity-100 h-5 w-5 rounded flex items-center justify-center text-slate-300 hover:text-red-400 transition-all shrink-0"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setScoringCriteria(prev => [
              ...prev,
              { id: `crit_${Date.now()}`, name: '', weight: 0, description: null },
            ])}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-violet-600 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add factor
          </button>
        </div>

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
