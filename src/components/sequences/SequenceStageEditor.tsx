'use client'

import { useState, useRef, useCallback } from 'react'
import {
  X, Loader2, User, Clock, MessageSquare, Globe,
  Wand2, ChevronDown, Send, CheckCircle,
} from 'lucide-react'
import type { SequenceStage, SequenceChannel, StageCondition } from '@/lib/types/database'
import { toDelayFields, fromDelayFields, computeStageDelaySeconds, DEFAULT_SEND_WINDOW, type DelayUnit } from '@/lib/sequences/schedule'
import { RichTextEditor } from '@/components/RichTextEditor'
import { useSettings } from '@/lib/hooks/useSettings'
import type { Editor } from '@tiptap/react'

// ── Constants ───────────────────────────────────────────────────────────────

const TOKENS = [
  { token: '{{candidate_first_name}}', label: 'First Name' },
  { token: '{{candidate_name}}',       label: 'Full Name' },
  { token: '{{candidate_title}}',      label: 'Current Title' },
  { token: '{{candidate_company}}',    label: 'Current Company' },
  { token: '{{candidate_location}}',   label: 'Location' },
  { token: '{{job_title}}',            label: 'Job Title' },
  { token: '{{company_name}}',         label: 'Hiring Company' },
  { token: '{{recruiter_name}}',       label: 'Recruiter' },
]

const CHANNELS: { value: SequenceChannel; label: string; icon: string; soon?: boolean }[] = [
  { value: 'email',    label: 'Email',    icon: '📧' },
  { value: 'whatsapp', label: 'WhatsApp', icon: '💬', soon: true },
  { value: 'sms',      label: 'SMS',      icon: '📱', soon: true },
  { value: 'linkedin', label: 'LinkedIn', icon: '💼', soon: true },
]

const CONDITIONS: { value: StageCondition | ''; label: string; description: string }[] = [
  { value: '',         label: 'Always send',   description: 'Send regardless of previous stage activity' },
  { value: 'no_reply', label: 'If no reply',   description: 'Only send if candidate hasn\'t replied to previous stage' },
  { value: 'no_open',  label: 'If no open',    description: 'Only send if candidate hasn\'t opened previous stage email' },
  { value: 'no_click', label: 'If no click',   description: 'Only send if candidate hasn\'t clicked a link in previous stage' },
]

const AI_TEMPLATES = [
  { id: 'cold_outreach',     emoji: '👋', name: 'Cold Outreach' },
  { id: 'follow_up',         emoji: '🔄', name: 'Follow-up' },
  { id: 'interview_invite',  emoji: '📅', name: 'Interview Invite' },
  { id: 'value_prop',        emoji: '💎', name: 'Value Proposition' },
  { id: 'breakup',           emoji: '👋', name: 'Final Check-in' },
]

// Short labels for the timezone dropdown + the send-time preview. Order here is
// the dropdown order.
const TZ_LABELS: Record<string, string> = {
  'Asia/Kolkata': 'IST', 'America/New_York': 'EST', 'America/Chicago': 'CST',
  'America/Denver': 'MST', 'America/Los_Angeles': 'PST', 'Europe/London': 'GMT',
  'Europe/Berlin': 'CET', 'Europe/Paris': 'CET', 'Asia/Singapore': 'SGT',
  'Asia/Tokyo': 'JST', 'Australia/Sydney': 'AEDT', 'UTC': 'UTC',
}
const TIMEZONES = Object.keys(TZ_LABELS)

// The clock time a day-level step defaults to when none is set — so a newly
// added stage shows a concrete send time instead of a blank field.
const DEFAULT_SEND_TIME = '09:00'

// Convert a wall-clock "HH:MM" from one timezone to the equivalent wall-clock in
// another, keeping the SAME real-world instant (referenced to today). So flipping
// the dropdown from IST to CST re-labels e.g. 9:00 AM → 9:30 PM rather than
// silently keeping "9:00" and changing when the email actually sends.
function convertWallClock(hhmm: string, fromTz: string, toTz: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: fromTz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  const get = (t: string) => parseInt(parts.find(p => p.type === t)!.value)
  // fromTz offset such that realUTC = Date.UTC(localParts) + offset.
  const offset = now.getTime() - Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  const instant = Date.UTC(get('year'), get('month') - 1, get('day'), h, m, 0) + offset
  // en-GB with h23 yields a plain "HH:MM".
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: toTz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(instant))
}

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

export default function SequenceStageEditor({ sequenceId, stage, stageCount, isFirstStage = false, onClose, onSaved }: Props) {
  const isEdit = !!stage
  const { settings } = useSettings()

  const [channel, setChannel]             = useState<SequenceChannel>(stage?.channel ?? 'email')
  const [subject, setSubject]             = useState(stage?.subject ?? '')
  const [body, setBody]                   = useState(stage?.body ?? '')
  const [editorKey, setEditorKey]         = useState(0)
  const initialDelay = fromDelayFields(stage?.delay_days ?? 0, stage?.delay_minutes ?? 0, stage?.delay_business_days ?? false)
  const [delayValue, setDelayValue]       = useState(initialDelay.value)
  const [delayUnit, setDelayUnit]         = useState<DelayUnit>(initialDelay.unit)
  const isDayUnit = delayUnit === 'days' || delayUnit === 'business_days'
  // New day-level stages get a sensible default time (9 AM); editing an existing
  // stage keeps whatever it had (possibly none).
  const [sendTime, setSendTime]           = useState(stage?.send_at_time?.slice(0, 5) ?? (stage ? '' : DEFAULT_SEND_TIME))
  const [sendTz, setSendTz]              = useState(stage?.send_timezone && stage.send_timezone !== 'UTC' ? stage.send_timezone : 'Asia/Kolkata')
  const [condition, setCondition]         = useState<StageCondition | ''>(stage?.condition ?? '')
  const [soboName, setSoboName]           = useState(stage?.send_on_behalf_of ?? '')
  const [soboEmail, setSoboEmail]         = useState(stage?.send_on_behalf_email ?? '')
  const [saving, setSaving]               = useState(false)
  const [error, setError]                 = useState('')

  // TipTap editor ref for cursor-position insertion
  const editorRef                         = useRef<Editor | null>(null)
  const subjectRef                        = useRef<HTMLInputElement>(null)

  const onEditorReady = useCallback((editor: Editor | null) => {
    editorRef.current = editor
  }, [])

  // AI generation
  const [aiOpen, setAiOpen]               = useState(false)
  const [generating, setGenerating]       = useState(false)
  const aiRef                             = useRef<HTMLDivElement>(null)

  // Preview
  const [previewing, setPreviewing]       = useState(false)
  const [previewSent, setPreviewSent]     = useState(false)

  const showCondition = !isFirstStage && (isEdit ? stage!.order_index > 1 : stageCount >= 1)

  // Honest "first send" preview for day-level steps: computed with the SAME
  // function the sender uses (computeStageDelaySeconds), so what you see is what
  // actually gets scheduled — in the selected timezone, with the chosen time.
  const schedulePreview = (() => {
    if (!isDayUnit) return null
    const { delay_days, delay_minutes, delay_business_days } = toDelayFields(delayValue, delayUnit)
    const seconds = computeStageDelaySeconds(
      { send_at_time: sendTime || null, send_timezone: sendTz, delay_days, delay_minutes, delay_business_days },
      new Date(),
      false,
      DEFAULT_SEND_WINDOW,
    )
    const target = new Date(Date.now() + seconds * 1000)
    const when = target.toLocaleString('en-US', {
      timeZone: sendTz, weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    })
    return `${when} ${TZ_LABELS[sendTz] ?? sendTz}`
  })()

  // ── AI Draft Generation ─────────────────────────────────────────────────

  const generateWithAI = async (templateId: string) => {
    setGenerating(true)
    setAiOpen(false)
    setError('')

    const templates: Record<string, { subject: string; body: string }> = {
      cold_outreach: {
        subject: 'Hi {{candidate_first_name}}, exciting opportunity at {{company_name}}',
        body: `<p>Hi {{candidate_first_name}},</p>
<p>I came across your profile and was impressed by your experience as {{candidate_title}} at {{candidate_company}}. I think you'd be a great fit for a role we're hiring for at {{company_name}}.</p>
<p>Would you be open to a quick chat this week? I'd love to share more about what we're building and how your background aligns.</p>
<p>Best,<br/>{{recruiter_name}}</p>`,
      },
      follow_up: {
        subject: 'Re: Quick follow-up, {{candidate_first_name}}',
        body: `<p>Hi {{candidate_first_name}},</p>
<p>Just wanted to follow up on my previous message. I understand you're busy, but I genuinely think this could be a great fit for where you are in your career.</p>
<p>Happy to work around your schedule — even a 15-minute call would be great.</p>
<p>Best,<br/>{{recruiter_name}}</p>`,
      },
      interview_invite: {
        subject: '{{company_name}} — Interview for {{job_title}}',
        body: `<p>Hi {{candidate_first_name}},</p>
<p>Great news! The team was really impressed with your background and we'd love to move forward with an interview for the {{job_title}} role.</p>
<p>Would any of the following times work for you this week?</p>
<ul><li>Option 1: [Date/Time]</li><li>Option 2: [Date/Time]</li><li>Option 3: [Date/Time]</li></ul>
<p>Looking forward to it!</p>
<p>Best,<br/>{{recruiter_name}}</p>`,
      },
      value_prop: {
        subject: 'Why {{company_name}} might be your next move, {{candidate_first_name}}',
        body: `<p>Hi {{candidate_first_name}},</p>
<p>I wanted to share a few reasons why others with your background have loved joining {{company_name}}:</p>
<ul><li><strong>Impact:</strong> You'll work on problems that matter at scale</li><li><strong>Growth:</strong> Clear career progression and learning budget</li><li><strong>Team:</strong> Collaborative, senior team with low bureaucracy</li></ul>
<p>Would love to chat if any of this resonates. No pressure at all.</p>
<p>Best,<br/>{{recruiter_name}}</p>`,
      },
      breakup: {
        subject: 'Last note from me, {{candidate_first_name}}',
        body: `<p>Hi {{candidate_first_name}},</p>
<p>I've reached out a couple of times and I know timing isn't always right. I don't want to be a bother, so this will be my last message.</p>
<p>If you're ever open to exploring new opportunities, my door is always open. Feel free to reach out anytime.</p>
<p>Wishing you all the best!</p>
<p>{{recruiter_name}}<br/>{{company_name}}</p>`,
      },
    }

    const tpl = templates[templateId]
    if (tpl) {
      setSubject(tpl.subject)
      setBody(tpl.body)
      setEditorKey(k => k + 1)
    }

    setGenerating(false)
  }

  // ── Send Preview ────────────────────────────────────────────────────────

  const sendPreview = async () => {
    const previewEmail = settings.recruiter_email
    if (!previewEmail) {
      setError('Set your recruiter email in Settings first to receive previews.')
      return
    }
    if (!subject.trim() || !body.trim()) {
      setError('Subject and body are required to send a preview.')
      return
    }

    setPreviewing(true)
    setError('')
    setPreviewSent(false)

    // Replace tokens with sample data for preview
    const sampleContext: Record<string, string> = {
      candidate_first_name: 'Jane',
      candidate_name: 'Jane Doe',
      candidate_title: 'Senior Engineer',
      candidate_company: 'Google',
      candidate_location: 'San Francisco',
      job_title: 'Staff Backend Engineer',
      company_name: settings.company_name || 'Your Company',
      recruiter_name: settings.recruiter_name || 'Recruiter',
      recruiter_title: settings.recruiter_title || '',
      department: 'Engineering',
    }

    const renderedSubject = subject.replace(/\{\{(\w+)\}\}/g, (_, key) => sampleContext[key] || `[${key}]`)
    const renderedBody = body.replace(/\{\{(\w+)\}\}/g, (_, key) => sampleContext[key] || `[${key}]`)

    const res = await fetch('/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: previewEmail,
        subject: `[PREVIEW] ${renderedSubject}`,
        body: renderedBody,
        from_name: soboName || settings.recruiter_name || 'RecruiterStack',
      }),
    })

    setPreviewing(false)

    if (!res.ok) {
      const json = await res.json()
      setError(json.error ?? 'Failed to send preview')
      return
    }

    setPreviewSent(true)
    setTimeout(() => setPreviewSent(false), 4000)
  }

  // ── Insert token at cursor position ─────────────────────────────────────

  const insertTokenInSubject = (token: string) => {
    const input = subjectRef.current
    if (input) {
      const start = input.selectionStart ?? subject.length
      const end = input.selectionEnd ?? subject.length
      const newVal = subject.slice(0, start) + token + subject.slice(end)
      setSubject(newVal)
      // Restore cursor position after the inserted token
      requestAnimationFrame(() => {
        input.setSelectionRange(start + token.length, start + token.length)
        input.focus()
      })
    } else {
      setSubject(prev => prev + token)
    }
  }

  const insertTokenInBody = (token: string) => {
    const editor = editorRef.current
    if (editor) {
      editor.chain().focus().insertContent(token).run()
    } else {
      setBody(prev => prev + token)
    }
  }

  // ── Save ────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!subject.trim()) { setError('Subject is required'); return }
    if (!body.trim()) { setError('Body is required'); return }

    setSaving(true)
    setError('')

    const { delay_days, delay_minutes, delay_business_days } = toDelayFields(delayValue, delayUnit)
    const payload: Record<string, unknown> = {
      delay_days,
      delay_minutes,
      subject,
      body,
      send_on_behalf_of: soboName,
      send_on_behalf_email: soboEmail,
      channel,
      send_at: null,
      // A fixed clock time only applies to day-level delays; minute/hour delays
      // are purely relative to the previous step.
      send_at_time: isDayUnit ? (sendTime || null) : null,
      send_timezone: sendTz,
      delay_business_days,
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
      <div className="relative flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
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
                  onClick={() => { if (!ch.soon) setChannel(ch.value) }}
                  disabled={ch.soon}
                  aria-disabled={ch.soon}
                  title={ch.soon ? `${ch.label} delivery is coming soon` : undefined}
                  className={`relative flex flex-col items-center gap-1 rounded-xl border-2 px-3 py-2.5 text-xs font-semibold transition-all ${
                    ch.soon
                      ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300'
                      : channel === ch.value
                        ? 'border-slate-500 bg-slate-50 text-slate-700'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                  }`}
                >
                  <span className="text-lg">{ch.icon}</span>
                  {ch.label}
                  {ch.soon && (
                    <span className="absolute -top-1.5 -right-1.5 rounded-full bg-slate-200 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-slate-500">
                      Soon
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* ── 2. Scheduling — GEM-style inline row ────────────────────── */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2.5">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
              <Clock className="h-3.5 w-3.5" /> Scheduling
            </label>

            {/* Inline row: [amount] [unit ▼] — plus, for day-level delays only, (date) at [time] [tz ▼] */}
            <div className="flex flex-wrap items-center gap-1.5 text-sm text-slate-700">
              <input
                type="number"
                min={0}
                max={90}
                value={delayValue}
                onChange={e => setDelayValue(Number(e.target.value))}
                className="w-14 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-center text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
              <select
                value={delayUnit}
                onChange={e => setDelayUnit(e.target.value as DelayUnit)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              >
                <option value="minutes">{delayValue === 1 ? 'minute' : 'minutes'}</option>
                <option value="hours">{delayValue === 1 ? 'hour' : 'hours'}</option>
                <option value="days">{delayValue === 1 ? 'day' : 'days'}</option>
                <option value="business_days">business {delayValue === 1 ? 'day' : 'days'}</option>
              </select>

              {/* A specific clock time only applies to day-level delays */}
              {isDayUnit && (
                <>
                  <span className="text-slate-400">at</span>
                  <input
                    type="time"
                    value={sendTime}
                    onChange={e => setSendTime(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  />
                  <select
                    value={sendTz}
                    onChange={e => {
                      const nextTz = e.target.value
                      // Keep the same real-world moment: re-label the time into the
                      // newly chosen zone (e.g. 9:00 IST → 21:30 CST).
                      if (sendTime) setSendTime(convertWallClock(sendTime, sendTz, nextTz))
                      setSendTz(nextTz)
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  >
                    {TIMEZONES.map(tz => (
                      <option key={tz} value={tz}>{TZ_LABELS[tz] ?? tz.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </>
              )}
            </div>
            {isDayUnit ? (
              schedulePreview && (
                <p className="text-[11px] text-slate-500">
                  First send: <span className="font-medium text-slate-700">{schedulePreview}</span>
                  <span className="text-slate-400"> · in the recipient&apos;s selected timezone</span>
                </p>
              )
            ) : (
              <p className="text-[11px] text-slate-400">Sends this long after the previous step.</p>
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
                        ? 'border-slate-500 bg-slate-50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="condition"
                      value={c.value}
                      checked={condition === c.value}
                      onChange={() => setCondition(c.value as StageCondition | '')}
                      className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <p className={`text-xs font-semibold ${condition === c.value ? 'text-slate-700' : 'text-slate-700'}`}>
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
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
              <input
                type="email"
                value={soboEmail}
                onChange={e => setSoboEmail(e.target.value)}
                placeholder="e.g. hm@company.com"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
            </div>
          </div>

          {/* ── Subject + AI Draft + Tokens ──────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-500">Subject Line</label>

              {/* AI Draft dropdown */}
              <div ref={aiRef} className="relative">
                <button
                  type="button"
                  onClick={() => setAiOpen(o => !o)}
                  disabled={generating}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium border transition-colors disabled:opacity-50 ${
                    aiOpen
                      ? 'border-slate-400 bg-slate-50 text-slate-700'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {generating
                    ? <><Loader2 className="h-3 w-3 animate-spin" /> Generating...</>
                    : <><Wand2 className="h-3 w-3 text-slate-500" /> AI Draft <ChevronDown className="h-3 w-3 opacity-60" /></>}
                </button>

                {aiOpen && (
                  <div className="absolute top-full right-0 mt-1.5 z-30 w-52 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden">
                    <p className="px-3.5 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Generate with AI</p>
                    {AI_TEMPLATES.map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => generateWithAI(t.id)}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left hover:bg-slate-50 transition-colors"
                      >
                        <span className="text-sm shrink-0">{t.emoji}</span>
                        <p className="text-xs font-medium text-slate-700">{t.name}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <input
              ref={subjectRef}
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Hi {{candidate_first_name}}, quick note about..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            />
            <div className="flex flex-wrap gap-1 mt-2">
              {TOKENS.slice(0, 4).map(t => (
                <button
                  key={t.token}
                  type="button"
                  onClick={() => insertTokenInSubject(t.token)}
                  className="rounded-lg bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 hover:bg-emerald-100 transition-colors"
                >
                  + {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Body — Rich Text Editor ──────────────────────────────────── */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Message Body</label>
            <RichTextEditor
              key={editorKey}
              value={body}
              onChange={setBody}
              placeholder="Write your outreach message here..."
              minHeight={200}
              onEditorReady={onEditorReady}
            />
            <div className="flex flex-wrap gap-1 mt-2">
              {TOKENS.map(t => (
                <button
                  key={t.token}
                  type="button"
                  onClick={() => insertTokenInBody(t.token)}
                  className="rounded-lg bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 hover:bg-emerald-100 transition-colors"
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
        <div className="border-t border-slate-100 px-6 py-4 flex items-center justify-between shrink-0">
          {/* Left: Send Preview */}
          <button
            type="button"
            onClick={sendPreview}
            disabled={previewing || !subject.trim() || !body.trim()}
            className="flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
          >
            {previewing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : previewSent ? (
              <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            {previewSent ? 'Preview sent!' : `Send Preview${settings.recruiter_email ? ` to ${settings.recruiter_email}` : ''}`}
          </button>

          {/* Right: Cancel + Save */}
          <div className="flex gap-3">
            <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-[#221b14] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#33271b] disabled:opacity-60 transition-colors"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? 'Update Stage' : 'Add Stage'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
