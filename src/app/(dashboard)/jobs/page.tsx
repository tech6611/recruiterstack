'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import {
  Briefcase, Plus, Search, Clock, X, Mail, FileText, Send,
  CheckCircle, Check, Users, PenLine, Wand2, RefreshCw, Loader2, Sparkles, Paperclip,
  ChevronUp, ChevronDown, ChevronRight, ChevronsUpDown, ArrowLeft, GripVertical, Archive, Ban,
  CalendarDays, SlidersHorizontal, Pencil, AlertTriangle,
} from 'lucide-react'
import type { JobListItem, HiringRequestStatus, StageColor } from '@/lib/types/database'
import type { Opening, Department, Location as LocationRow } from '@/lib/types/requisitions'
import type { Editor } from '@tiptap/react'
import EditHMModal from '@/components/EditHMModal'
import { RichTextEditor, stripHtml, isHtmlEmpty } from '@/components/RichTextEditor'
import { inputCls, labelCls } from '@/lib/ui/styles'
import { StatCards } from '@/components/ui/stat-cards'
import { trackEvent } from '@/lib/analytics'

// Convert plain text (e.g. extracted from an imported PDF/TXT) into simple HTML
// so it can be inserted into a Tiptap rich-text editor with line breaks intact.
function plainTextToHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return text
    .split(/\n{2,}/)
    .map(block => `<p>${block.split('\n').map(esc).join('<br>')}</p>`)
    .join('')
}

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

// Work arrangement shown on the job. Value is the stored key; label is what the
// recruiter sees. Mirrors the intake form so both front doors match.
const WORK_MODELS = [
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite', label: 'On-site' },
] as const

const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship', 'Temporary']

// A requisition stores employment_type in canonical form (full_time). Map it to
// the display label so it pre-fills cleanly when a job is created from a req.
const EMPLOYMENT_TYPE_FROM_OPENING: Record<string, string> = {
  full_time: 'Full-time', part_time: 'Part-time', contract: 'Contract',
  intern: 'Internship', temp: 'Temporary',
}

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

// Prefill payload when the New Job drawer is opened from an approved
// requisition (see the "Create job & write JD" action on /openings/[id]).
interface FromOpening {
  id:                string
  title:             string
  department:        string
  location:          string
  employment_type:   string
  comp_min:          string
  comp_max:          string
  target_start_date: string
  hm_name:           string
}


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
    <div className="flex flex-wrap gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50 min-h-[44px] focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-emerald-100 transition">
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
        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-600 transition-colors mt-1.5">
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
        {loading ? 'Extracting…' : 'Import from PDF / TXT'}
      </button>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// New Job Drawer
// ─────────────────────────────────────────────────────────────────────────────

function NewJobDrawer({ onClose, onCreated, fromOpening }: { onClose: () => void; onCreated: () => void; fromOpening?: FromOpening | null }) {
  const drawerRouter = useRouter()
  // After the recruiter picks the approved requisition, always offer the two
  // paths: "Send to Hiring Manager" (email them the intake link) or "Fill it
  // myself". The chosen requisition (fromOpening) flows through either way.
  const [mode, setMode] = useState<NewJobMode>(null)
  // After a "Send to HM" submit, hold the minted intake link so we can show the
  // recruiter a copy-able link (works even when email is turned off).
  const [sentInfo, setSentInfo] = useState<{ url: string; emailSent: boolean } | null>(null)
  const [copied, setCopied] = useState(false)
  const [positionTitle, setPositionTitle] = useState(fromOpening?.title ?? '')
  const [department, setDepartment] = useState(fromOpening?.department ?? '')
  const [hmName, setHmName] = useState(fromOpening?.hm_name ?? '')
  const [hmEmail, setHmEmail] = useState('')
  const [hmSlack, setHmSlack] = useState('')
  const [level, setLevel] = useState('')
  const [workModel, setWorkModel] = useState('')
  const [employmentType, setEmploymentType] = useState(fromOpening?.employment_type ?? '')
  // Single job location. Pre-filled from the linked requisition; required.
  const [location, setLocation] = useState(fromOpening?.location ?? '')
  const [openings, setOpenings] = useState<{ location: string; seats: number }[]>([
    { location: fromOpening?.location ?? '', seats: 1 },
  ])

  const totalSeats = openings.reduce((sum, o) => sum + (o.seats || 1), 0)
  const updateOpening = (idx: number, patch: Partial<{ location: string; seats: number }>) =>
    setOpenings(prev => prev.map((o, i) => (i === idx ? { ...o, ...patch } : o)))
  const addOpening = () => setOpenings(prev => [...prev, { location: '', seats: 1 }])
  const removeOpening = (idx: number) => setOpenings(prev => prev.filter((_, i) => i !== idx))
  const [teamContext, setTeamContext] = useState('')
  const [keyReqs, setKeyReqs] = useState('')
  const [niceToHave, setNiceToHave] = useState('')
  const [targetCompanies, setTargetCompanies] = useState<string[]>([])
  const [budgetMin, setBudgetMin] = useState(fromOpening?.comp_min ?? '')
  const [budgetMax, setBudgetMax] = useState(fromOpening?.comp_max ?? '')
  const [startDate, setStartDate] = useState(fromOpening?.target_start_date ?? '')
  const [notes, setNotes] = useState('')
  const [jd, setJd] = useState('')
  const [jdMode, setJdMode] = useState<'ai' | 'manual' | null>(null)
  const [generatingJD, setGeneratingJD] = useState(false)
  const [jdGenError, setJdGenError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const append = (setter: React.Dispatch<React.SetStateAction<string>>) => (text: string) =>
    setter(prev => prev ? prev + '\n\n' + text : text)

  // Rich-text editors hold HTML; Tiptap only reads `content` on init, so file
  // imports must insert into the live editor instance (captured here) rather
  // than mutating React state. We strip the HTML back to clean text for the AI
  // prompt and for storage so nothing downstream ever sees raw tags.
  const teamCtxEditor   = useRef<Editor | null>(null)
  const keyReqsEditor   = useRef<Editor | null>(null)
  const niceToHaveEditor = useRef<Editor | null>(null)
  const insertIntoEditor = (ref: React.MutableRefObject<Editor | null>) => (text: string) =>
    ref.current?.chain().focus().insertContent(plainTextToHtml(text)).run()

  const handleGenerateJD = async () => {
    if (isHtmlEmpty(teamContext) || isHtmlEmpty(keyReqs)) {
      setJdGenError('Please fill in Team Context and Key Requirements before generating.')
      return
    }
    trackEvent('jd_generation_started', { source: 'dashboard' })
    setJdMode('ai'); setGeneratingJD(true); setJdGenError(null)
    const res = await fetch('/api/intake/preview-jd', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        position_title: positionTitle, department, level, location,
        remote_ok: workModel === 'remote', headcount: totalSeats,
        team_context: stripHtml(teamContext), key_requirements: stripHtml(keyReqs),
        nice_to_haves: stripHtml(niceToHave),
        budget_min: budgetMin ? Number(budgetMin) : undefined,
        budget_max: budgetMax ? Number(budgetMax) : undefined,
        target_start_date: startDate, additional_notes: notes,
      }),
    })
    const data = await res.json()
    setGeneratingJD(false)
    if (!res.ok) setJdGenError(data.error ?? 'Failed to generate JD.')
    else {
      setJd(data.jd)
      trackEvent('jd_generated', { source: 'dashboard', word_count: data.jd.trim().split(/\s+/).length })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!positionTitle.trim()) { setError('Position title is required.'); return }

    // "Send to HM" path: create a draft job flagged awaiting the HM's input,
    // link the approved requisition, and email the HM their intake link. We then
    // show the recruiter the link so they can copy/share it even if email is off.
    if (mode === 'send_to_hm') {
      if (!hmName.trim())  { setError('Hiring manager name is required.'); return }
      if (!hmEmail.trim()) { setError('Hiring manager email is required to send the intake link.'); return }
      setLoading(true); setError(null)
      const res = await fetch('/api/req-jobs/send-intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:                positionTitle.trim(),
          department,
          link_opening_id:      fromOpening?.id ?? null,
          hiring_manager_name:  hmName.trim(),
          hiring_manager_email: hmEmail.trim(),
          intake: { hm_name: hmName.trim(), hm_email: hmEmail.trim(), hm_slack: hmSlack },
        }),
      })
      const json = await res.json()
      setLoading(false)
      if (!res.ok) { setError(json.error ?? 'Something went wrong'); return }
      trackEvent('job_created', { mode: 'send_to_hm', position_title: positionTitle })
      onCreated()
      setSentInfo({ url: json.intake_url, emailSent: Boolean(json.email_sent) })
      return
    }

    if (mode === 'fill_myself') {
      if (isHtmlEmpty(teamContext) || isHtmlEmpty(keyReqs)) {
        setError('Please fill in Team Context and Key Requirements.')
        return
      }
      if (!location.trim())  { setError('Please add a Location.'); return }
      if (!workModel)        { setError('Please choose a Work model (Remote / Hybrid / On-site).'); return }
      if (!level)            { setError('Please choose a Level / Seniority.'); return }
      if (!employmentType)   { setError('Please choose an Employment type.'); return }
    }
    setLoading(true); setError(null)
    // Canonical job-create: the legacy hiring_requests intake flow has been
    // retired. Persist a draft job plus one opening per seat per location,
    // then open it for full editing.
    const res = await fetch('/api/req-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title:       positionTitle.trim(),
        department,
        description: jd,
        comp_min:    budgetMin ? Number(budgetMin) : null,
        comp_max:    budgetMax ? Number(budgetMax) : null,
        remote_ok:   workModel === 'remote',
        // When linking an approved requisition, don't mint new seats — the
        // existing opening is linked server-side via link_opening_id.
        link_opening_id: fromOpening?.id ?? null,
        openings: fromOpening
          ? []
          : openings
              .filter(o => o.location.trim() || o.seats > 0)
              .map(o => ({ location: o.location.trim(), seats: o.seats || 1 })),
        intake: {
          level,
          work_model:      workModel || null,
          employment_type: employmentType || null,
          location:        location.trim(),
          hm_name: hmName, hm_email: hmEmail, hm_slack: hmSlack,
          // Store the editor's rich HTML so bullets/bold survive into the
          // detail view and the public apply page. (The AI JD preview above
          // still gets the stripped plain-text version.) Empty editors persist
          // as '' rather than Tiptap's "<p></p>" placeholder.
          team_context:     isHtmlEmpty(teamContext) ? '' : teamContext,
          key_requirements: isHtmlEmpty(keyReqs)      ? '' : keyReqs,
          nice_to_have:     isHtmlEmpty(niceToHave)   ? '' : niceToHave,
          target_companies: targetCompanies,
          budget_min: budgetMin, budget_max: budgetMax,
          target_start_date: startDate, notes,
        },
      }),
    })
    const json = await res.json()
    setLoading(false)
    if (!res.ok) { setError(json.error ?? 'Something went wrong'); return }
    trackEvent('job_created', { mode: mode ?? 'unknown', position_title: positionTitle })
    onCreated()
    const newId = json.data?.id
    if (newId) drawerRouter.push(`/req-jobs/${newId}`)
    else onClose()
  }

  const copyIntakeLink = async () => {
    if (!sentInfo) return
    try {
      await navigator.clipboard.writeText(sentInfo.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy automatically — select and copy the link manually.')
    }
  }

  const innerContent = () => {
    // Post-send confirmation: the intake job is created and (if email is on) the
    // HM has been emailed. Show the link so the recruiter can copy/share it too.
    if (sentInfo) {
      return (
        <div className="p-6 space-y-6">
          <div className="flex flex-col items-center text-center gap-3 pt-4">
            <div className="h-14 w-14 rounded-full bg-emerald-50 flex items-center justify-center">
              <CheckCircle className="h-7 w-7 text-emerald-600" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Intake sent to {hmName || 'the hiring manager'}</h2>
            <p className="text-sm text-slate-500 max-w-sm">
              {sentInfo.emailSent
                ? `We emailed ${hmEmail} their personal intake link. You'll be notified when they submit.`
                : `Email isn't set up, so we didn't send anything — share the link below with ${hmEmail || 'your hiring manager'} directly.`}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Intake link</label>
            <div className="flex items-center gap-2">
              <input readOnly value={sentInfo.url} className={inputCls + ' bg-white text-xs text-slate-600'} onFocus={e => e.target.select()} />
              <button type="button" onClick={copyIntakeLink}
                className="shrink-0 flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-2.5 text-xs font-semibold text-white hover:bg-slate-900 transition-colors">
                {copied ? <><Check className="h-3.5 w-3.5" />Copied</> : <>Copy</>}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            This role now shows <span className="font-semibold text-amber-700">Awaiting HM&apos;s input</span> on your jobs list.
            When the hiring manager submits, it moves to <span className="font-semibold">To be Published</span> for you to review and publish.
          </div>

          <button type="button" onClick={onClose}
            className="w-full rounded-xl bg-[#221b14] px-4 py-3 text-sm font-semibold text-white hover:bg-[#33271b] transition-colors shadow-sm">
            Done
          </button>
        </div>
      )
    }

    if (mode === null) {
      return (
        <div className="p-6 space-y-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">New Hiring Request</h2>
            <p className="text-sm text-slate-500 mt-1">How would you like to create this request?</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button onClick={() => setMode('send_to_hm')}
              className="group text-left rounded-2xl border-2 border-slate-200 bg-white p-6 hover:border-emerald-400 hover:shadow-sm transition-all">
              <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center mb-4 group-hover:bg-emerald-100 transition-colors">
                <Send className="h-5 w-5 text-emerald-600" />
              </div>
              <h3 className="font-bold text-slate-900 text-sm mb-1">Send to Hiring Manager</h3>
              <p className="text-xs text-slate-500 leading-relaxed">You have the position title and HM details. They fill in requirements and write the JD on their form.</p>
              <p className="text-xs text-emerald-600 font-medium mt-3">→ Sends intake link to HM</p>
            </button>
            <button onClick={() => setMode('fill_myself')}
              className="group text-left rounded-2xl border-2 border-slate-200 bg-white p-6 hover:border-slate-400 hover:shadow-sm transition-all">
              <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center mb-4 group-hover:bg-slate-100 transition-colors">
                <Users className="h-5 w-5 text-slate-600" />
              </div>
              <h3 className="font-bold text-slate-900 text-sm mb-1">Fill Everything Myself</h3>
              <p className="text-xs text-slate-500 leading-relaxed">You have all the details ready. Fill requirements and generate or write the JD right now.</p>
              <p className="text-xs text-slate-600 font-medium mt-3">→ No HM email sent</p>
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className="p-6 space-y-5">
        <div>
          {/* Back returns to the two-card mode picker (Send to HM / Fill myself). */}
          <button onClick={() => setMode(null)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4 transition-colors">
            <ArrowLeft className="h-4 w-4" />Back
          </button>
          <h2 className="text-lg font-bold text-slate-900">
            {mode === 'send_to_hm' ? 'Send Intake to Hiring Manager' : 'Create Full Hiring Request'}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {mode === 'send_to_hm' ? "Fill in the basics — we'll email the intake form link to your hiring manager." : 'Fill everything yourself — no email will be sent.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Position</p>
            {/* Title + Department are set once on the requisition and flow through
                locked, so the approved requisition stays the single source of truth. */}
            <div>
              <label className={labelCls}>
                Job Title <span className="text-red-500">*</span>
                {fromOpening && <span className="ml-1.5 text-xs font-normal text-slate-400">· from requisition</span>}
              </label>
              {fromOpening ? (
                <div className={inputCls + ' bg-slate-50 text-slate-500 cursor-not-allowed select-none'}>{positionTitle || '—'}</div>
              ) : (
                <AutocompleteInput value={positionTitle} onChange={setPositionTitle} options={JOB_TITLES} placeholder="Senior Product Manager" />
              )}
            </div>
            <div>
              <label className={labelCls}>
                Department / Team
                {fromOpening && <span className="ml-1.5 text-xs font-normal text-slate-400">· from requisition</span>}
              </label>
              {fromOpening ? (
                <div className={inputCls + ' bg-slate-50 text-slate-500 cursor-not-allowed select-none'}>{department || '—'}</div>
              ) : (
                <AutocompleteInput value={department} onChange={setDepartment} options={DEPARTMENTS} placeholder="Engineering, Product, Sales…" />
              )}
            </div>
          </div>

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

          {mode === 'fill_myself' && (
            <>
              <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Role Details</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Level / Seniority <span className="text-red-500">*</span></label>
                    <select value={level} onChange={e => setLevel(e.target.value)} className={inputCls}>
                      <option value="">Select level…</option>
                      {LEVEL_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Work model <span className="text-red-500">*</span></label>
                    <select value={workModel} onChange={e => setWorkModel(e.target.value)} className={inputCls}>
                      <option value="">Select…</option>
                      {WORK_MODELS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Employment type <span className="text-red-500">*</span></label>
                    <select value={employmentType} onChange={e => setEmploymentType(e.target.value)} className={inputCls}>
                      <option value="">Select type…</option>
                      {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Location <span className="text-red-500">*</span></label>
                    <AutocompleteInput value={location} onChange={setLocation} options={CITIES} placeholder="Bengaluru, India" />
                  </div>
                </div>

                {fromOpening ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <p className="text-xs font-semibold text-emerald-800">Filling approved requisition</p>
                    <p className="text-sm text-emerald-900 mt-0.5">{fromOpening.title}</p>
                    <p className="text-xs text-emerald-700 mt-1">This job will be linked to the requisition you already approved — no new headcount is created.</p>
                  </div>
                ) : (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className={labelCls + ' mb-0'}>Requisitions by location</label>
                    <span className="text-xs text-slate-400">{totalSeats} {totalSeats === 1 ? 'seat' : 'seats'} total</span>
                  </div>
                  {openings.map((o, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <div className="flex-1">
                        <AutocompleteInput value={o.location} onChange={v => updateOpening(idx, { location: v })}
                          options={CITIES} placeholder="New York, Remote, Hybrid…" />
                      </div>
                      <input type="number" min={1} max={50} value={o.seats}
                        onChange={e => updateOpening(idx, { seats: Math.max(1, Number(e.target.value)) })}
                        title="Seats at this location"
                        className={inputCls + ' w-20 text-center'} />
                      {openings.length > 1 && (
                        <button type="button" onClick={() => removeOpening(idx)}
                          className="h-[44px] w-10 flex items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 transition-colors">
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button type="button" onClick={addOpening}
                    className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors">
                    <Plus className="h-3.5 w-3.5" />Add another location
                  </button>
                </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Team & Requirements</p>
                <div>
                  <label className={labelCls}>What does this person do on the team? <span className="text-red-500">*</span></label>
                  <RichTextEditor value={teamContext} onChange={setTeamContext}
                    onEditorReady={ed => { teamCtxEditor.current = ed }}
                    minHeight={110}
                    placeholder="They'll own the checkout flow, work with design, lead 2 junior engineers…" />
                  <FileImportButton onExtract={insertIntoEditor(teamCtxEditor)} field="team-context" />
                </div>
                <div>
                  <label className={labelCls}>Key Requirements <span className="text-red-500">*</span></label>
                  <RichTextEditor value={keyReqs} onChange={setKeyReqs}
                    onEditorReady={ed => { keyReqsEditor.current = ed }}
                    minHeight={110}
                    placeholder="5+ years React, Node.js, shipped production apps…" />
                  <FileImportButton onExtract={insertIntoEditor(keyReqsEditor)} field="key-reqs" />
                </div>
                <div>
                  <label className={labelCls}>Nice to Have</label>
                  <RichTextEditor value={niceToHave} onChange={setNiceToHave}
                    onEditorReady={ed => { niceToHaveEditor.current = ed }}
                    minHeight={84}
                    placeholder="Next.js, fintech background, startup experience…" />
                  <FileImportButton onExtract={insertIntoEditor(niceToHaveEditor)} field="nice-to-have" />
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
                    <div className="relative">
                      <input value={startDate} onChange={e => setStartDate(e.target.value)} placeholder="ASAP, Q2 2025, June…" className={`${inputCls} pr-10`} />
                      {/* Calendar picker: a transparent native date input sits over the
                          icon so clicking it opens the browser's date picker (anchored
                          here). Typing free text like "ASAP" still works on the left. */}
                      <div className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400">
                        <CalendarDays className="h-4 w-4 pointer-events-none" />
                        <input
                          type="date"
                          aria-label="Pick a target start date"
                          value={/^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : ''}
                          onChange={e => setStartDate(e.target.value)}
                          className="absolute inset-0 cursor-pointer opacity-0"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <label className={labelCls}>Anything else to know?</label>
                <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Unique perks, team culture, must-haves…" className={inputCls + ' resize-none'} />
                <FileImportButton onExtract={append(setNotes)} field="notes" />
              </div>

              <div className="rounded-xl border-2 border-slate-200 bg-white p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Job Description <span className="text-red-500">*</span></p>
                    <p className="text-xs text-slate-400 mt-0.5">Generate with AI or write manually</p>
                  </div>
                  {jd && <span className="text-xs text-slate-400">{jd.trim().split(/\s+/).length} words</span>}
                </div>

                {jdGenError && <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">{jdGenError}</div>}

                {jdMode === null ? (
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button type="button" onClick={handleGenerateJD}
                      className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-slate-600 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-700 transition-colors">
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
                      className="flex items-center gap-1.5 rounded-lg bg-slate-50 border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition-colors">
                      {generatingJD ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      {generatingJD ? 'Generating…' : jdMode === 'ai' ? 'Regenerate with AI' : 'Generate with AI'}
                    </button>
                    {jdMode === 'ai' && !generatingJD && (
                      <button type="button" onClick={() => { setJdMode('manual'); setJdGenError(null) }}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors">
                        <PenLine className="h-3.5 w-3.5" />Write manually instead
                      </button>
                    )}
                  </div>
                )}

                {jdMode !== null && (
                  generatingJD ? (
                    <div className="flex items-center justify-center gap-3 rounded-xl border border-slate-100 bg-slate-50 py-10 text-sm text-slate-600">
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

          {mode === 'send_to_hm' && (
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-700 space-y-1">
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
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#221b14] px-4 py-3 text-sm font-semibold text-white hover:bg-[#33271b] disabled:opacity-60 transition-colors shadow-sm"
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
// Requisition chooser — the front door to creating a job
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A job can only be created from an APPROVED requisition (enforced server-side in
 * /api/req-jobs POST). So "New Job" no longer opens the JD form directly — it
 * first asks the user to pick one of their approved requisitions. Picking one
 * carries its title/department/location/comp/start-date into the New Job drawer
 * and links that requisition to the new job (no new headcount is minted).
 */
function RequisitionChooser({ onPick }: { onPick: (o: FromOpening) => void }) {
  const [openings, setOpenings] = useState<Opening[]>([])
  const [depts, setDepts]       = useState<Department[]>([])
  const [locs, setLocs]         = useState<LocationRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [q, setQ]               = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/openings?status=approved').then(r => r.json()).then(d => (d.data ?? []) as Opening[]),
      fetch('/api/departments').then(r => r.json()).then(d => (d.data ?? []) as Department[]),
      fetch('/api/locations').then(r => r.json()).then(d => (d.data ?? []) as LocationRow[]),
    ])
      .then(([o, d, l]) => { setOpenings(o); setDepts(d); setLocs(l) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const deptById = useMemo(() => new Map(depts.map(d => [d.id, d.name])), [depts])
  const locById  = useMemo(() => new Map(locs.map(l => [l.id, l.name])), [locs])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return openings
    return openings.filter(o => o.title.toLowerCase().includes(needle))
  }, [openings, q])

  const pick = (o: Opening) => onPick({
    id:                o.id,
    title:             o.title,
    department:        o.department_id ? (deptById.get(o.department_id) ?? '') : '',
    location:          o.location_id   ? (locById.get(o.location_id)    ?? '') : '',
    employment_type:   o.employment_type ? (EMPLOYMENT_TYPE_FROM_OPENING[o.employment_type] ?? '') : '',
    comp_min:          o.comp_min != null ? String(o.comp_min) : '',
    comp_max:          o.comp_max != null ? String(o.comp_max) : '',
    target_start_date: o.target_start_date ?? '',
    hm_name:           '',
  })

  return (
    <div className="p-6 space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Pick an approved requisition</h2>
        <p className="text-sm text-slate-500 mt-1">
          A job can only be created from an approved requisition. Choose one to write its job description.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Search approved requisitions…"
          value={q}
          onChange={e => setQ(e.target.value)}
          className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl border border-slate-200 bg-slate-50 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 px-6 text-center">
          <CheckCircle className="h-9 w-9 text-slate-200 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-600">
            {openings.length === 0 ? 'No approved requisitions yet' : 'No approved requisitions match your search'}
          </p>
          <p className="text-xs text-slate-400 mt-1 mb-4">
            {openings.length === 0
              ? 'Create a requisition and get it approved before you can create a job.'
              : 'Try a different search.'}
          </p>
          {openings.length === 0 && (
            <a
              href="/openings/new"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#221b14] px-4 py-2 text-sm font-semibold text-white hover:bg-[#33271b] transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />New requisition
            </a>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(o => {
            const dept = o.department_id ? deptById.get(o.department_id) : null
            const loc  = o.location_id   ? locById.get(o.location_id)    : null
            const comp = o.comp_min != null && o.comp_max != null
              ? `${o.comp_currency} ${Number(o.comp_min).toLocaleString()}–${Number(o.comp_max).toLocaleString()}`
              : null
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => pick(o)}
                className="w-full text-left rounded-xl border border-slate-200 bg-white p-4 hover:border-emerald-400 hover:shadow-sm transition-all"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-slate-900 text-sm">{o.title}</p>
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    <CheckCircle className="h-3 w-3" />Approved
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {[dept, loc, comp].filter(Boolean).join(' · ') || 'No details'}
                </p>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Jobs list helpers
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  intake_pending:   { label: "Awaiting HM's Input",  color: 'bg-amber-50 text-amber-700 border-amber-200',       icon: <Clock className="h-3 w-3" /> },
  intake_submitted: { label: 'Intake Received',       color: 'bg-slate-50 text-slate-700 border-slate-200',          icon: <FileText className="h-3 w-3" /> },
  jd_generated:    { label: 'JD Generated',           color: 'bg-slate-50 text-slate-700 border-slate-200',    icon: <FileText className="h-3 w-3" /> },
  jd_sent:         { label: 'JD Sent',                color: 'bg-slate-50 text-slate-700 border-slate-200',    icon: <Mail className="h-3 w-3" /> },
  jd_approved:     { label: 'To be Published',        color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle className="h-3 w-3" /> },
  posted:          { label: 'Active',                 color: 'bg-emerald-50 text-emerald-700 border-emerald-200',       icon: <Send className="h-3 w-3" /> },
  closed:          { label: 'Closed',                 color: 'bg-slate-100 text-slate-500 border-slate-200',      icon: <Archive className="h-3 w-3" /> },
  // Canonical job statuses (jobs table): draft → pending_approval → approved → open → closed/archived.
  draft:            { label: 'Draft',                 color: 'bg-slate-50 text-slate-600 border-slate-200',       icon: <FileText className="h-3 w-3" /> },
  pending_approval: { label: 'Pending Approval',      color: 'bg-amber-50 text-amber-700 border-amber-200',       icon: <Clock className="h-3 w-3" /> },
  approved:         { label: 'To be Published',       color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle className="h-3 w-3" /> },
  open:             { label: 'Active',                color: 'bg-emerald-50 text-emerald-700 border-emerald-200',       icon: <Send className="h-3 w-3" /> },
  withdrawn:        { label: 'Withdrawn',             color: 'bg-orange-50 text-orange-700 border-orange-200',     icon: <Ban className="h-3 w-3" /> },
  archived:         { label: 'Archived',              color: 'bg-slate-100 text-slate-400 border-slate-200',      icon: <Archive className="h-3 w-3" /> },
}

const DEFAULT_STATUS_CONFIG = { label: 'Unknown', color: 'bg-slate-100 text-slate-500 border-slate-200', icon: <Clock className="h-3 w-3" /> }

// A "Send to HM" intake job sits at status 'draft' but should read as "Awaiting
// HM's input" until the hiring manager submits, so its badge overrides the plain
// draft label.
const AWAITING_HM_CONFIG = { label: "Awaiting HM's Input", color: 'bg-amber-50 text-amber-700 border-amber-200', icon: <Clock className="h-3 w-3" /> }
function statusBadge(job: { status: string; awaiting_hm?: boolean }) {
  if (job.awaiting_hm) return AWAITING_HM_CONFIG
  return STATUS_CONFIG[job.status] ?? DEFAULT_STATUS_CONFIG
}

// Where a job row opens when clicked. The recruiting Kanban (/jobs/[id]) is the
// candidate-pipeline view, so it's the right destination for any job that has (or
// had) a pipeline: 'open' jobs and 'closed' jobs (to review their past
// candidates), plus the legacy 'posted'/'closed' equivalents. A pre-open job
// (draft / pending_approval / approved) has nothing to show there, so it opens
// the requisition management view (/req-jobs/[id]) where you submit for approval,
// link openings, and publish.
const LIVE_PIPELINE_STATUSES = new Set(['open', 'posted', 'closed'])
function jobDetailHref(status: string, id: string): string {
  return LIVE_PIPELINE_STATUSES.has(status) ? `/jobs/${id}` : `/req-jobs/${id}`
}

// "Past" = jobs no longer live: terminal (closed/archived) plus withdrawn
// (paused, off the market). Everything else is "Active" work.
const PAST_JOB_STATUSES = new Set(['closed', 'archived', 'withdrawn'])
const isPastJobStatus = (s: string) => PAST_JOB_STATUSES.has(s)

// Foldable pane header ("fixed block") tints. COLOUR OPTION: swap these values to
// restyle both panes at once — the single place that controls Active/Past colours.
type PaneTone = { bar: string; title: string; chevron: string }
const PANE_TINT: { active: PaneTone; past: PaneTone } = {
  active: { bar: 'bg-[#d9ece1] hover:bg-[#cbe4d7]', title: 'text-[#0c4634]', chevron: 'text-[#2f9c72]' },
  past:   { bar: 'bg-[#eae6dd] hover:bg-[#e0dbce]', title: 'text-[#4f483d]', chevron: 'text-[#9a8f7d]' },
}

/**
 * The "Past" block: a foldable list of closed/archived jobs. It shares the page's
 * single global search (passed in via `search`) rather than owning its own search
 * bar. The Active block keeps the full-featured table (drag, column config,
 * filters) above it.
 */
function PastJobsBlock({ jobs, search }: { jobs: JobListItem[]; search: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(true)

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return jobs
    return jobs.filter(j =>
      j.position_title.toLowerCase().includes(needle) ||
      (j.department ?? '').toLowerCase().includes(needle) ||
      (j.hiring_manager_name ?? '').toLowerCase().includes(needle) ||
      (j.ticket_number ?? '').toLowerCase().includes(needle) ||
      (j.location ?? '').toLowerCase().includes(needle),
    )
  }, [jobs, search])

  return (
    <div className="rounded-2xl border border-slate-300 bg-white shadow-sm" style={{ overflow: 'clip' }}>
      {/* Foldable pane header — the coloured "fixed block". Click to collapse/expand. */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex w-full items-center gap-2 px-4 py-3 text-left transition-colors ${PANE_TINT.past.bar}`}
      >
        {open
          ? <ChevronDown className={`h-4 w-4 shrink-0 ${PANE_TINT.past.chevron}`} />
          : <ChevronRight className={`h-4 w-4 shrink-0 ${PANE_TINT.past.chevron}`} />}
        <span className={`text-sm font-semibold uppercase tracking-wide ${PANE_TINT.past.title}`}>Past</span>
        <span className="inline-flex items-center justify-center rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-[#4f483d]">{jobs.length}</span>
      </button>

      {open && (
        <div className="border-t border-slate-100">
        {filtered.length === 0 ? (
          <div className="py-12 text-center">
            <Briefcase className="h-9 w-9 text-slate-200 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-500">
              {jobs.length === 0 ? 'No past jobs yet' : 'No past jobs match your search'}
            </p>
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-slate-500">
                  <th className="text-left px-4 py-3 font-medium">Position</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Hiring manager</th>
                  <th className="text-left px-4 py-3 font-medium">Location</th>
                  <th className="text-left px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(j => {
                  const sc = statusBadge(j)
                  return (
                    <tr
                      key={j.id}
                      onClick={() => router.push(jobDetailHref(j.status as string, j.id))}
                      className="border-b border-slate-100 last:border-0 cursor-pointer hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-4 py-3.5">
                        <span className="font-medium text-slate-900">{j.position_title}</span>
                        {j.department && <div className="text-xs text-slate-400">{j.department}</div>}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${sc.color}`}>
                          {sc.icon} {sc.label}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-slate-600">{j.hiring_manager_name || '—'}</td>
                      <td className="px-4 py-3.5 text-slate-600">{j.location || '—'}</td>
                      <td className="px-4 py-3.5 text-slate-600">{new Date(j.created_at).toLocaleDateString()}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50">
              <p className="text-xs text-slate-400">
                Showing {filtered.length} of {jobs.length} job{jobs.length !== 1 ? 's' : ''}
              </p>
            </div>
          </>
        )}
        </div>
      )}
    </div>
  )
}

type SortKey = 'ticket_number' | 'position_title' | 'hiring_manager_name' | 'status' | 'created_at'
type TimeFilter = '7d' | '30d' | '3m' | 'all' | 'custom'
type ColId = 'ticket' | 'position' | 'pipeline' | 'manager' | 'status' | 'created' | 'actions'
           | 'department' | 'location' | 'level' | 'headcount'

interface ColDef {
  id: ColId
  label: string
  sortKey?: SortKey
  filterable?: boolean
  filterType?: 'checkbox' | 'text'
  required?: boolean
  defaultVisible: boolean
}

const ALL_COL_DEFS: ColDef[] = [
  { id: 'ticket',     label: 'Req #',           sortKey: 'ticket_number',       filterable: true,  filterType: 'text', required: false, defaultVisible: true  },
  { id: 'position',   label: 'Position',        sortKey: 'position_title',      filterable: true,  required: true,  defaultVisible: true  },
  { id: 'pipeline',   label: 'Pipeline',                                         filterable: false, required: false, defaultVisible: true  },
  { id: 'manager',    label: 'Hiring Manager',  sortKey: 'hiring_manager_name', filterable: true,  required: false, defaultVisible: true  },
  { id: 'status',     label: 'Status',          sortKey: 'status',              filterable: true,  required: false, defaultVisible: true  },
  { id: 'created',    label: 'Created',         sortKey: 'created_at',          filterable: false, required: false, defaultVisible: true  },
  { id: 'actions',    label: 'Actions',                                          filterable: false, required: true,  defaultVisible: true  },
  { id: 'department', label: 'Department',                                       filterable: true,  required: false, defaultVisible: false },
  { id: 'location',   label: 'Location',                                         filterable: true,  required: false, defaultVisible: false },
  { id: 'level',      label: 'Level',                                             filterable: true,  required: false, defaultVisible: false },
  { id: 'headcount',  label: 'Headcount',                                        filterable: false, required: false, defaultVisible: false },
]

const DEFAULT_VISIBLE_COLS: ColId[] = ALL_COL_DEFS.filter(c => c.defaultVisible).map(c => c.id)
const LS_COLS = 'rs_jobs_cols'

const TIME_OPTS: { value: TimeFilter; label: string }[] = [
  { value: '7d',     label: 'Last 7 days'   },
  { value: '30d',    label: 'Last 30 days'  },
  { value: '3m',     label: 'Last 3 months' },
  { value: 'all',    label: 'All time'      },
  { value: 'custom', label: 'Custom range'  },
]

const STAGE_DOT: Record<StageColor, string> = {
  slate: 'bg-slate-400', blue: 'bg-slate-500', violet: 'bg-slate-500',
  amber: 'bg-amber-500', emerald: 'bg-emerald-500', green: 'bg-emerald-500',
  red: 'bg-red-500', pink: 'bg-slate-500',
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
  const router  = useRouter()
  const { orgId } = useAuth()

  // ── Data ──────────────────────────────────────────────────────────────────
  const [jobs, setJobs]       = useState<JobListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [editHMJob, setEditHMJob] = useState<JobListItem | null>(null)

  // ── Column visibility / order (persisted to LS) ───────────────────────────
  const [visibleCols, setVisibleCols] = useState<ColId[]>(DEFAULT_VISIBLE_COLS)
  const [showColPicker, setShowColPicker] = useState(false)
  const colPickerBtnRef = useRef<HTMLButtonElement>(null)
  const [colPickerPos, setColPickerPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 })

  // ── Sort ──────────────────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // ── Global search ─────────────────────────────────────────────────────────
  const [jobSearch, setJobSearch] = useState('')

  // Foldable "Active" pane (the Past pane manages its own open state internally).
  const [activeOpen, setActiveOpen] = useState(true)

  // ── Time filter ───────────────────────────────────────────────────────────
  const [timeFilter, setTimeFilter]   = useState<TimeFilter>('all')
  const [customFrom,  setCustomFrom]  = useState('')
  const [customTo,    setCustomTo]    = useState('')
  const [showTimePicker, setShowTimePicker] = useState(false)

  // ── Column filters (checkbox-based, one dropdown at a time) ───────────────
  const [colFilters,     setColFilters]     = useState<Record<string, string[]>>({})
  const [colDropdown,    setColDropdown]    = useState<{ colId: string; top: number; left: number } | null>(null)
  const [colFilterSearch, setColFilterSearch] = useState('')

  // ── UI ────────────────────────────────────────────────────────────────────
  const [showDrawer, setShowDrawer] = useState(false)
  // "New Job" first opens this chooser of approved requisitions; picking one
  // opens the drawer with that requisition prefilled & linked.
  const [showReqChooser, setShowReqChooser] = useState(false)
  // When opened from an approved requisition, these prefill the drawer and tell
  // it to link that existing opening instead of minting new seats.
  const [drawerFromOpening, setDrawerFromOpening] = useState<FromOpening | null>(null)

  // Single front door: /req-jobs/new redirects here with ?new to open the rich
  // New Job drawer. Strip the param so a refresh/back doesn't reopen it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.has('new')) {
      const openingId = params.get('from_opening')
      if (openingId) {
        setDrawerFromOpening({
          id:         openingId,
          title:      params.get('title')      ?? '',
          department: params.get('department')  ?? '',
          location:   params.get('location')    ?? '',
          employment_type:   EMPLOYMENT_TYPE_FROM_OPENING[params.get('employment_type') ?? ''] ?? '',
          comp_min:          params.get('comp_min')          ?? '',
          comp_max:          params.get('comp_max')          ?? '',
          target_start_date: params.get('target_start_date') ?? '',
          hm_name:           params.get('hm_name')           ?? '',
        })
      }
      setShowDrawer(true)
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  // ── Drag-and-drop: rows ───────────────────────────────────────────────────
  const [dragRowId,    setDragRowId]    = useState<string | null>(null)
  const [dragOverRowId, setDragOverRowId] = useState<string | null>(null)
  const [manualOrder,  setManualOrder]  = useState<string[] | null>(null)

  // ── Drag-and-drop: columns ────────────────────────────────────────────────
  const [dragColId,     setDragColId]     = useState<ColId | null>(null)
  const [dragOverColId, setDragOverColId] = useState<ColId | null>(null)

  // ── Load column layout from localStorage ──────────────────────────────────
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_COLS) ?? 'null')
      if (Array.isArray(saved) && saved.length > 0) setVisibleCols(saved as ColId[])
    } catch {}
  }, [])

  // ── Data fetch ────────────────────────────────────────────────────────────
  const fetchJobs = useCallback(() => {
    setLoading(true)
    fetch('/api/jobs', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => setJobs(j.data ?? []))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { if (orgId) fetchJobs() }, [fetchJobs, orgId])
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') fetchJobs() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [fetchJobs])

  // ── Actions ───────────────────────────────────────────────────────────────
  const togglePublish = useCallback(async (jobId: string, currentStatus: HiringRequestStatus) => {
    const newStatus = currentStatus === 'posted' ? 'jd_approved' : 'posted'
    await fetch(`/api/jobs/${jobId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    trackEvent(newStatus === 'posted' ? 'job_published' : 'job_unpublished', { job_id: jobId })
    fetchJobs()
  }, [fetchJobs])

  // ── Sort helpers ──────────────────────────────────────────────────────────
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }
  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronsUpDown className="h-3 w-3 text-slate-300 ml-1 shrink-0" />
    return sortDir === 'asc'
      ? <ChevronUp   className="h-3 w-3 text-slate-500 ml-1 shrink-0" />
      : <ChevronDown className="h-3 w-3 text-slate-500 ml-1 shrink-0" />
  }

  // ── Column visibility helpers ─────────────────────────────────────────────
  const toggleCol = (id: ColId) => {
    const def = ALL_COL_DEFS.find(c => c.id === id)
    if (def?.required) return
    setVisibleCols(prev => {
      const next = prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
      try { localStorage.setItem(LS_COLS, JSON.stringify(next)) } catch {}
      return next
    })
  }

  // ── Column drag handlers ───────────────────────────────────────────────────
  const handleColDrop = (targetId: ColId) => {
    if (!dragColId || dragColId === targetId) { setDragColId(null); setDragOverColId(null); return }
    setVisibleCols(prev => {
      const next = [...prev]
      const from = next.indexOf(dragColId)
      const to   = next.indexOf(targetId)
      if (from < 0 || to < 0) return prev
      next.splice(from, 1); next.splice(to, 0, dragColId)
      try { localStorage.setItem(LS_COLS, JSON.stringify(next)) } catch {}
      return next
    })
    setDragColId(null); setDragOverColId(null)
  }

  // ── Row drag handlers ──────────────────────────────────────────────────────
  const handleRowDrop = (targetId: string) => {
    if (!dragRowId || dragRowId === targetId) { setDragRowId(null); setDragOverRowId(null); return }
    const order = manualOrder ?? filtered.map(j => j.id)
    const from  = order.indexOf(dragRowId)
    const to    = order.indexOf(targetId)
    if (from < 0 || to < 0) return
    const next = [...order]; next.splice(from, 1); next.splice(to, 0, dragRowId)
    setManualOrder(next)
    setDragRowId(null); setDragOverRowId(null)
  }

  // ── Column filter options (unique values from data) ───────────────────────
  const colFilterOptions = useMemo<Partial<Record<ColId, { value: string; label: string }[]>>>(() => {
    const uniq = <T,>(arr: T[]): T[] => Array.from(new Set(arr))
    return {
      ticket:     uniq(jobs.map(j => j.ticket_number).filter(Boolean) as string[]).sort().map(v => ({ value: v, label: v })),
      position:   uniq(jobs.map(j => j.position_title)).sort().map(v => ({ value: v, label: v })),
      manager:    uniq(jobs.map(j => j.hiring_manager_name)).sort().map(v => ({ value: v, label: v })),
      status:     Object.entries(STATUS_CONFIG).map(([k, v]) => ({ value: k, label: v.label })),
      department: uniq(jobs.map(j => j.department).filter(Boolean) as string[]).sort().map(v => ({ value: v, label: v })),
      location:   uniq(jobs.map(j => j.location).filter(Boolean) as string[]).sort().map(v => ({ value: v, label: v })),
      level:      uniq(jobs.map(j => j.level).filter(Boolean) as string[]).sort().map(v => ({ value: v, label: v })),
    }
  }, [jobs])

  // ── Counts ────────────────────────────────────────────────────────────────
  // Count both legacy and canonical statuses so the cards stay correct through the
  // canonical cutover: draft≈awaiting, approved≈ready, open≈active.
  const counts = useMemo(() => {
    const is = (j: JobListItem, ...s: string[]) => s.includes(j.status as string)
    return {
      total:    jobs.length,
      awaiting: jobs.filter(j => is(j, 'intake_pending', 'draft')).length,
      ready:    jobs.filter(j => is(j, 'jd_approved', 'approved')).length,
      active:   jobs.filter(j => is(j, 'posted', 'open')).length,
      closed:   jobs.filter(j => is(j, 'closed')).length,
    }
  }, [jobs])

  // ── Active / Past split ─────────────────────────────────────────────────
  // The rich table below operates on Active jobs only; closed/archived jobs go
  // to the separate Past block. Stat-card counts still span everything.
  const activeJobs = useMemo(() => jobs.filter(j => !isPastJobStatus(j.status as string)), [jobs])
  const pastJobs   = useMemo(() => jobs.filter(j =>  isPastJobStatus(j.status as string)), [jobs])

  // ── Filtered + sorted list ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = [...activeJobs]

    // Global text search
    if (jobSearch.trim()) {
      const q = jobSearch.trim().toLowerCase()
      result = result.filter(j =>
        j.position_title.toLowerCase().includes(q) ||
        (j.department ?? '').toLowerCase().includes(q) ||
        (j.hiring_manager_name ?? '').toLowerCase().includes(q) ||
        (j.ticket_number ?? '').toLowerCase().includes(q) ||
        (j.location ?? '').toLowerCase().includes(q)
      )
    }

    if (timeFilter !== 'all') {
      if (timeFilter === 'custom') {
        if (customFrom) result = result.filter(j => new Date(j.created_at) >= new Date(customFrom))
        if (customTo)   result = result.filter(j => new Date(j.created_at) <= new Date(customTo + 'T23:59:59'))
      } else {
        const now = Date.now()
        const ms  = timeFilter === '7d' ? 7 * 86_400_000 : timeFilter === '30d' ? 30 * 86_400_000 : 91 * 86_400_000
        result = result.filter(j => now - new Date(j.created_at).getTime() <= ms)
      }
    }

    if (colFilters.status?.length)     result = result.filter(j => colFilters.status!.includes(j.status))
    if (colFilters.position?.length)   result = result.filter(j => colFilters.position!.includes(j.position_title))
    if (colFilters.manager?.length)    result = result.filter(j => colFilters.manager!.includes(j.hiring_manager_name))
    if (colFilters.ticket?.length)     result = result.filter(j => (j.ticket_number ?? '').toLowerCase().includes((colFilters.ticket![0] ?? '').toLowerCase()))
    if (colFilters.department?.length) result = result.filter(j => colFilters.department!.includes(j.department ?? ''))
    if (colFilters.location?.length)   result = result.filter(j => colFilters.location!.includes(j.location ?? ''))
    if (colFilters.level?.length)      result = result.filter(j => colFilters.level!.includes(j.level ?? ''))

    result.sort((a, b) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vA = String((a as any)[sortKey] ?? '')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vB = String((b as any)[sortKey] ?? '')
      return (sortDir === 'asc' ? 1 : -1) * vA.localeCompare(vB, undefined, { numeric: true })
    })
    return result
  }, [activeJobs, jobSearch, timeFilter, customFrom, customTo, colFilters, sortKey, sortDir])

  useEffect(() => { setManualOrder(null) }, [colFilters, jobSearch, timeFilter, customFrom, customTo, sortKey, sortDir])

  const displayedJobs = useMemo(() => {
    if (!manualOrder) return filtered
    const map = new Map(filtered.map(j => [j.id, j]))
    return manualOrder.filter(id => map.has(id)).map(id => map.get(id)!)
  }, [filtered, manualOrder])

  // ── Derived filter state ───────────────────────────────────────────────────
  const hasColFilters = Object.values(colFilters).some(v => v.length > 0)
  const hasAnyFilter  = hasColFilters || timeFilter !== 'all' || !!jobSearch.trim()

  const timeLabel = timeFilter === '7d' ? 'Last 7 days' : timeFilter === '30d' ? 'Last 30 days'
    : timeFilter === '3m' ? 'Last 3 months' : timeFilter === 'custom' ? 'Custom range' : 'All time'

  // ── Col filter toggle ──────────────────────────────────────────────────────
  const toggleColFilter = (colId: string, value: string) => {
    setColFilters(prev => {
      const current = prev[colId] ?? []
      const next    = current.includes(value) ? current.filter(v => v !== value) : [...current, value]
      if (!next.length) { const cp = { ...prev }; delete cp[colId]; return cp }
      return { ...prev, [colId]: next }
    })
  }
  const clearColFilter = (colId: string) =>
    setColFilters(p => { const cp = { ...p }; delete cp[colId]; return cp })
  const selectAllInCol = (colId: string) => {
    const opts = colFilterOptions[colId as ColId] ?? []
    if (opts.length > 0) setColFilters(p => ({ ...p, [colId]: opts.map(o => o.value) }))
  }

  // ── Shared th styles ───────────────────────────────────────────────────────
  const thBase = 'px-3 py-3 text-left align-top'
  const thLbl  = 'text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap'

  // ─── Render a column header cell ───────────────────────────────────────────
  const renderColHeader = (col: ColDef) => {
    const isFixed = col.id === 'actions' // fixed position columns
    const activeFilter = (colFilters[col.id]?.length ?? 0) > 0

    return (
      <th
        key={col.id}
        draggable={!isFixed}
        onDragStart={e => {
          if ((e.target as HTMLElement).closest('button')) { e.preventDefault(); return }
          setDragColId(col.id)
        }}
        onDragOver={e => { e.preventDefault(); if (!isFixed) setDragOverColId(col.id) }}
        onDrop={() => handleColDrop(col.id)}
        onDragEnd={() => { setDragColId(null); setDragOverColId(null) }}
        className={`${thBase} transition-colors ${
          dragColId === col.id ? 'opacity-40' : dragOverColId === col.id ? 'bg-slate-50' : ''
        }`}
      >
        <div className="flex items-center gap-1">
          {/* Sort trigger (if sortable) */}
          {col.sortKey ? (
            <button
              onClick={() => toggleSort(col.sortKey!)}
              className={`flex items-center ${thLbl} hover:text-slate-800 transition-colors`}
            >
              {col.label} <SortIcon col={col.sortKey} />
            </button>
          ) : (
            <span className={thLbl}>{col.label}</span>
          )}

          {/* Filter dropdown trigger (if filterable) */}
          {col.filterable && (col.filterType === 'text' || (colFilterOptions[col.id]?.length ?? 0) > 0) && (
            <button
              onClick={e => {
                e.stopPropagation()
                const rect = e.currentTarget.getBoundingClientRect()
                setColFilterSearch('')
                setColDropdown(prev =>
                  prev?.colId === col.id ? null : { colId: col.id, top: rect.bottom + 4, left: rect.left }
                )
              }}
              className={`flex items-center gap-0.5 rounded px-1 py-0.5 transition-colors shrink-0 ${
                activeFilter
                  ? 'bg-slate-50 text-emerald-600 ring-1 ring-emerald-200'
                  : colDropdown?.colId === col.id
                  ? 'bg-slate-100 text-slate-600'
                  : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
              }`}
              title={`Filter by ${col.label}`}
            >
              <ChevronDown className={`h-3 w-3 transition-transform ${colDropdown?.colId === col.id ? 'rotate-180' : ''}`} />
              {activeFilter && <span className="text-[10px] font-semibold">{colFilters[col.id]!.length}</span>}
            </button>
          )}
        </div>
      </th>
    )
  }

  // ─── Render a row cell ─────────────────────────────────────────────────────
  const renderCell = (job: JobListItem, colId: ColId) => {
    const s = statusBadge(job)
    switch (colId) {
      case 'ticket':
        return <td key={colId} className="px-3 py-3.5"><span className="text-xs font-mono font-semibold text-slate-400">{job.ticket_number ?? '—'}</span></td>
      case 'position':
        return (
          <td key={colId} className="px-3 py-3.5">
            <div className="flex items-center gap-1.5">
              <p className="font-semibold text-sm text-slate-900">{job.position_title}</p>
              {job.opening_count === 0 && (
                <span
                  title="No approved requisition linked to this job"
                  className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
                >
                  <AlertTriangle className="h-3 w-3" />No req
                </span>
              )}
            </div>
            {job.department && <p className="text-xs text-slate-400 mt-0.5">{job.department}</p>}
          </td>
        )
      case 'pipeline':
        return <td key={colId} className="px-3 py-3.5"><PipelineBar stages={job.stage_counts} /></td>
      case 'manager':
        return (
          <td key={colId} className="px-3 py-3.5" onClick={e => e.stopPropagation()}>
            <div className="group flex items-start gap-1.5">
              <div className="min-w-0">
                <p className="text-sm text-slate-700">{job.hiring_manager_name}</p>
                {job.hiring_manager_email && <p className="text-xs text-slate-400">{job.hiring_manager_email}</p>}
              </div>
              <button
                onClick={() => setEditHMJob(job)}
                className="mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 h-5 w-5 rounded flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
                title="Edit hiring manager"
              >
                <Pencil className="h-3 w-3" />
              </button>
            </div>
          </td>
        )
      case 'status':
        return <td key={colId} className="px-3 py-3.5"><span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${s.color}`}>{s.icon}{s.label}</span></td>
      case 'created':
        return <td key={colId} className="px-3 py-3.5 text-xs text-slate-400 whitespace-nowrap">{new Date(job.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
      case 'department':
        return <td key={colId} className="px-3 py-3.5 text-sm text-slate-600">{job.department ?? <span className="text-slate-300">—</span>}</td>
      case 'location':
        return <td key={colId} className="px-3 py-3.5 text-sm text-slate-600">{job.location ?? <span className="text-slate-300">—</span>}</td>
      case 'level':
        return <td key={colId} className="px-3 py-3.5 text-sm text-slate-600">{job.level ?? <span className="text-slate-300">—</span>}</td>
      case 'headcount':
        return <td key={colId} className="px-3 py-3.5 text-sm text-slate-600">{job.headcount ?? <span className="text-slate-300">—</span>}</td>
      case 'actions':
        return (
          <td key={colId} className="px-3 py-3.5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-1.5">
              {job.status !== 'closed' && (
                job.status === 'posted' ? (
                  <button onClick={() => togglePublish(job.id, job.status)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors whitespace-nowrap">
                    Unpublish
                  </button>
                ) : (
                  <button onClick={() => togglePublish(job.id, job.status)}
                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors whitespace-nowrap">
                    Publish
                  </button>
                )
              )}
            </div>
          </td>
        )
      default:
        return <td key={colId} className="px-3 py-3.5" />
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 w-full space-y-5">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Jobs</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage open roles and candidate pipelines</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Global search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={jobSearch}
              onChange={e => setJobSearch(e.target.value)}
              placeholder="Search jobs…"
              className={`h-9 w-52 rounded-xl border pl-8 pr-8 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent ${
                jobSearch
                  ? 'border-slate-300 bg-slate-50 text-slate-800'
                  : 'border-slate-200 bg-white text-slate-700 placeholder-slate-400'
              }`}
            />
            {jobSearch && (
              <button
                onClick={() => setJobSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Time filter icon + dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowTimePicker(p => !p)}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                timeFilter !== 'all'
                  ? 'border-slate-300 bg-slate-50 text-slate-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-800'
              }`}
              title="Time filter"
            >
              <CalendarDays className="h-4 w-4" />
              {timeFilter !== 'all' && <span className="text-xs">{timeLabel}</span>}
            </button>
            {showTimePicker && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowTimePicker(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5 w-52">
                  {TIME_OPTS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setTimeFilter(opt.value)
                        if (opt.value !== 'custom') setShowTimePicker(false)
                      }}
                      className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                        timeFilter === opt.value ? 'bg-slate-50 text-slate-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {opt.label}
                      {timeFilter === opt.value && <Check className="h-3 w-3 ml-auto shrink-0" />}
                    </button>
                  ))}
                  {timeFilter === 'custom' && (
                    <div className="px-2 pt-2 pb-1 border-t border-slate-100 mt-1 space-y-2">
                      <div>
                        <label className="text-xs font-medium text-slate-500 mb-1 block">From</label>
                        <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                          className="w-full text-xs rounded-lg border border-slate-200 px-2 py-1.5 outline-none focus:border-emerald-400 transition" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-500 mb-1 block">To</label>
                        <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                          className="w-full text-xs rounded-lg border border-slate-200 px-2 py-1.5 outline-none focus:border-emerald-400 transition" />
                      </div>
                      <button onClick={() => setShowTimePicker(false)}
                        className="w-full text-xs bg-[#221b14] text-white rounded-lg py-1.5 hover:bg-[#33271b] transition-colors font-semibold">
                        Apply
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Customize columns */}
          <button
            ref={colPickerBtnRef}
            onClick={e => {
              const rect = e.currentTarget.getBoundingClientRect()
              setColPickerPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
              setShowColPicker(p => !p)
            }}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:border-slate-300 hover:text-slate-800 transition-colors"
            title="Customize columns"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>

          <button
            onClick={() => setShowReqChooser(true)}
            className="flex items-center gap-2 rounded-xl bg-[#221b14] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#33271b] transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" />
            New Job
          </button>
        </div>
      </div>

      {/* ── Stat cards ──────────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 animate-pulse">
              <div className="h-10 w-10 shrink-0 rounded-lg bg-slate-200" />
              <div className="flex-1"><div className="h-5 w-10 rounded bg-slate-200" /><div className="h-2.5 w-16 rounded bg-slate-100 mt-1.5" /></div>
            </div>
          ))}
        </div>
      ) : (
        <StatCards
          cards={[
            { key: 'total',    label: 'Total',           value: counts.total,    tone: 'slate', icon: <Briefcase className="h-4 w-4" /> },
            { key: 'awaiting', label: 'Awaiting Input',  value: counts.awaiting, tone: 'amber', icon: <Clock className="h-4 w-4" /> },
            { key: 'ready',    label: 'To be Published', value: counts.ready,    tone: 'pine',  icon: <Send className="h-4 w-4" /> },
            { key: 'active',   label: 'Active',          value: counts.active,   tone: 'gold',  icon: <CheckCircle className="h-4 w-4" /> },
            { key: 'closed',   label: 'Closed',          value: counts.closed,   tone: 'stone', icon: <Archive className="h-4 w-4" /> },
          ]}
        />
      )}

      {/* ── Filter bar ──────────────────────────────────────────────────── */}
      {(hasAnyFilter || manualOrder) && (
        <div className="flex items-center gap-2 flex-wrap">
          {/* Active filter chips */}
          {Object.entries(colFilters).map(([colId, values]) => {
            if (!values.length) return null
            const colDef = ALL_COL_DEFS.find(c => c.id === colId)
            const singleLabel = colId === 'status' ? (STATUS_CONFIG[values[0]]?.label ?? values[0]) : values[0]
            const displayLabel = values.length === 1 ? singleLabel : `${values.length} selected`
            return (
              <span key={colId} className="inline-flex items-center gap-1 rounded-full bg-slate-50 border border-slate-200 px-2.5 py-0.5 text-xs text-slate-700 font-medium">
                <span className="text-slate-400">{colDef?.label}:</span> {displayLabel}
                <button onClick={() => clearColFilter(colId)} className="ml-0.5 hover:text-emerald-900">
                  <X className="h-3 w-3" />
                </button>
              </span>
            )
          })}
          {timeFilter !== 'all' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 border border-slate-200 px-2.5 py-0.5 text-xs text-slate-700 font-medium">
              <CalendarDays className="h-3 w-3" /> {timeLabel}
              <button onClick={() => setTimeFilter('all')} className="ml-0.5 hover:text-emerald-900">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {hasAnyFilter && (
            <button
              onClick={() => { setColFilters({}); setTimeFilter('all'); setCustomFrom(''); setCustomTo('') }}
              className="text-xs text-slate-500 hover:text-slate-800 transition-colors"
            >
              Clear all
            </button>
          )}
          {manualOrder && (
            <button onClick={() => setManualOrder(null)} className="text-xs text-slate-500 hover:text-emerald-700 transition-colors">
              Reset row order
            </button>
          )}
        </div>
      )}

      {/* ── Table ───────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['w-6', 'w-10', 'w-40', 'w-36', 'w-32', 'w-24', 'w-24', 'w-24'].map((w, i) => (
                  <th key={i} className="px-3 py-3"><div className={`h-3 ${w} rounded bg-slate-200 animate-pulse`} /></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-4"><div className="h-3 w-4 rounded bg-slate-100 animate-pulse" /></td>
                  <td className="px-3 py-4"><div className="h-3 w-12 rounded bg-slate-100 animate-pulse" /></td>
                  <td className="px-3 py-4"><div className="h-3.5 w-40 rounded bg-slate-200 animate-pulse mb-2" /><div className="h-2.5 w-24 rounded bg-slate-100 animate-pulse" /></td>
                  <td className="px-3 py-4"><div className="flex gap-1">{[0,1,2].map(j => <div key={j} className="h-5 w-10 rounded-full bg-slate-100 animate-pulse" />)}</div></td>
                  <td className="px-3 py-4"><div className="h-3 w-28 rounded bg-slate-100 animate-pulse" /></td>
                  <td className="px-3 py-4"><div className="h-5 w-20 rounded-full bg-slate-100 animate-pulse" /></td>
                  <td className="px-3 py-4"><div className="h-3 w-20 rounded bg-slate-100 animate-pulse" /></td>
                  <td className="px-3 py-4"><div className="h-7 w-20 rounded-lg bg-slate-100 animate-pulse" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-6">
        {/* ── Active block (the full-featured, foldable table) ────────────── */}
        <div className="rounded-2xl border border-slate-300 bg-white shadow-sm" style={{ overflow: 'clip' }}>
          {/* Foldable pane header — the coloured "fixed block". Click to collapse/expand. */}
          <button
            type="button"
            onClick={() => setActiveOpen(o => !o)}
            className={`flex w-full items-center gap-2 px-4 py-3 text-left transition-colors ${PANE_TINT.active.bar}`}
          >
            {activeOpen
              ? <ChevronDown className={`h-4 w-4 shrink-0 ${PANE_TINT.active.chevron}`} />
              : <ChevronRight className={`h-4 w-4 shrink-0 ${PANE_TINT.active.chevron}`} />}
            <span className={`text-sm font-semibold uppercase tracking-wide ${PANE_TINT.active.title}`}>Active</span>
            <span className="inline-flex items-center justify-center rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-[#0c4634]">{activeJobs.length}</span>
          </button>

          {activeOpen && (
          <div className="border-t border-slate-100">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {/* Fixed drag-handle header */}
                <th className="w-8 px-3 py-3" />
                {/* Dynamic columns */}
                {visibleCols.map(colId => {
                  const col = ALL_COL_DEFS.find(c => c.id === colId)
                  return col ? renderColHeader(col) : null
                })}
              </tr>
            </thead>
            <tbody>
              {displayedJobs.length === 0 ? (
                <tr>
                  <td colSpan={visibleCols.length + 1} className="px-5 py-10 text-center text-sm text-slate-400">
                    {activeJobs.length === 0 ? 'No active jobs yet.' : 'No results match your filters.'}
                  </td>
                </tr>
              ) : displayedJobs.map(job => (
                <tr
                  key={job.id}
                  draggable
                  onDragStart={() => setDragRowId(job.id)}
                  onDragOver={e => { e.preventDefault(); setDragOverRowId(job.id) }}
                  onDrop={() => handleRowDrop(job.id)}
                  onDragEnd={() => { setDragRowId(null); setDragOverRowId(null) }}
                  onClick={() => router.push(jobDetailHref(job.status as string, job.id))}
                  className={`border-b border-slate-100 last:border-0 cursor-pointer transition-colors select-none ${
                    dragRowId === job.id ? 'opacity-40 bg-slate-50'
                    : dragOverRowId === job.id ? 'bg-slate-50 border-slate-200'
                    : 'hover:bg-slate-50'
                  }`}
                >
                  {/* Row drag handle */}
                  <td className="px-3 py-3.5 w-8" onClick={e => e.stopPropagation()}>
                    <GripVertical className="h-4 w-4 text-slate-300 cursor-grab active:cursor-grabbing" />
                  </td>
                  {visibleCols.map(colId => renderCell(job, colId))}
                </tr>
              ))}
            </tbody>
          </table>

          {displayedJobs.length > 0 && (
            <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <p className="text-xs text-slate-400">Showing {displayedJobs.length} of {activeJobs.length} job{activeJobs.length !== 1 ? 's' : ''}</p>
              {manualOrder && <p className="text-xs text-slate-500">Custom row order active</p>}
            </div>
          )}
          </div>
          )}
        </div>

        {/* ── Past block (closed/archived jobs, shares the global search) ── */}
        <PastJobsBlock jobs={pastJobs} search={jobSearch} />
        </div>
      )}

      {/* ── Requisition chooser (front door to New Job) ──────────────────── */}
      {showReqChooser && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={() => setShowReqChooser(false)} />
          <div className="w-full max-w-2xl bg-white border-l border-slate-200 shadow-2xl flex flex-col h-full">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
              <span className="text-sm font-semibold text-slate-500">New Job</span>
              <button onClick={() => setShowReqChooser(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <RequisitionChooser
                onPick={o => { setDrawerFromOpening(o); setShowReqChooser(false); setShowDrawer(true) }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── New Job Drawer ───────────────────────────────────────────────── */}
      {showDrawer && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={() => { setShowDrawer(false); setDrawerFromOpening(null) }} />
          <div className="w-full max-w-2xl bg-white border-l border-slate-200 shadow-2xl flex flex-col h-full">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
              <span className="text-sm font-semibold text-slate-500">New Job</span>
              <button onClick={() => { setShowDrawer(false); setDrawerFromOpening(null) }} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <NewJobDrawer onClose={() => { setShowDrawer(false); setDrawerFromOpening(null) }} onCreated={fetchJobs} fromOpening={drawerFromOpening} />
            </div>
          </div>
        </div>
      )}

      {/* ── Column filter dropdown (fixed-positioned) ───────────────────── */}
      {colDropdown && (() => {
        const colDef     = ALL_COL_DEFS.find(c => c.id === colDropdown.colId)
        const isText     = colDef?.filterType === 'text'
        const opts       = colFilterOptions[colDropdown.colId as ColId] ?? []
        const selCount   = colFilters[colDropdown.colId]?.length ?? 0
        const allSel     = opts.length > 0 && selCount === opts.length
        const visOpts    = opts.filter(o => o.label.toLowerCase().includes(colFilterSearch.toLowerCase()))
        return (
          <>
            <div className="fixed inset-0 z-40" onClick={() => { setColDropdown(null); setColFilterSearch('') }} />
            <div
              className="fixed z-50 bg-white border border-slate-200 rounded-xl shadow-xl flex flex-col"
              style={{ top: colDropdown.top, left: colDropdown.left, width: 240, maxHeight: 360 }}
            >
              {isText ? (
                /* ── Text search filter (for Req #) ─────────────────── */
                <div className="p-3 space-y-2">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Search {colDef?.label}</p>
                  <input
                    value={colFilters[colDropdown.colId]?.[0] ?? ''}
                    onChange={e => {
                      const v = e.target.value
                      if (v) setColFilters(p => ({ ...p, [colDropdown.colId]: [v] }))
                      else clearColFilter(colDropdown.colId)
                    }}
                    placeholder="e.g. RS-001…"
                    autoFocus
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100 transition"
                  />
                  {selCount > 0 && (
                    <button onClick={() => clearColFilter(colDropdown.colId)} className="text-xs text-red-500 hover:text-red-700 transition-colors">
                      Clear
                    </button>
                  )}
                </div>
              ) : (
                /* ── Checkbox filter ────────────────────────────────── */
                <>
                  {/* Search input */}
                  <div className="px-3 pt-2.5 pb-2 border-b border-slate-100">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                      <input
                        value={colFilterSearch}
                        onChange={e => setColFilterSearch(e.target.value)}
                        placeholder="Search…"
                        autoFocus
                        className="w-full pl-6 pr-2 py-1 text-xs rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100 transition"
                      />
                    </div>
                  </div>

                  {/* Select all */}
                  {opts.length > 0 && (
                    <label className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 hover:bg-slate-50 cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={allSel}
                        onChange={() => allSel ? clearColFilter(colDropdown.colId) : selectAllInCol(colDropdown.colId)}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600"
                      />
                      <span className="text-xs font-semibold text-slate-600">{allSel ? 'Deselect all' : 'Select all'}</span>
                      {selCount > 0 && !allSel && (
                        <span className="text-xs text-slate-400 ml-auto">{selCount}/{opts.length}</span>
                      )}
                    </label>
                  )}

                  {/* Options list */}
                  <div className="overflow-y-auto flex-1 p-1.5 space-y-0.5">
                    {visOpts.map(opt => {
                      const selected = colFilters[colDropdown.colId]?.includes(opt.value) ?? false
                      return (
                        <label key={opt.value} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleColFilter(colDropdown.colId, opt.value)}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600"
                          />
                          {colDropdown.colId === 'status' ? (
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CONFIG[opt.value]?.color ?? ''}`}>
                              {STATUS_CONFIG[opt.value]?.icon}{opt.label}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-700 truncate">{opt.label}</span>
                          )}
                        </label>
                      )
                    })}
                    {visOpts.length === 0 && (
                      <p className="px-2 py-3 text-xs text-slate-400 text-center">No options match</p>
                    )}
                  </div>

                  {/* Clear footer */}
                  {selCount > 0 && (
                    <div className="px-3 py-2 border-t border-slate-100 flex items-center justify-between shrink-0">
                      <span className="text-xs text-slate-400">{selCount} selected</span>
                      <button onClick={() => clearColFilter(colDropdown.colId)} className="text-xs text-red-500 hover:text-red-700 transition-colors">
                        Clear
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )
      })()}

      {/* ── Column picker dropdown (fixed-positioned) ───────────────────── */}
      {showColPicker && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowColPicker(false)} />
          <div
            className="fixed z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-2 w-56"
            style={{ top: colPickerPos.top, right: colPickerPos.right }}
          >
            <p className="px-2 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Columns</p>
            {ALL_COL_DEFS.filter(c => c.id !== 'actions').map(col => (
              <label
                key={col.id}
                className={`flex items-center gap-2 px-2 py-2 rounded-lg transition-colors ${
                  col.required ? 'opacity-60 cursor-not-allowed' : 'hover:bg-slate-50 cursor-pointer'
                }`}
              >
                <input
                  type="checkbox"
                  checked={visibleCols.includes(col.id)}
                  disabled={col.required}
                  onChange={() => toggleCol(col.id)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 disabled:opacity-50"
                />
                <span className="text-sm text-slate-700">{col.label}</span>
                {col.required && <span className="text-xs text-slate-300 ml-auto">required</span>}
                {!col.defaultVisible && !visibleCols.includes(col.id) && (
                  <span className="text-xs text-slate-400 ml-auto">+ add</span>
                )}
              </label>
            ))}
            <div className="border-t border-slate-100 mt-1 pt-1">
              <button
                onClick={() => { setVisibleCols(DEFAULT_VISIBLE_COLS); try { localStorage.removeItem(LS_COLS) } catch {} }}
                className="w-full text-left px-2 py-1.5 text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
              >
                Reset to defaults
              </button>
            </div>
          </div>
        </>
      )}

      {/* Edit HM modal */}
      {editHMJob && (
        <EditHMModal
          requestId={editHMJob.id}
          initial={{
            name:  editHMJob.hiring_manager_name ?? '',
            email: editHMJob.hiring_manager_email ?? null,
            slack: editHMJob.hiring_manager_slack ?? null,
          }}
          onClose={() => setEditHMJob(null)}
          onSaved={({ name, email, slack }) => {
            setJobs(prev => prev.map(j =>
              j.id === editHMJob.id
                ? { ...j, hiring_manager_name: name, hiring_manager_email: email, hiring_manager_slack: slack }
                : j
            ))
            setEditHMJob(null)
          }}
        />
      )}
    </div>
  )
}
