'use client'

import { useState } from 'react'
import { Zap, X, Eye } from 'lucide-react'
import { RichText } from '@/components/RichText'
import {
  ScreeningQuestion, isFieldVisible,
  type PublicScreeningField, type AnswerValue,
} from '@/components/apply/screening-fields'

// Branding pulled from org_settings (same fields the live apply page uses).
export interface PreviewBranding {
  company_name: string | null
  logo_url: string | null
  brand_color: string | null
  accent_color: string | null
  brand_font: string | null
}

// The job content shown above the form — mirrors the live apply page's mapping
// (title, department, and the JD's structured sections).
export interface PreviewJobInfo {
  position_title: string
  department: string | null
  location: string | null
  generated_jd: string | null      // "About the role"
  responsibilities: string | null  // "What you'll do"
  requirements: string | null      // "What we're looking for"
  nice_to_have: string | null      // "Nice to have"
}

const DEFAULT_BRAND = '#059669' // emerald-600 — the app's default accent

// Sample (disabled) styling for the always-collected built-in fields. The real
// custom questions below use the live, editable styling from the shared module.
const SAMPLE_INPUT_CLASS =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-400'

function googleFontHref(family: string): string {
  return `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@400;500;600;700&display=swap`
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

function SampleField({ label, placeholder, required }: { label: string; placeholder: string; required?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-slate-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input disabled placeholder={placeholder} className={SAMPLE_INPUT_CLASS} />
    </div>
  )
}

// Full-fidelity, on-brand preview of the candidate application form. Renders the
// same header/JD/built-in fields/submit chrome as the live apply page, and the
// custom questions via the exact same renderer (`ScreeningQuestion`) — so what
// you see here is what a candidate sees. Conditional show/hide logic is live:
// answer a controlling question and dependent questions appear. Nothing submits.
export function BrandedApplyPreview({
  job, branding, fields, onClose,
}: {
  job: PreviewJobInfo
  branding: PreviewBranding | null
  fields: PublicScreeningField[]
  onClose: () => void
}) {
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({})
  const setAnswer = (id: string, v: AnswerValue) => setAnswers(prev => ({ ...prev, [id]: v }))

  const brand = branding?.brand_color || DEFAULT_BRAND
  const font  = branding?.brand_font || null
  const visibleScreening = fields.filter(f => isFieldVisible(f, answers))

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60" role="dialog" aria-modal="true">
      {/* Preview chrome bar — makes clear this is a preview, not the live page */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-slate-900 px-4 py-2.5 text-white">
        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
          <Eye className="h-3.5 w-3.5" /> Candidate preview — exactly what applicants see
        </span>
        <button onClick={onClose} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm hover:bg-white/10">
          <X className="h-4 w-4" /> Close
        </button>
      </div>

      <div
        className="min-h-full bg-slate-50 pb-16"
        style={font ? { fontFamily: `'${font}', system-ui, sans-serif` } : undefined}
      >
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        {font && <link rel="stylesheet" href={googleFontHref(font)} />}

        {/* Header — the company's logo + name when set, else RecruiterStack */}
        <header className="bg-white border-b border-slate-200 py-4 px-6">
          <div className="max-w-2xl mx-auto flex items-center gap-2.5">
            {branding?.logo_url ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={branding.logo_url}
                  alt={`${branding.company_name ?? 'Company'} logo`}
                  className="h-7 w-auto max-w-[140px] rounded object-contain"
                />
                {branding.company_name && (
                  <span className="text-sm font-bold text-slate-900">{branding.company_name}</span>
                )}
              </>
            ) : branding?.company_name ? (
              <span className="text-sm font-bold text-slate-900">{branding.company_name}</span>
            ) : (
              <>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600">
                  <Zap className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="text-sm font-bold text-slate-900">RecruiterStack</span>
              </>
            )}
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4 py-10">
          {/* Job info */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-900">{job.position_title || 'Untitled role'}</h1>
            <div className="flex flex-wrap items-center gap-3 mt-2">
              {job.department && <span className="text-sm text-slate-500">{job.department}</span>}
              {job.location && (
                <>
                  {job.department && <span className="text-slate-300">·</span>}
                  <span className="text-sm text-slate-500">{job.location}</span>
                </>
              )}
            </div>
          </div>

          {/* JD — structured sections */}
          {(job.generated_jd || job.responsibilities || job.requirements || job.nice_to_have) && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-8 space-y-6">
              <JdSection title="About the role" body={job.generated_jd} />
              <JdSection title="What you'll do" body={job.responsibilities} />
              <JdSection title="What we're looking for" body={job.requirements} />
              <JdSection title="Nice to have" body={job.nice_to_have} />
            </div>
          )}

          {/* Application form */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
            <h2 className="text-lg font-bold text-slate-900 mb-6">Apply for this role</h2>

            <div className="space-y-5">
              {/* Built-in fields — always collected; shown as samples in preview */}
              <div className="grid grid-cols-2 gap-4">
                <SampleField label="Full Name" required placeholder="Jane Smith" />
                <SampleField label="Email" required placeholder="jane@example.com" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <SampleField label="Phone" placeholder="+1 (555) 000-0000" />
                <SampleField label="LinkedIn Profile" placeholder="https://linkedin.com/in/…" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Resume / CV</label>
                <div className="flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-7 text-center">
                  <p className="text-sm font-semibold text-slate-400">Drag &amp; drop or browse</p>
                  <p className="text-xs text-slate-400">PDF, DOC, DOCX · max 10 MB</p>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Cover Letter / Why are you a great fit?
                </label>
                <textarea disabled rows={4} placeholder="Tell us a bit about yourself…" className={`${SAMPLE_INPUT_CLASS} resize-none`} />
              </div>

              <p className="text-[11px] text-slate-400">
                ↑ These built-in fields are always collected. Your custom questions appear below.
              </p>

              {/* Custom screening questions — same renderer + conditional logic as the live form */}
              {visibleScreening.length > 0 && (
                <div className="space-y-5 pt-2 border-t border-slate-100">
                  <h3 className="text-sm font-bold text-slate-900">Additional questions</h3>
                  {visibleScreening.map(f => (
                    <ScreeningQuestion key={f.id} field={f} value={answers[f.id]} onChange={v => setAnswer(f.id, v)} />
                  ))}
                </div>
              )}

              {/* Submit — branded, but disabled in preview */}
              <button
                type="button"
                disabled
                style={{ backgroundColor: brand }}
                className="w-full rounded-xl px-6 py-3.5 text-sm font-bold text-white opacity-70 cursor-not-allowed shadow-sm"
              >
                Submit Application
              </button>
              <p className="text-center text-[11px] text-slate-400">Preview only — submission is disabled.</p>
            </div>
          </div>

          <p className="text-center text-xs text-slate-400 mt-6">Powered by RecruiterStack</p>
        </main>
      </div>
    </div>
  )
}
