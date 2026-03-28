'use client'

import { useState } from 'react'
import { X, Loader2, User, Clock, MessageSquare, Globe } from 'lucide-react'
import type { SequenceStage, SequenceChannel, StageCondition } from '@/lib/types/database'

// ── Constants ───────────────────────────────────────────────────────────────

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

const CHANNELS: { value: SequenceChannel; label: string; icon: string }[] = [
  { value: 'email',    label: 'Email',    icon: '📧' },
  { value: 'whatsapp', label: 'WhatsApp', icon: '💬' },
  { value: 'sms',      label: 'SMS',      icon: '📱' },
  { value: 'linkedin', label: 'LinkedIn', icon: '💼' },
]

const CONDITIONS: { value: StageCondition | ''; label: string; description: string }[] = [
  { value: '',         label: 'Always send',              description: 'Send regardless of previous stage activity' },
  { value: 'no_reply', label: 'If no reply',              description: 'Only send if candidate hasn\'t replied to previous stage' },
  { value: 'no_open',  label: 'If no open',               description: 'Only send if candidate hasn\'t opened previous stage email' },
  { value: 'no_click', label: 'If no click',              description: 'Only send if candidate hasn\'t clicked a link in previous stage' },
]

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
]

// ── Props ───────────────────────────────────────────────────────────────────

interface Props {
  sequenceId: string
  stage?: SequenceStage | null   // null = create mode
  stageCount: number             // for default order_index
  isFirstStage?: boolean         // stage 1 can't have conditions
  onClose: () => void
  onSaved: () => void
}

// ── Component ───────────────────────────────────────────────────────────────

export default function SequenceStageEditor({ sequenceId, stage, stageCount, isFirstStage, onClose, onSaved }: Props) {
  const isEdit = !!stage

  const [channel, setChannel]             = useState<SequenceChannel>(stage?.channel ?? 'email')
  const [subject, setSubject]             = useState(stage?.subject ?? '')
  const [body, setBody]                   = useState(stage?.body ?? '')
  const [delayDays, setDelayDays]         = useState(stage?.delay_days ?? 3)
  const [businessDays, setBusinessDays]   = useState(stage?.delay_business_days ?? false)
  const [sendTime, setSendTime]           = useState(stage?.send_at_time?.slice(0, 5) ?? '')  // "HH:MM"
  const [sendTz, setSendTz]               = useState(stage?.send_timezone ?? 'UTC')
  const [condition, setCondition]         = useState<StageCondition | ''>(stage?.condition ?? '')
  const [soboName, setSoboName]           = useState(stage?.send_on_behalf_of ?? '')
  const [soboEmail, setSoboEmail]         = useState(stage?.send_on_behalf_email ?? '')
  const [saving, setSaving]               = useState(false)
  const [error, setError]                 = useState('')

  const showCondition = isEdit ? (stage!.order_index > 1) : (stageCount >= 1)

  const insertToken = (token: string, target: 'subject' | 'body') => {
    if (target === 'subject') setSubject(prev => prev + token)
    else setBody(prev => prev + token)
  }

  const handleSave = async () => {
    if (!subject.trim()) { setError('Subject is required'); return }
    if (!body.trim()) { setError('Body is required'); return }

    setSaving(true)
    setError('')

    const payload: Record<string, unknown> = {
      delay_days: delayDays,
      subject,
      body,
      send_on_behalf_of: soboName,
      send_on_behalf_email: soboEmail,
      channel,
      send_at_time: sendTime || null,
      send_timezone: sendTz,
      delay_business_days: businessDays,
      condition: condition || null,
    }

    if (!isEdit) {
      payload.order_index = stageCount + 1
    }

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

          {/* ── 1. Channel Selector ──────────────────────────────────────── */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mb-2">
              <MessageSquare className="h-3.5 w-3.5" /> Channel
            </label>
            <div className="grid grid-cols-4 gap-2">
              {CHANNELS.map(ch => (
                <button
                  key={ch.value}
                  type="button"
                  onClick={() => setChannel(ch.value)}
                  className={`flex flex-col items-center gap-1 rounded-xl border-2 px-3 py-2.5 text-xs font-semibold transition-all ${
                    channel === ch.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                  }`}
                >
                  <span className="text-lg">{ch.icon}</span>
                  {ch.label}
                </button>
              ))}
            </div>
            {channel !== 'email' && (
              <p className="text-[11px] text-amber-600 mt-1.5">
                {channel === 'linkedin' ? 'LinkedIn messages will be logged for tracking. Manual send required via LinkedIn.' :
                 `${channel.toUpperCase()} delivery coming soon. Messages will be logged for tracking.`}
              </p>
            )}
          </div>

          {/* ── 2. Scheduling ────────────────────────────────────────────── */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
              <Clock className="h-3.5 w-3.5" /> Scheduling
            </label>

            {/* Delay */}
            <div className="flex items-center gap-3">
              <div>
                <p className="text-[11px] text-slate-400 mb-1">Delay after previous stage</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={90}
                    value={delayDays}
                    onChange={e => setDelayDays(Number(e.target.value))}
                    className="w-20 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                  <span className="text-xs text-slate-500">days</span>
                </div>
              </div>
              <label className="flex items-center gap-2 mt-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={businessDays}
                  onChange={e => setBusinessDays(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-xs text-slate-600">Business days only</span>
              </label>
            </div>

            {/* Send time */}
            <div className="flex items-end gap-3">
              <div>
                <p className="text-[11px] text-slate-400 mb-1">Send at specific time (optional)</p>
                <input
                  type="time"
                  value={sendTime}
                  onChange={e => setSendTime(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <p className="text-[11px] text-slate-400 mb-1">Timezone</p>
                <select
                  value={sendTz}
                  onChange={e => setSendTz(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                >
                  {TIMEZONES.map(tz => (
                    <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              {sendTime && (
                <button
                  type="button"
                  onClick={() => setSendTime('')}
                  className="text-[11px] text-slate-400 hover:text-slate-600 mb-2"
                >
                  Clear
                </button>
              )}
            </div>

            {delayDays === 0 && !sendTime && (
              <p className="text-[11px] text-slate-400">Sends immediately on enrollment (stage 1) or after previous stage completes</p>
            )}
          </div>

          {/* ── 3. Conditional Logic (stage 2+) ──────────────────────────── */}
          {showCondition && (
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mb-2">
                <Globe className="h-3.5 w-3.5" /> Send Condition
              </label>
              <div className="space-y-1.5">
                {CONDITIONS.map(c => (
                  <label
                    key={c.value}
                    className={`flex items-start gap-3 rounded-xl border-2 px-3.5 py-2.5 cursor-pointer transition-all ${
                      condition === c.value
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="condition"
                      value={c.value}
                      checked={condition === c.value}
                      onChange={() => setCondition(c.value as StageCondition | '')}
                      className="mt-0.5 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <p className={`text-xs font-semibold ${condition === c.value ? 'text-blue-700' : 'text-slate-700'}`}>
                        {c.label}
                      </p>
                      <p className="text-[11px] text-slate-400">{c.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* ── SOBO ─────────────────────────────────────────────────────── */}
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

          {/* ── Subject ──────────────────────────────────────────────────── */}
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

          {/* ── Body ─────────────────────────────────────────────────────── */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Message Body</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={10}
              placeholder="Write your outreach message here. Use {{tokens}} for personalization."
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
