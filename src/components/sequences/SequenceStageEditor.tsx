'use client'

import { useState } from 'react'
import { X, Loader2, User, Clock } from 'lucide-react'
import type { SequenceStage } from '@/lib/types/database'

const TOKENS = [
  { token: '{{candidate_first_name}}', label: 'First Name' },
  { token: '{{candidate_name}}',       label: 'Full Name' },
  { token: '{{candidate_title}}',      label: 'Title' },
  { token: '{{candidate_company}}',    label: 'Company' },
  { token: '{{candidate_location}}',   label: 'Location' },
  { token: '{{job_title}}',            label: 'Job Title' },
  { token: '{{company_name}}',         label: 'Company Name' },
  { token: '{{recruiter_name}}',       label: 'Recruiter' },
]

interface Props {
  sequenceId: string
  stage?: SequenceStage | null   // null = create mode
  stageCount: number             // for default order_index
  onClose: () => void
  onSaved: () => void
}

export default function SequenceStageEditor({ sequenceId, stage, stageCount, onClose, onSaved }: Props) {
  const isEdit = !!stage

  const [subject, setSubject]         = useState(stage?.subject ?? '')
  const [body, setBody]               = useState(stage?.body ?? '')
  const [delayDays, setDelayDays]     = useState(stage?.delay_days ?? 3)
  const [soboName, setSoboName]       = useState(stage?.send_on_behalf_of ?? '')
  const [soboEmail, setSoboEmail]     = useState(stage?.send_on_behalf_email ?? '')
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')

  const insertToken = (token: string, target: 'subject' | 'body') => {
    if (target === 'subject') setSubject(prev => prev + token)
    else setBody(prev => prev + token)
  }

  const handleSave = async () => {
    if (!subject.trim()) { setError('Subject is required'); return }
    if (!body.trim()) { setError('Body is required'); return }

    setSaving(true)
    setError('')

    const payload = isEdit
      ? { delay_days: delayDays, subject, body, send_on_behalf_of: soboName, send_on_behalf_email: soboEmail }
      : { order_index: stageCount + 1, delay_days: delayDays, subject, body, send_on_behalf_of: soboName, send_on_behalf_email: soboEmail }

    const url = isEdit
      ? `/api/sequences/${sequenceId}/stages/${stage!.id}`
      : `/api/sequences/${sequenceId}/stages`

    const res = await fetch(url, {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const json = await res.json()
    setSaving(false)

    if (!res.ok) { setError(json.error ?? 'Failed to save stage'); return }
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
          <h2 className="text-base font-bold text-slate-900">
            {isEdit ? `Edit Stage ${stage!.order_index}` : 'Add Stage'}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Delay */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mb-1.5">
              <Clock className="h-3.5 w-3.5" /> Delay (days after previous stage)
            </label>
            <input
              type="number"
              min={0}
              max={90}
              value={delayDays}
              onChange={e => setDelayDays(Number(e.target.value))}
              className="w-24 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
            {delayDays === 0 && <p className="text-xs text-slate-400 mt-1">Sends immediately (or on enrollment for stage 1)</p>}
          </div>

          {/* SOBO */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
              <User className="h-3.5 w-3.5" /> Send on behalf of (optional)
            </label>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                value={soboName}
                onChange={e => setSoboName(e.target.value)}
                placeholder="e.g. Hiring Manager"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
              <input
                type="email"
                value={soboEmail}
                onChange={e => setSoboEmail(e.target.value)}
                placeholder="e.g. hm@company.com"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <p className="text-[11px] text-slate-400">
              Email appears to come from this person. Replies go to their email. Increases response rates by 50%+.
            </p>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Subject Line</label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Hi {{candidate_first_name}}, quick note about..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
            <div className="flex flex-wrap gap-1 mt-2">
              {TOKENS.slice(0, 4).map(t => (
                <button
                  key={t.token}
                  type="button"
                  onClick={() => insertToken(t.token, 'subject')}
                  className="rounded-lg bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600 hover:bg-blue-100 transition-colors"
                >
                  + {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Body */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Email Body</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={12}
              placeholder="Write your outreach email here. Use {{tokens}} for personalization."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none font-mono"
            />
            <div className="flex flex-wrap gap-1 mt-2">
              {TOKENS.map(t => (
                <button
                  key={t.token}
                  type="button"
                  onClick={() => insertToken(t.token, 'body')}
                  className="rounded-lg bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600 hover:bg-blue-100 transition-colors"
                >
                  + {t.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-500 font-medium">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-6 py-4 flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? 'Update Stage' : 'Add Stage'}
          </button>
        </div>
      </div>
    </div>
  )
}
