'use client'

import { useState } from 'react'
import { Wand2, X, Send, Loader2, Check, ChevronLeft } from 'lucide-react'
import { useSettings } from '@/lib/hooks/useSettings'

type EmailTemplate = 'interview_invite' | 'rejection' | 'offer' | 'followup'

const EMAIL_TEMPLATES: { id: EmailTemplate; label: string; desc: string; emoji: string }[] = [
  { id: 'interview_invite', label: 'Interview Invite',  emoji: '📅', desc: 'Invite to the next interview round'  },
  { id: 'followup',         label: 'Follow-up',         emoji: '👋', desc: 'Check in after application or interview' },
  { id: 'offer',            label: 'Job Offer',         emoji: '🎉', desc: 'Congratulate and extend an offer'   },
  { id: 'rejection',        label: 'Rejection',         emoji: '💌', desc: 'Respectfully close their application' },
]

interface EmailDraftDrawerProps {
  appId: string
  candidateEmail: string
  candidateName: string
  onClose: () => void
  onSent?: () => void
}

type Step = 'pick' | 'compose' | 'sent'

export default function EmailDraftDrawer({
  appId,
  candidateEmail,
  candidateName,
  onClose,
  onSent,
}: EmailDraftDrawerProps) {
  const { settings } = useSettings()

  const [step,      setStep]      = useState<Step>('pick')
  const [template,  setTemplate]  = useState<EmailTemplate>('interview_invite')

  const [generating, setGenerating] = useState(false)
  const [genError,   setGenError]   = useState('')

  const [subject, setSubject] = useState('')
  const [body,    setBody]    = useState('')

  const [sending,   setSending]   = useState(false)
  const [sendError, setSendError] = useState('')

  // ── Generate draft ─────────────────────────────────────────────────────────

  const generate = async () => {
    setGenerating(true); setGenError('')
    const res = await fetch(`/api/applications/${appId}/email-draft`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template,
        recruiter_name:  settings.recruiter_name  || undefined,
        recruiter_title: settings.recruiter_title || undefined,
        company_name:    settings.company_name    || undefined,
      }),
    })
    const json = await res.json()
    setGenerating(false)
    if (!res.ok) { setGenError(json.error ?? 'Generation failed'); return }
    setSubject(json.data.subject)
    setBody(json.data.body)
    setStep('compose')
  }

  // ── Send email ─────────────────────────────────────────────────────────────

  const send = async () => {
    if (!subject.trim() || !body.trim()) { setSendError('Subject and body are required.'); return }
    setSending(true); setSendError('')
    const res = await fetch(`/api/applications/${appId}/send-email`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject:   subject.trim(),
        body:      body.trim(),
        from_name: settings.recruiter_name || undefined,
      }),
    })
    const json = await res.json()
    setSending(false)
    if (!res.ok) { setSendError(json.error ?? 'Failed to send email'); return }
    setStep('sent')
    onSent?.()
  }

  const fromName  = settings.recruiter_name || 'RecruiterStack'
  const firstName = candidateName.split(' ')[0] || candidateName

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
          <div className="flex items-center gap-2">
            {step === 'compose' && (
              <button
                onClick={() => { setStep('pick'); setGenError('') }}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <Wand2 className="h-5 w-5 text-violet-500" />
            <h2 className="text-base font-bold text-slate-900">
              {step === 'sent' ? 'Email Sent' : 'AI Email Draft'}
            </h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Pick template ──────────────────────────────────────────────────── */}
        {step === 'pick' && (
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* To */}
            <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">To</p>
              <p className="text-sm font-medium text-slate-800">
                {firstName} <span className="font-normal text-slate-500">&lt;{candidateEmail}&gt;</span>
              </p>
            </div>

            {/* Template grid */}
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">What type of email?</p>
              <div className="grid grid-cols-2 gap-2">
                {EMAIL_TEMPLATES.map(t => (
                  <button
                    key={t.id}
                    onClick={() => { setTemplate(t.id); setGenError('') }}
                    className={`rounded-xl border px-3 py-3 text-left transition-all ${
                      template === t.id
                        ? 'border-violet-400 bg-violet-50 ring-1 ring-violet-300'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <p className="text-lg mb-1">{t.emoji}</p>
                    <p className={`text-xs font-semibold ${template === t.id ? 'text-violet-700' : 'text-slate-700'}`}>{t.label}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{t.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Settings nudge */}
            {(!settings.recruiter_name && !settings.company_name) && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-700">
                Tip: Add your name and company in{' '}
                <a href="/settings" className="font-semibold underline">Settings</a>{' '}
                for more personalised emails.
              </div>
            )}

            {genError && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{genError}</div>
            )}

            <button
              onClick={generate}
              disabled={generating}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60 transition-colors"
            >
              {generating
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
                : <><Wand2 className="h-4 w-4" /> Generate Draft</>}
            </button>
          </div>
        )}

        {/* ── Compose & send ────────────────────────────────────────────────── */}
        {step === 'compose' && (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {/* From / To header */}
              <div className="rounded-xl bg-slate-50 border border-slate-100 divide-y divide-slate-100">
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 w-8 shrink-0">From</span>
                  <span className="text-xs text-slate-600 truncate">{fromName}</span>
                </div>
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 w-8 shrink-0">To</span>
                  <span className="text-xs font-medium text-slate-800 truncate">
                    {firstName} <span className="font-normal text-slate-500">&lt;{candidateEmail}&gt;</span>
                  </span>
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Subject</label>
                <input
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-colors"
                />
              </div>

              {/* Body */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-500">Message</label>
                  <button
                    onClick={() => { setStep('pick'); setGenError('') }}
                    className="flex items-center gap-1 text-[10px] font-medium text-violet-600 hover:text-violet-800 transition-colors"
                  >
                    <Wand2 className="h-2.5 w-2.5" /> Regenerate
                  </button>
                </div>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  rows={14}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700 leading-relaxed outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 resize-none transition-colors"
                />
              </div>

              {sendError && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{sendError}</div>
              )}
            </div>

            <div className="flex items-center gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/60 shrink-0">
              <button
                onClick={() => setStep('pick')}
                className="flex-none rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-white transition-colors"
              >
                Back
              </button>
              <button
                onClick={send}
                disabled={sending || !subject.trim() || !body.trim()}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60"
              >
                {sending
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                  : <><Send className="h-4 w-4" /> Send Email</>}
              </button>
            </div>
          </>
        )}

        {/* ── Sent confirmation ─────────────────────────────────────────────── */}
        {step === 'sent' && (
          <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-5">
            <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center">
              <Check className="h-7 w-7 text-emerald-600" />
            </div>
            <div>
              <p className="text-base font-bold text-slate-900 mb-1">Email sent!</p>
              <p className="text-sm text-slate-500">
                Your email to <span className="font-medium text-slate-700">{firstName}</span> has been delivered.
              </p>
              <p className="text-xs text-slate-400 mt-1">{candidateEmail}</p>
            </div>
            <div className="w-full rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-left">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Subject</p>
              <p className="text-sm font-medium text-slate-700">{subject}</p>
            </div>
            <button
              onClick={onClose}
              className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
            >
              Done
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
