'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import {
  Zap, CheckCircle, Loader2, AlertCircle,
  Upload, Link2, FileText, X, CloudUpload, ArrowRight, Sparkles,
  MapPin, Building2, Home, BarChart3, Briefcase,
} from 'lucide-react'
import { trackEvent } from '@/lib/analytics'
import { RichText } from '@/components/RichText'
import {
  ScreeningQuestion, isFieldVisible,
  type PublicScreeningField as ScreeningField,
  type AnswerValue,
} from '@/components/apply/screening-fields'

interface Branding {
  company_name: string | null
  logo_url: string | null
  brand_color: string | null
  accent_color: string | null
  brand_font: string | null
}

interface JobInfo {
  position_title: string
  department: string | null
  location: string | null
  remote_ok: boolean | null
  level: string | null
  employment_type: string | null
  generated_jd: string | null
  responsibilities: string | null
  requirements: string | null
  nice_to_have: string | null
  branding: Branding | null
  screening: { fields: ScreeningField[] }
}

const DEFAULT_BRAND = '#059669' // emerald-600 — the app's default accent

// Basic email shape check — mirrors the backend's EMAIL_REGEX. Catches
// malformed addresses (missing @, no domain, spaces); it does not verify
// that the mailbox actually exists.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// A URL with or without a scheme (e.g. "linkedin.com/in/x" or "https://…").
const URL_RE = /^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/\S*)?$/i

const isValidUrl = (s: string) => URL_RE.test(s.trim())

// Pick a legible text colour for a coloured button: dark text on light
// backgrounds, white on dark. Guards against a pale brand/accent colour
// rendering an invisible (white-on-white) button label.
function readableText(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return '#ffffff'
  const n = parseInt(m[1], 16)
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
  return lum > 150 ? '#1e293b' : '#ffffff' // 1e293b = slate-800
}

// Build the Google Fonts stylesheet URL for the chosen family.
function googleFontHref(family: string): string {
  return `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@400;500;600;700&display=swap`
}

// A single job-meta pill (department, location, work type, seniority) shown
// under the title — mirrors the tag row on modern careers pages.
function MetaChip({ icon: Icon, label }: { icon: typeof MapPin; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-slate-200 px-3.5 py-1.5 text-sm font-medium text-slate-600 shadow-sm">
      <Icon className="h-4 w-4 text-slate-400" />
      {label}
    </span>
  )
}

function JdSection({ title, body }: { title: string; body: string | null }) {
  if (!body) return null
  return (
    <section>
      <h2 className="text-sm font-bold text-slate-700 mb-2">{title}</h2>
      <RichText html={body} className="text-slate-600" />
    </section>
  )
}

type CvMode = 'upload' | 'drive'
type Tab = 'details' | 'form'

const ACCEPTED_TYPES = '.pdf,.doc,.docx'
const ACCEPTED_MIME = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

export default function ApplyPage() {
  const { token } = useParams<{ token: string }>()

  const [job, setJob] = useState<JobInfo | null>(null)
  const [loadingJob, setLoadingJob] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Which pane is showing — Job details or the Application form.
  const [tab, setTab] = useState<Tab>('details')

  // Form state
  const [name, setName]               = useState('')
  const [email, setEmail]             = useState('')
  const [phone, setPhone]             = useState('')
  const [linkedin, setLinkedin]       = useState('')
  const [coverLetter, setCoverLetter] = useState('')

  // Custom screening-question answers, keyed by field id (Phase 3c).
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({})
  const setAnswer = (id: string, value: AnswerValue) => setAnswers(prev => ({ ...prev, [id]: value }))

  // CV / resume state
  const [cvMode, setCvMode]       = useState<CvMode>('upload')
  const [cvFile, setCvFile]       = useState<File | null>(null)
  const [cvDriveUrl, setCvDriveUrl] = useState('')
  const [cvError, setCvError]     = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const driveInputRef = useRef<HTMLInputElement>(null)

  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted]   = useState(false)
  const [error, setError]           = useState('')

  // Resume autofill state. Runs as soon as a CV file is chosen: reads the
  // resume and prefills empty fields. It never overwrites what the candidate
  // has typed, and a failure is silent — they just fill the form manually.
  type AutofillStatus = 'idle' | 'reading' | 'done' | 'error'
  const [autofillStatus, setAutofillStatus] = useState<AutofillStatus>('idle')
  const [autofillFilled, setAutofillFilled] = useState<string[]>([])

  // Extra resume-parsed fields that aren't on the form (title, location,
  // skills, years) but enrich the candidate profile when the form is submitted
  // (Phase 2). Tied to the current CV; cleared when the file is removed.
  interface ParsedProfile {
    current_title: string | null
    location: string | null
    skills: string[]
    experience_years: number | null
  }
  const [parsedProfile, setParsedProfile] = useState<ParsedProfile | null>(null)

  useEffect(() => {
    fetch(`/api/apply?token=${token}`)
      .then(r => {
        if (r.status === 404) { setNotFound(true); return null }
        return r.json()
      })
      .then(j => {
        if (j) {
          setJob(j.data)
          trackEvent('apply_page_viewed', { job_title: j.data.position_title })
        }
        setLoadingJob(false)
      })
      .catch(() => { setNotFound(true); setLoadingJob(false) })
  }, [token])

  // ── File helpers ──────────────────────────────────────────────────────────
  const validateFile = (file: File): string => {
    if (!ACCEPTED_MIME.includes(file.type)) return 'Only PDF and Word (.doc/.docx) files are accepted.'
    if (file.size > 10 * 1024 * 1024) return 'File must be under 10 MB.'
    return ''
  }

  const handleFileSelect = (file: File) => {
    const err = validateFile(file)
    if (err) { setCvError(err); setCvFile(null); return }
    setCvError('')
    setCvFile(file)
    trackEvent('cv_uploaded', { file_size_kb: Math.round(file.size / 1024) })
    void runAutofill(file)
  }

  // Fill a text field only if the candidate hasn't already typed something —
  // their input always wins over the resume.
  const fillIfEmpty = (
    setter: (updater: (prev: string) => string) => void,
    value: string | null,
  ): boolean => {
    if (!value) return false
    let didFill = false
    setter(prev => {
      if (prev.trim()) return prev
      didFill = true
      return value
    })
    return didFill
  }

  const runAutofill = async (file: File) => {
    setAutofillStatus('reading')
    setAutofillFilled([])
    setParsedProfile(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('token', token)
      const res = await fetch('/api/apply/parse-cv', { method: 'POST', body: fd })
      if (!res.ok) { setAutofillStatus('idle'); return } // silent — manual entry
      const { candidate } = await res.json()
      if (!candidate) { setAutofillStatus('idle'); return }

      // Stash the extra parsed fields (not on the form) to enrich the profile
      // on submit. These were grounded server-side, so they're safe to keep.
      setParsedProfile({
        current_title: candidate.current_title ?? null,
        location: candidate.location ?? null,
        skills: Array.isArray(candidate.skills) ? candidate.skills : [],
        experience_years:
          typeof candidate.experience_years === 'number' ? candidate.experience_years : null,
      })

      const filled: string[] = []
      if (fillIfEmpty(setName, candidate.name)) filled.push('name')
      if (fillIfEmpty(setEmail, candidate.email)) filled.push('email')
      if (fillIfEmpty(setPhone, candidate.phone)) filled.push('phone')
      if (fillIfEmpty(setLinkedin, candidate.linkedin_url)) filled.push('LinkedIn')

      setAutofillFilled(filled)
      setAutofillStatus(filled.length ? 'done' : 'idle')
      if (filled.length) trackEvent('cv_autofill_used', { fields_filled: filled.length })
    } catch {
      setAutofillStatus('idle') // network hiccup — fall back to manual entry
    }
  }

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }

  // Choosing "Upload file" opens the picker straight away; "Google Drive link"
  // reveals + focuses the URL field. Both buttons now visibly *do* something.
  const chooseUpload = () => { setCvMode('upload'); setCvError(''); setTimeout(() => fileInputRef.current?.click(), 0) }
  const chooseDrive  = () => { setCvMode('drive');  setCvError(''); setTimeout(() => driveInputRef.current?.focus(), 0) }

  // ── Validation (mirrors the backend) ───────────────────────────────────────
  const emailInvalid    = email.trim() !== ''    && !EMAIL_RE.test(email.trim())
  const linkedinInvalid = linkedin.trim() !== '' && !isValidUrl(linkedin.trim())
  const resumeProvided  = (cvMode === 'upload' && !!cvFile) || (cvMode === 'drive' && isValidUrl(cvDriveUrl.trim()))
  const canSubmit =
    !submitting &&
    !!name.trim() && !!email.trim() && !emailInvalid &&
    !!phone.trim() &&
    !!linkedin.trim() && !linkedinInvalid &&
    resumeProvided

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !email.trim()) return
    if (!EMAIL_RE.test(email.trim())) { setError('Please enter a valid email address.'); return }
    if (!phone.trim())                { setError('Phone number is required.'); return }
    if (!linkedin.trim() || !isValidUrl(linkedin.trim())) { setError('Please enter a valid LinkedIn URL.'); return }
    if (!resumeProvided)              { setError('Please attach your resume — upload a file or paste a Google Drive link.'); return }

    // Only the questions currently shown (conditional logic) are submitted.
    const screeningFields = (job?.screening?.fields ?? []).filter(f => isFieldVisible(f, answers))

    // Required screening questions must be answered.
    for (const f of screeningFields) {
      if (!f.required) continue
      const v = answers[f.id]
      const empty = v == null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0)
      if (empty) { setError(`Please answer: ${f.label}`); return }
    }

    setSubmitting(true)
    setError('')

    // 1. Upload file if provided
    let finalCvUrl: string | undefined
    if (cvMode === 'upload' && cvFile) {
      const fd = new FormData()
      fd.append('file', cvFile)
      fd.append('token', token)
      try {
        const uploadRes = await fetch('/api/apply/upload', { method: 'POST', body: fd })
        const uploadJson = await uploadRes.json()
        if (!uploadRes.ok) {
          setError(uploadJson.error ?? 'Failed to upload CV. Please try again.')
          setSubmitting(false)
          return
        }
        finalCvUrl = uploadJson.url
      } catch {
        setError('Failed to upload CV. Please check your connection and try again.')
        setSubmitting(false)
        return
      }
    } else if (cvMode === 'drive' && cvDriveUrl.trim()) {
      finalCvUrl = cvDriveUrl.trim()
    }

    // 2. Submit application
    const res = await fetch('/api/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        name:         name.trim(),
        email:        email.trim(),
        phone:        phone.trim(),
        linkedin_url: linkedin.trim(),
        cover_letter: coverLetter.trim() || undefined,
        cv_url:       finalCvUrl,
        // Resume-autofill enrichment (Phase 2) — only when we actually parsed
        // the uploaded CV. Stored on the candidate profile server-side.
        current_title:    parsedProfile?.current_title || undefined,
        location:         parsedProfile?.location || undefined,
        skills:           parsedProfile?.skills.length ? parsedProfile.skills : undefined,
        experience_years: parsedProfile?.experience_years ?? undefined,
        screening_answers: screeningFields.map(f => {
          const v = answers[f.id]
          return { field_id: f.id, value: v === undefined || v === '' ? null : v }
        }),
      }),
    })
    const json = await res.json()

    if (!res.ok) {
      setError(json.error ?? 'Something went wrong. Please try again.')
      setSubmitting(false)
      return
    }

    setSubmitted(true)
    setSubmitting(false)
    trackEvent('application_submitted', {
      job_title: job!.position_title,
      has_cv: !!finalCvUrl,
      has_cover_letter: !!coverLetter.trim(),
    })
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loadingJob) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-6 w-6 text-slate-400 animate-spin" />
      </div>
    )
  }

  // ── Not found ─────────────────────────────────────────────────────────────
  if (notFound || !job) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-center px-4">
        <AlertCircle className="h-10 w-10 text-slate-300 mb-4" />
        <h1 className="text-xl font-bold text-slate-700">This link is no longer valid</h1>
        <p className="text-sm text-slate-400 mt-2">The job may have been closed or the link may have expired.</p>
      </div>
    )
  }

  // ── Submitted ─────────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-center px-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-10 max-w-md w-full">
          <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-900">Application submitted!</h1>
          <p className="text-sm text-slate-500 mt-2">
            Thanks for applying for <strong>{job.position_title}</strong>. We&apos;ll be in touch soon.
          </p>
        </div>
      </div>
    )
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  const branding = job.branding
  // The action colour for buttons / the active-tab underline. Uses the org's
  // accent colour — the primary/brand colour is often a pale page-theme colour
  // that renders an invisible button. Falls back to the app default.
  const accent = branding?.accent_color || DEFAULT_BRAND
  const accentText = readableText(accent)
  const font  = branding?.brand_font || null
  const companyName = branding?.company_name || 'RecruiterStack'

  const hasJd = !!(job.generated_jd || job.responsibilities || job.requirements || job.nice_to_have)

  // Questions shown right now — conditional questions appear only once their
  // controlling answer matches.
  const visibleScreening = job.screening.fields.filter(f => isFieldVisible(f, answers))

  const inputBase =
    'w-full rounded-xl border px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:border-transparent'
  const inputOk  = 'border-slate-200 focus:ring-emerald-500'
  const inputBad = 'border-red-300 focus:ring-red-400'

  return (
    <div
      className="min-h-screen bg-slate-50"
      style={font ? { fontFamily: `'${font}', system-ui, sans-serif` } : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      {font && <link rel="stylesheet" href={googleFontHref(font)} />}

      <main className="max-w-2xl mx-auto px-4 py-12">
        {/* ── Centered header: logo · title · meta ──────────────────────── */}
        <div className="flex flex-col items-center text-center mb-8">
          {branding?.logo_url ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={branding.logo_url}
                alt={`${companyName} logo`}
                className="mb-4 h-24 w-auto max-w-[380px] object-contain"
              />
            </>
          ) : (
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600">
                <Zap className="h-4 w-4 text-white" />
              </div>
              <span className="text-lg font-bold text-slate-900">RecruiterStack</span>
            </div>
          )}

          <h1 className="text-3xl font-bold text-slate-900">{job.position_title}</h1>
          {(job.department || job.location || job.employment_type || job.remote_ok !== null || job.level) && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {job.department && <MetaChip icon={Building2} label={job.department} />}
              {job.location && <MetaChip icon={MapPin} label={job.location} />}
              {job.employment_type && <MetaChip icon={Briefcase} label={job.employment_type} />}
              {job.remote_ok !== null && (
                <MetaChip icon={Home} label={job.remote_ok ? 'Remote' : 'On-site'} />
              )}
              {job.level && <MetaChip icon={BarChart3} label={job.level} />}
            </div>
          )}
        </div>

        {/* ── Tabs ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-center gap-8 border-b border-slate-200 mb-8">
          {hasJd && (
            <button
              onClick={() => setTab('details')}
              className={`-mb-px pb-3 text-base font-semibold transition-colors border-b-2 ${
                tab === 'details' ? 'text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
              style={tab === 'details' ? { borderColor: accent } : undefined}
            >
              Job details
            </button>
          )}
          <button
            onClick={() => setTab('form')}
            className={`-mb-px pb-3 text-base font-semibold transition-colors border-b-2 ${
              tab === 'form' ? 'text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
            style={tab === 'form' ? { borderColor: accent } : undefined}
          >
            Application form
          </button>
        </div>

        {/* ── Job details pane ──────────────────────────────────────────── */}
        {tab === 'details' && hasJd && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
              <JdSection title="About the role" body={job.generated_jd} />
              <JdSection title="What you'll do" body={job.responsibilities} />
              <JdSection title="What we're looking for" body={job.requirements} />
              <JdSection title="Nice to have" body={job.nice_to_have} />
            </div>
            <button
              onClick={() => setTab('form')}
              style={{ backgroundColor: accent, color: accentText }}
              className="w-full flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-bold text-white transition-opacity hover:opacity-90 shadow-sm"
            >
              Apply for this role <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* ── Application form pane ─────────────────────────────────────── */}
        {tab === 'form' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
            <h2 className="text-lg font-bold text-slate-900 mb-6">Apply for this role</h2>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* ── Autofill from resume ──────────────────────────────────── */}
              <div
                className={`rounded-xl border-2 border-dashed px-4 py-3.5 transition-colors ${
                  autofillStatus === 'done'
                    ? 'border-emerald-300 bg-emerald-50/60'
                    : 'border-slate-300 bg-slate-50'
                }`}
              >
                {autofillStatus === 'reading' ? (
                  <div className="flex items-center gap-2.5 text-sm text-slate-600">
                    <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                    Reading your resume and filling in your details…
                  </div>
                ) : autofillStatus === 'done' ? (
                  <div className="flex items-center gap-2.5">
                    <CheckCircle className="h-4 w-4 shrink-0 text-emerald-600" />
                    <p className="text-sm text-slate-700">
                      Filled in your {autofillFilled.join(', ')} from your resume.{' '}
                      <span className="text-slate-500">Please review everything below before submitting.</span>
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <Sparkles className="h-4 w-4 shrink-0 text-slate-400" />
                      <div>
                        <p className="text-sm font-semibold text-slate-700">Autofill from resume</p>
                        <p className="text-xs text-slate-500">
                          Upload your CV and we&apos;ll fill in the form for you. PDF or Word.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={chooseUpload}
                      className="shrink-0 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      Upload file
                    </button>
                  </div>
                )}
              </div>

              {/* Name + Email */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Jane Smith"
                    className={`${inputBase} ${inputOk}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="jane@example.com"
                    aria-invalid={emailInvalid}
                    className={`${inputBase} ${emailInvalid ? inputBad : inputOk}`}
                  />
                  {emailInvalid && (
                    <p className="mt-1.5 text-xs text-red-600">That doesn&apos;t look like a valid email address.</p>
                  )}
                </div>
              </div>

              {/* Phone + LinkedIn — both required */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Phone <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className={`${inputBase} ${inputOk}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    LinkedIn Profile <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    type="url"
                    value={linkedin}
                    onChange={e => setLinkedin(e.target.value)}
                    placeholder="https://linkedin.com/in/…"
                    aria-invalid={linkedinInvalid}
                    className={`${inputBase} ${linkedinInvalid ? inputBad : inputOk}`}
                  />
                  {linkedinInvalid && (
                    <p className="mt-1.5 text-xs text-red-600">Enter a valid URL (e.g. linkedin.com/in/you).</p>
                  )}
                </div>
              </div>

              {/* ── Resume / CV — required ──────────────────────────────── */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Resume / CV <span className="text-red-500">*</span>
                </label>

                {/* Mode toggle — each button actually does something now */}
                <div className="flex rounded-xl border border-slate-200 overflow-hidden mb-3 w-fit">
                  <button
                    type="button"
                    onClick={chooseUpload}
                    className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold transition-colors ${
                      cvMode === 'upload' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Upload file
                  </button>
                  <button
                    type="button"
                    onClick={chooseDrive}
                    className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold transition-colors border-l border-slate-200 ${
                      cvMode === 'drive' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    Google Drive link
                  </button>
                </div>

                {/* Upload from computer */}
                {cvMode === 'upload' && (
                  cvFile ? (
                    <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                      <FileText className="h-5 w-5 text-emerald-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{cvFile.name}</p>
                        <p className="text-xs text-slate-500">{(cvFile.size / 1024).toFixed(0)} KB</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setCvFile(null); setCvError(''); setParsedProfile(null); setAutofillStatus('idle') }}
                        className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white/60 transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={handleFileDrop}
                      className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 cursor-pointer transition-colors ${
                        isDragging ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-slate-50 hover:border-emerald-300 hover:bg-emerald-50/40'
                      }`}
                    >
                      <CloudUpload className={`h-8 w-8 ${isDragging ? 'text-blue-500' : 'text-slate-300'}`} />
                      <div className="text-center">
                        <p className="text-sm font-semibold text-slate-700">
                          Click to upload <span className="text-slate-400 font-normal">or drag &amp; drop</span>
                        </p>
                        <p className="text-xs text-slate-400 mt-1">PDF, DOC, DOCX · max 10 MB</p>
                      </div>
                    </div>
                  )
                )}

                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_TYPES}
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) handleFileSelect(file)
                    e.target.value = ''
                  }}
                />

                {/* Google Drive URL */}
                {cvMode === 'drive' && (
                  <div>
                    <input
                      ref={driveInputRef}
                      type="url"
                      value={cvDriveUrl}
                      onChange={e => setCvDriveUrl(e.target.value)}
                      placeholder="https://drive.google.com/file/d/…"
                      className={`${inputBase} ${cvDriveUrl.trim() !== '' && !isValidUrl(cvDriveUrl.trim()) ? inputBad : inputOk}`}
                    />
                    <p className="text-xs text-slate-400 mt-1.5">
                      Paste a shareable Google Drive link to your CV/resume.
                    </p>
                  </div>
                )}

                {/* CV error */}
                {cvError && (
                  <div className="flex items-center gap-2 mt-2 rounded-xl bg-red-50 border border-red-200 px-4 py-2.5">
                    <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                    <p className="text-xs text-red-700">{cvError}</p>
                  </div>
                )}
              </div>

              {/* Cover Letter */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Cover Letter / Why are you a great fit?
                </label>
                <textarea
                  value={coverLetter}
                  onChange={e => setCoverLetter(e.target.value)}
                  rows={5}
                  placeholder="Tell us a bit about yourself and why you're excited about this role…"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                />
              </div>

              {/* Custom screening questions (Phase 3c) — conditional ones (3d) appear only when shown */}
              {visibleScreening.length > 0 && (
                <div className="space-y-5 pt-2 border-t border-slate-100">
                  <h3 className="text-sm font-bold text-slate-900">Additional questions</h3>
                  {visibleScreening.map(f => (
                    <ScreeningQuestion key={f.id} field={f} value={answers[f.id]} onChange={v => setAnswer(f.id, v)} />
                  ))}
                </div>
              )}

              {/* Submission error */}
              {error && (
                <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                  <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                style={{ backgroundColor: accent, color: accentText }}
                className="w-full flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60 shadow-sm"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitting ? 'Submitting…' : 'Submit Application'}
              </button>
            </form>
          </div>
        )}

        <p className="text-center text-xs text-slate-400 mt-6">
          Powered by RecruiterStack
        </p>
      </main>
    </div>
  )
}
