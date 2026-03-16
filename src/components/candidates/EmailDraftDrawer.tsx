'use client'

import { useState } from 'react'
import { Wand2, X, Copy, CheckCheck, Loader2 } from 'lucide-react'
import { useSettings } from '@/lib/hooks/useSettings'

type EmailTemplate = 'interview_invite' | 'rejection' | 'offer' | 'followup'

const EMAIL_TEMPLATES: { id: EmailTemplate; label: string; desc: string }[] = [
  { id: 'interview_invite', label: 'Interview Invite',  desc: 'Invite candidate to next interview round' },
  { id: 'followup',         label: 'Follow-up',         desc: 'Check in after application or interview'  },
  { id: 'offer',            label: 'Job Offer',         desc: 'Congratulate and extend an offer'         },
  { id: 'rejection',        label: 'Rejection',         desc: 'Respectfully close their application'     },
]

interface EmailDraftDrawerProps {
  appId: string
  onClose: () => void
}

export default function EmailDraftDrawer({ appId, onClose }: EmailDraftDrawerProps) {
  const { settings } = useSettings()
  const [template, setTemplate] = useState<EmailTemplate>('interview_invite')
  const [generating, setGenerating] = useState(false)
  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const generate = async () => {
    setGenerating(true); setError(''); setDraft(null)
    const res = await fetch(`/api/applications/${appId}/email-draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template,
        recruiter_name:  settings.recruiter_name  || undefined,
        recruiter_title: settings.recruiter_title || undefined,
        company_name:    settings.company_name    || undefined,
      }),
    })
    const json = await res.json()
    if (!res.ok) { setError(json.error ?? 'Generation failed'); setGenerating(false); return }
    setDraft(json.data)
    setGenerating(false)
  }

  const copyAll = () => {
    if (!draft) return
    navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-violet-500" />
            <h2 className="text-base font-bold text-slate-900">AI Email Draft</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Template selector */}
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2">Email type</p>
            <div className="grid grid-cols-2 gap-2">
              {EMAIL_TEMPLATES.map(t => (
                <button
                  key={t.id}
                  onClick={() => { setTemplate(t.id); setDraft(null); setError('') }}
                  className={`rounded-xl border px-3 py-2.5 text-left transition-all ${
                    template === t.id
                      ? 'border-violet-400 bg-violet-50 ring-1 ring-violet-300'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <p className={`text-xs font-semibold ${template === t.id ? 'text-violet-700' : 'text-slate-700'}`}>{t.label}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Recruiter context hint */}
          {(!settings.recruiter_name && !settings.company_name) && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-700">
              Tip: Add your name and company in{' '}
              <a href="/settings" className="font-semibold underline">Settings</a>{' '}
              for more personalised drafts.
            </div>
          )}

          {/* Generate button */}
          <button
            onClick={generate}
            disabled={generating}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60 transition-colors"
          >
            {generating
              ? <><Loader2 className="h-4 w-4 animate-spin" />Generating…</>
              : <><Wand2 className="h-4 w-4" />Generate Draft</>
            }
          </button>

          {/* Error */}
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Draft output */}
          {draft && (
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Subject</p>
                <p className="text-sm font-medium text-slate-800">{draft.subject}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Body</p>
                <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{draft.body}</p>
              </div>
              <button
                onClick={copyAll}
                className={`flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all ${
                  copied
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {copied ? <><CheckCheck className="h-4 w-4" />Copied!</> : <><Copy className="h-4 w-4" />Copy to Clipboard</>}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
