'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import {
  Zap, CheckCircle, Loader2, AlertCircle,
  Upload, Link2, FileText, X, CloudUpload,
} from 'lucide-react'

interface JobInfo {
  position_title: string
  department: string | null
  location: string | null
  generated_jd: string | null
}

type CvMode = 'upload' | 'drive'

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

  // Form state
  const [name, setName]               = useState('')
  const [email, setEmail]             = useState('')
  const [phone, setPhone]             = useState('')
  const [linkedin, setLinkedin]       = useState('')
  const [coverLetter, setCoverLetter] = useState('')

  // CV / resume state
  const [cvMode, setCvMode]       = useState<CvMode>('upload')
  const [cvFile, setCvFile]       = useState<File | null>(null)
  const [cvDriveUrl, setCvDriveUrl] = useState('')
  const [cvError, setCvError]     = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted]   = useState(false)
  const [error, setError]           = useState('')

  useEffect(() => {
    fetch(`/api/apply?token=${token}`)
      .then(r => {
        if (r.status === 404) { setNotFound(true); return null }
        return r.json()
      })
      .then(j => {
        if (j) setJob(j.data)
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
  }

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !email.trim()) return
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
        phone:        phone.trim() || undefined,
        linkedin_url: linkedin.trim() || undefined,
        cover_letter: coverLetter.trim() || undefined,
        cv_url:       finalCvUrl,
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
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 py-4 px-6">
        <div className="max-w-2xl mx-auto flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600">
            <Zap className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-sm font-bold text-slate-900">RecruiterStack</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-10">
        {/* Job info */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">{job.position_title}</h1>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            {job.department && (
              <span className="text-sm text-slate-500">{job.department}</span>
            )}
            {job.location && (
              <>
                {job.department && <span className="text-slate-300">·</span>}
                <span className="text-sm text-slate-500">{job.location}</span>
              </>
            )}
          </div>
        </div>

        {/* JD */}
        {job.generated_jd && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-8">
            <h2 className="text-sm font-bold text-slate-700 mb-3">About the role</h2>
            <div className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
              {job.generated_jd}
            </div>
          </div>
        )}

        {/* Application form */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <h2 className="text-lg font-bold text-slate-900 mb-6">Apply for this role</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
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
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Phone + LinkedIn */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Phone</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">LinkedIn Profile</label>
                <input
                  type="url"
                  value={linkedin}
                  onChange={e => setLinkedin(e.target.value)}
                  placeholder="https://linkedin.com/in/…"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* ── Resume / CV ────────────────────────────────────────────── */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Resume / CV
              </label>

              {/* Mode toggle */}
              <div className="flex rounded-xl border border-slate-200 overflow-hidden mb-3 w-fit">
                <button
                  type="button"
                  onClick={() => { setCvMode('upload'); setCvError('') }}
                  className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold transition-colors ${
                    cvMode === 'upload'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload file
                </button>
                <button
                  type="button"
                  onClick={() => { setCvMode('drive'); setCvError('') }}
                  className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold transition-colors border-l border-slate-200 ${
                    cvMode === 'drive'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Link2 className="h-3.5 w-3.5" />
                  Google Drive link
                </button>
              </div>

              {/* Upload from computer */}
              {cvMode === 'upload' && (
                cvFile ? (
                  /* File selected — show name + remove */
                  <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <FileText className="h-5 w-5 text-emerald-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{cvFile.name}</p>
                      <p className="text-xs text-slate-500">{(cvFile.size / 1024).toFixed(0)} KB</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setCvFile(null); setCvError('') }}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white/60 transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  /* Drop zone */
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleFileDrop}
                    className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 cursor-pointer transition-colors ${
                      isDragging
                        ? 'border-blue-400 bg-blue-50'
                        : 'border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/40'
                    }`}
                  >
                    <CloudUpload className={`h-8 w-8 ${isDragging ? 'text-blue-500' : 'text-slate-300'}`} />
                    <div className="text-center">
                      <p className="text-sm font-semibold text-slate-700">
                        Drag & drop or{' '}
                        <span className="text-blue-600 underline underline-offset-2">browse</span>
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
                    type="url"
                    value={cvDriveUrl}
                    onChange={e => setCvDriveUrl(e.target.value)}
                    placeholder="https://drive.google.com/file/d/…"
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>

            {/* Submission error */}
            {error && (
              <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !name.trim() || !email.trim()}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-bold text-white hover:bg-blue-700 transition-colors disabled:opacity-60 shadow-sm"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? 'Submitting…' : 'Submit Application'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Powered by RecruiterStack
        </p>
      </main>
    </div>
  )
}
