'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { UploadCloud, FileText, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import type { Candidate, CandidateStatus } from '@/lib/types/database'
import { inputCls } from '@/lib/ui/styles'

interface CandidateFormProps {
  candidate?: Candidate
  onSuccess: () => void
}

const STATUS_OPTIONS: CandidateStatus[] = [
  'active', 'on_hold', 'inactive', 'interviewing', 'offer_extended', 'hired', 'rejected',
]

const STATUS_LABELS: Record<CandidateStatus, string> = {
  active: 'Active',
  on_hold: 'On Hold',
  inactive: 'Inactive',
  interviewing: 'Interviewing',
  offer_extended: 'Offer Extended',
  hired: 'Hired',
  rejected: 'Rejected',
}

export function CandidateForm({ candidate, onSuccess }: CandidateFormProps) {
  const router = useRouter()
  const isEdit = !!candidate
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    name: candidate?.name ?? '',
    email: candidate?.email ?? '',
    phone: candidate?.phone ?? '',
    current_title: candidate?.current_title ?? '',
    location: candidate?.location ?? '',
    experience_years: candidate?.experience_years ?? 0,
    skills: candidate?.skills.join(', ') ?? '',
    status: (candidate?.status ?? 'active') as CandidateStatus,
    resume_url: candidate?.resume_url ?? '',
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Resume parsing state
  const [parseState, setParseState] = useState<'idle' | 'parsing' | 'done' | 'error'>('idle')
  const [parseError, setParseError] = useState<string | null>(null)
  const [parsedFileName, setParsedFileName] = useState<string | null>(null)

  const set = (key: keyof typeof form, value: string | number) =>
    setForm((f) => ({ ...f, [key]: value }))

  const handleResumeSelect = async (file: File) => {
    if (file.type !== 'application/pdf') {
      setParseError('Please upload a PDF file.')
      setParseState('error')
      return
    }

    setParseState('parsing')
    setParseError(null)
    setParsedFileName(file.name)

    const fd = new FormData()
    fd.append('file', file)

    const res = await fetch('/api/resume/parse', { method: 'POST', body: fd })
    const json = await res.json()

    if (!res.ok) {
      setParseError(json.error ?? 'Failed to parse resume.')
      setParseState('error')
      return
    }

    const p = json.parsed ?? {}
    setForm((f) => ({
      ...f,
      name:             p.name             ?? f.name,
      email:            p.email            ?? f.email,
      phone:            p.phone            ?? f.phone,
      current_title:    p.current_title    ?? f.current_title,
      location:         p.location         ?? f.location,
      experience_years: p.experience_years ?? f.experience_years,
      skills:           Array.isArray(p.skills) ? p.skills.join(', ') : f.skills,
      resume_url:       json.resume_path   ?? f.resume_url,
    }))
    setParseState('done')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const payload = {
      ...form,
      experience_years: Number(form.experience_years),
      skills: form.skills
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      phone: form.phone || null,
      current_title: form.current_title || null,
      location: form.location || null,
      resume_url: form.resume_url || null,
    }

    const url = isEdit ? `/api/candidates/${candidate.id}` : '/api/candidates'
    const method = isEdit ? 'PATCH' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    setLoading(false)

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Something went wrong')
      return
    }

    router.refresh()
    onSuccess()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Resume upload */}
      <div>
        <label htmlFor="candidate-resume" className="block text-xs font-semibold text-slate-500 mb-1.5">
          Resume <span className="text-slate-400 font-normal">(PDF — auto-fills fields below)</span>
        </label>

        {parseState === 'idle' || parseState === 'error' ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center hover:border-blue-300 hover:bg-blue-50 transition-colors"
          >
            <UploadCloud className="h-6 w-6 text-slate-300 mx-auto mb-1.5" />
            <p className="text-sm text-slate-400">Click to upload PDF</p>
            {parseState === 'error' && parseError && (
              <p className="mt-1.5 text-xs text-red-500 flex items-center justify-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" /> {parseError}
              </p>
            )}
          </button>
        ) : parseState === 'parsing' ? (
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
            <Loader2 className="h-5 w-5 text-blue-500 animate-spin shrink-0" />
            <div>
              <p className="text-sm font-medium text-slate-700">Parsing resume…</p>
              <p className="text-xs text-slate-400">{parsedFileName}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />
              <div>
                <p className="text-sm font-medium text-emerald-800">Resume parsed — fields auto-filled</p>
                <p className="text-xs text-emerald-600 flex items-center gap-1 mt-0.5">
                  <FileText className="h-3 w-3" /> {parsedFileName}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setParseState('idle'); setParsedFileName(null) }}
              className="text-xs text-emerald-600 hover:text-emerald-800 underline"
            >
              Replace
            </button>
          </div>
        )}

        <input
          id="candidate-resume"
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleResumeSelect(f)
            e.target.value = ''
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label htmlFor="candidate-name" className="block text-xs font-semibold text-slate-500 mb-1.5">
            Full Name <span className="text-red-500">*</span>
          </label>
          <input
            id="candidate-name"
            required
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Alex Rivera"
            className={inputCls}
          />
        </div>

        <div className="col-span-2">
          <label htmlFor="candidate-email" className="block text-xs font-semibold text-slate-500 mb-1.5">
            Email <span className="text-red-500">*</span>
          </label>
          <input
            id="candidate-email"
            required
            type="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            placeholder="alex@example.com"
            className={inputCls}
          />
        </div>

        <div>
          <label htmlFor="candidate-phone" className="block text-xs font-semibold text-slate-500 mb-1.5">Phone</label>
          <input
            id="candidate-phone"
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            placeholder="+1-555-0101"
            className={inputCls}
          />
        </div>

        <div>
          <label htmlFor="candidate-experience" className="block text-xs font-semibold text-slate-500 mb-1.5">
            Experience (years)
          </label>
          <input
            id="candidate-experience"
            type="number"
            min={0}
            value={form.experience_years}
            onChange={(e) => set('experience_years', e.target.value)}
            className={inputCls}
          />
        </div>

        <div className="col-span-2">
          <label htmlFor="candidate-title" className="block text-xs font-semibold text-slate-500 mb-1.5">
            Current Title
          </label>
          <input
            id="candidate-title"
            value={form.current_title}
            onChange={(e) => set('current_title', e.target.value)}
            placeholder="Senior Software Engineer"
            className={inputCls}
          />
        </div>

        <div className="col-span-2">
          <label htmlFor="candidate-location" className="block text-xs font-semibold text-slate-500 mb-1.5">Location</label>
          <input
            id="candidate-location"
            value={form.location}
            onChange={(e) => set('location', e.target.value)}
            placeholder="Remote, New York, etc."
            className={inputCls}
          />
        </div>

        <div className="col-span-2">
          <label htmlFor="candidate-skills" className="block text-xs font-semibold text-slate-500 mb-1.5">
            Skills{' '}
            <span className="text-slate-400 font-normal">(comma-separated)</span>
          </label>
          <input
            id="candidate-skills"
            value={form.skills}
            onChange={(e) => set('skills', e.target.value)}
            placeholder="TypeScript, React, Node.js, AWS"
            className={inputCls}
          />
        </div>

        <div className="col-span-2">
          <label htmlFor="candidate-status" className="block text-xs font-semibold text-slate-500 mb-1.5">Status</label>
          <select
            id="candidate-status"
            value={form.status}
            onChange={(e) => set('status', e.target.value)}
            className={inputCls}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={loading || parseState === 'parsing'}
          className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {loading ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Candidate'}
        </button>
      </div>
    </form>
  )
}
