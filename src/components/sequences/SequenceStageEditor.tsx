'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  X, Loader2, User, Clock, MessageSquare, Globe,
  Wand2, ChevronDown, Send, CheckCircle, AlertTriangle, BookmarkPlus, FileText, Zap,
} from 'lucide-react'
import type { SequenceStage, SequenceChannel, StageCondition } from '@/lib/types/database'
import { toDelayFields, fromDelayFields, computeStageDelaySeconds, DEFAULT_SEND_WINDOW, type DelayUnit } from '@/lib/sequences/schedule'
import { tokensUsed } from '@/lib/sequences/tokens'
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
  { token: '{{hiring_manager_calendar}}', label: 'HM Calendar Link' },
  { token: '{{phone_screen_scheduler}}', label: 'Phone Screen Slots' },
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

// A reusable subject/body the user saved for reuse across stages/sequences.
interface SavedTemplate { id: string; name: string; subject: string; body: string }

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
  sequenceKind?: 'drip' | 'event' // 'event' sends EVERY stage instantly
  onClose: () => void
  onSaved: () => void
}

// ── Component ───────────────────────────────────────────────────────────────

export default function SequenceStageEditor({ sequenceId, stage, stageCount, isFirstStage = false, sequenceKind = 'drip', onClose, onSaved }: Props) {
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
  // An inline notice shown right under the AI Draft button (not the far-away form
  // error) so a failed generation can't look like "nothing happened" (#6/#1).
  const [aiNotice, setAiNotice]           = useState<{ ok: boolean; message: string } | null>(null)
  const aiRef                             = useRef<HTMLDivElement>(null)

  // Saved templates (#7)
  const [templates, setTemplates]         = useState<SavedTemplate[]>([])
  const [tplMenuOpen, setTplMenuOpen]     = useState(false)
  const [savingTpl, setSavingTpl]         = useState(false)
  const [tplNotice, setTplNotice]         = useState('')

  // Preview (#10) — a single result object so we can show a clear success/error banner
  const [previewing, setPreviewing]       = useState(false)
  const [previewResult, setPreviewResult] = useState<{ ok: boolean; message: string } | null>(null)

  // Load the org's saved templates once so the "Templates" menu can offer them.
  useEffect(() => {
    fetch('/api/email-templates')
      .then(r => r.json())
      .then(json => setTemplates(Array.isArray(json.data) ? json.data : []))
      .catch(() => setTemplates([]))
  }, [])

  const showCondition = !isFirstStage && (isEdit ? stage!.order_index > 1 : stageCount >= 1)

  // Honest "expected landing" preview for EVERY timing config, computed with the
  // SAME function the sender uses (computeStageDelaySeconds), so what you see is
  // what actually gets scheduled. It also reflects the business-hours guardrail:
  // if a relative delay would land at 3am or on a weekend it is pushed to the next
  // window open, and we flag that so the user isn't surprised. Day-level steps show
  // in the chosen timezone; minute/hour steps show in the business-window timezone.
  const schedulePreview = (() => {
    const { delay_days, delay_minutes, delay_business_days } = toDelayFields(delayValue, delayUnit)
    const timing = {
      send_at_time: isDayUnit ? (sendTime || null) : null,
      send_timezone: sendTz,
      delay_days, delay_minutes, delay_business_days,
    }
    const now = new Date()
    // 'event' sequences skip the business-hours window on EVERY stage, so preview
    // them the way the sender actually schedules them (no clamp).
    const bypassesWindow = sequenceKind === 'event'
    const previewWindow = bypassesWindow ? null : DEFAULT_SEND_WINDOW
    const clampedSeconds = computeStageDelaySeconds(timing, now, isFirstStage, previewWindow)
    const rawSeconds     = computeStageDelaySeconds(timing, now, isFirstStage, null)
    const clamped = clampedSeconds !== rawSeconds
    // "Instant" copy only when the stage truly fires with no wait (zero delay).
    const instant = bypassesWindow && clampedSeconds === 0
    const displayTz = isDayUnit ? sendTz : DEFAULT_SEND_WINDOW.timezone
    const target = new Date(now.getTime() + clampedSeconds * 1000)
    const when = target.toLocaleString('en-US', {
      timeZone: displayTz, weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    })
    return { when: `${when} ${TZ_LABELS[displayTz] ?? displayTz}`, clamped, instant, bypassesWindow }
  })()

  // Which personalization tags appear in the current draft — drives the #9
  // "missing detail → natural default" reassurance note.
  const usedTokens = tokensUsed(subject, body)

  // ── AI Draft Generation ─────────────────────────────────────────────────

  const generateWithAI = async (templateId: string) => {
    setGenerating(true)
    setAiOpen(false)
    setError('')
    setAiNotice(null)

    const label = AI_TEMPLATES.find(t => t.id === templateId)?.name ?? 'draft'
    try {
      const res = await fetch('/api/sequences/ai-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: templateId,
          channel,
          company_name: settings.company_name || undefined,
          recruiter_name: settings.recruiter_name || undefined,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.data?.subject || !json.data?.body) {
        setAiNotice({ ok: false, message: json.error ?? 'The AI draft came back empty. Please try again.' })
        return
      }
      setSubject(json.data.subject)
      setBody(json.data.body)
      setEditorKey(k => k + 1)
      setAiNotice({ ok: true, message: `Filled in a ${label} draft — edit anything you like.` })
    } catch {
      setAiNotice({ ok: false, message: 'Could not reach the AI service. Please check your connection and try again.' })
    } finally {
      setGenerating(false)
    }
  }

  // ── Saved templates (#7) ─────────────────────────────────────────────────

  const applyTemplate = (tpl: SavedTemplate) => {
    setSubject(tpl.subject)
    setBody(tpl.body)
    setEditorKey(k => k + 1)
    setTplMenuOpen(false)
  }

  const saveAsTemplate = async () => {
    if (!subject.trim() || !body.trim()) {
      setTplNotice('Add a subject and body before saving a template.')
      return
    }
    const name = window.prompt('Name this template (so you can reuse it later):')
    if (!name || !name.trim()) return

    setSavingTpl(true)
    setTplNotice('')
    try {
      const res = await fetch('/api/email-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), subject, body }),
      })
      const json = await res.json()
      if (!res.ok) {
        setTplNotice(json.error ?? 'Could not save template.')
        return
      }
      setTemplates(prev => [...prev, json.data])
      setTplNotice(`Saved "${json.data.name}" to your templates.`)
      setTimeout(() => setTplNotice(''), 4000)
    } catch {
      setTplNotice('Could not save template.')
    } finally {
      setSavingTpl(false)
    }
  }

  // ── Send Preview ────────────────────────────────────────────────────────

  const sendPreview = async () => {
    const previewEmail = settings.recruiter_email
    if (!previewEmail) {
      setPreviewResult({ ok: false, message: 'Set your recruiter email in Settings first to receive previews.' })
      return
    }
    if (!subject.trim() || !body.trim()) {
      setPreviewResult({ ok: false, message: 'Add a subject and body before sending a preview.' })
      return
    }

    setPreviewing(true)
    setError('')
    setPreviewResult(null)

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
      hiring_manager_calendar: 'https://recruiterstack.in/schedule/preview-link',
    }

    const renderedSubject = subject.replace(/\{\{(\w+)\}\}/g, (_, key) => sampleContext[key] || `[${key}]`)
    const renderedBody = body.replace(/\{\{(\w+)\}\}/g, (_, key) => sampleContext[key] || `[${key}]`)

    try {
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

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        // A missing SendGrid setup is the most common cause — say so plainly.
        const hint = res.status === 503 || /sendgrid|not configured|api key/i.test(json.error ?? '')
          ? 'Email sending isn\'t set up yet (SendGrid). Add your SendGrid keys in Settings to send previews.'
          : (json.error ?? 'Failed to send preview.')
        setPreviewResult({ ok: false, message: hint })
        return
      }

      setPreviewResult({ ok: true, message: `Preview sent to ${previewEmail}. Check your inbox (and spam folder).` })
      setTimeout(() => setPreviewResult(r => (r?.ok ? null : r)), 6000)
    } catch {
      setPreviewResult({ ok: false, message: 'Could not reach the email service. Please try again.' })
    } finally {
      setPreviewing(false)
    }
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
            <div className="space-y-1">
              <p className="text-[11px] text-slate-500">
                {schedulePreview.instant ? 'Sends' : (isDayUnit ? 'Lands' : 'If the previous step finished now, this lands')}:{' '}
                <span className="font-medium text-slate-700">{schedulePreview.instant ? 'Immediately' : schedulePreview.when}</span>
              </p>
              {schedulePreview.bypassesWindow && (
                <p className="flex items-start gap-1 text-[11px] text-emerald-600">
                  <Zap className="h-3 w-3 mt-0.5 shrink-0" />
                  <span>
                    This is an event notification, so every step fires as soon as it&apos;s due —
                    off-hours included — skipping the business-hours window.
                  </span>
                </p>
              )}
              {schedulePreview.clamped && (
                <p className="flex items-start gap-1 text-[11px] text-amber-600">
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                  <span>
                    Adjusted to business hours — sends are held to Mon–Fri, 8am–8pm IST for
                    deliverability, so this was pushed to the next open window.
                  </span>
                </p>
              )}
            </div>
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

              <div className="flex items-center gap-1.5">
              {/* Saved templates (#7): load a template, or save the current copy */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setTplMenuOpen(o => !o)}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium border transition-colors ${
                    tplMenuOpen ? 'border-slate-400 bg-slate-50 text-slate-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <FileText className="h-3 w-3 text-slate-500" /> Templates <ChevronDown className="h-3 w-3 opacity-60" />
                </button>
                {tplMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setTplMenuOpen(false)} />
                    <div className="absolute top-full right-0 mt-1.5 z-30 w-60 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden">
                      <p className="px-3.5 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Load a saved template</p>
                      {templates.length === 0 ? (
                        <p className="px-3.5 py-2 text-xs text-slate-400">No saved templates yet. Use “Save” to create one.</p>
                      ) : (
                        <div className="max-h-56 overflow-y-auto">
                          {templates.map(t => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => applyTemplate(t)}
                              className="w-full flex flex-col items-start px-3.5 py-2 text-left hover:bg-slate-50 transition-colors"
                            >
                              <span className="text-xs font-medium text-slate-700 truncate w-full">{t.name}</span>
                              <span className="text-[10px] text-slate-400 truncate w-full">{t.subject}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={saveAsTemplate}
                disabled={savingTpl}
                title="Save this subject + body as a reusable template"
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                {savingTpl ? <Loader2 className="h-3 w-3 animate-spin" /> : <BookmarkPlus className="h-3 w-3 text-slate-500" />} Save
              </button>

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
            </div>
            {tplNotice && (
              <p className="mb-1.5 text-[11px] font-medium text-slate-500">{tplNotice}</p>
            )}
            {aiNotice && (
              <div className={`mb-1.5 flex items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium ${
                aiNotice.ok
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-red-200 bg-red-50 text-red-600'
              }`}>
                {aiNotice.ok
                  ? <Wand2 className="mt-px h-3 w-3 shrink-0" />
                  : <AlertTriangle className="mt-px h-3 w-3 shrink-0" />}
                <span>{aiNotice.message}</span>
              </div>
            )}

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

          {/* #9: reassure the user that missing values won't leave awkward gaps —
              each personalization tag falls back to a natural default. */}
          {usedTokens.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <p className="text-[11px] font-semibold text-slate-500 mb-1.5">If a candidate is missing a detail, we fill in a natural default:</p>
              <div className="flex flex-wrap gap-1.5">
                {usedTokens.map(t => (
                  <span key={t.key} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-600">
                    <span className="font-semibold text-slate-500">{t.label}</span>
                    <span className="text-slate-300">→</span>
                    <span className="italic text-slate-500">“{t.fallback}”</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-500 font-medium">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-6 py-4 space-y-2.5 shrink-0">
          {/* #10: clear success/error result from the last preview send */}
          {previewResult && (
            <div className={`flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-medium ${
              previewResult.ok
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-red-200 bg-red-50 text-red-600'
            }`}>
              {previewResult.ok
                ? <CheckCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                : <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
              <span>{previewResult.message}</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            {/* Left: Send Preview */}
            <button
              type="button"
              onClick={sendPreview}
              disabled={previewing || !subject.trim() || !body.trim()}
              className="flex items-center gap-2 rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              {previewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              {previewing ? 'Sending…' : `Send Preview${settings.recruiter_email ? ` to ${settings.recruiter_email}` : ''}`}
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
    </div>
  )
}
