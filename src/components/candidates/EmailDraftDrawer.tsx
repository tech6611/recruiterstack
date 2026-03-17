'use client'

import { useState, useEffect, useRef, KeyboardEvent } from 'react'
import {
  Wand2, X, Send, Loader2, Check, ChevronLeft,
  Plus, Trash2, Clock, Calendar,
} from 'lucide-react'
import { useSettings } from '@/lib/hooks/useSettings'
import { RichTextEditor, stripHtml, isHtmlEmpty } from '@/components/RichTextEditor'

// ── Types ─────────────────────────────────────────────────────────────────────

type BuiltInId = 'interview_invite' | 'followup' | 'offer' | 'rejection'

interface SavedTemplate { id: string; name: string; subject: string; body: string }

interface AnyTemplate {
  kind: 'builtin' | 'saved'
  id: string
  name: string
  emoji: string
  subject: string
  body: string
}

// ── Built-in templates ────────────────────────────────────────────────────────

const BUILT_IN_META: { id: BuiltInId; name: string; emoji: string; desc: string }[] = [
  { id: 'interview_invite', name: 'Interview Invite',  emoji: '📅', desc: 'Invite to the next round'         },
  { id: 'followup',         name: 'Follow-up',         emoji: '👋', desc: 'Check in after application'       },
  { id: 'offer',            name: 'Job Offer',         emoji: '🎉', desc: 'Congratulate & extend an offer'   },
  { id: 'rejection',        name: 'Rejection',         emoji: '💌', desc: 'Respectfully close an application' },
]

const BUILT_IN_SUBJECTS: Record<BuiltInId, string> = {
  interview_invite: 'Interview Invitation — {{position_title}} at {{company_name}}',
  followup:         'Following up — {{position_title}} at {{company_name}}',
  offer:            'Job Offer — {{position_title}} at {{company_name}}',
  rejection:        'Your Application — {{position_title}} at {{company_name}}',
}

const BUILT_IN_BODIES: Record<BuiltInId, string> = {
  interview_invite: `Hi {{first_name}},

Thank you for applying for the {{position_title}} role at {{company_name}}. We've reviewed your application and would love to invite you to an interview.

Please let us know your availability for the coming week and we'll get something confirmed right away.

Looking forward to speaking with you!

Best regards,
{{recruiter_name}}
{{recruiter_title}}
{{company_name}}`,

  followup: `Hi {{first_name}},

I'm reaching out to follow up on your application for the {{position_title}} position at {{company_name}}.

Your application is still under active review and we appreciate your patience. We'll be in touch shortly with a full update.

Thank you for your continued interest in joining our team!

Best regards,
{{recruiter_name}}
{{recruiter_title}}
{{company_name}}`,

  offer: `Hi {{first_name}},

We're thrilled to offer you the position of {{position_title}} at {{company_name}}!

We were genuinely impressed by your background and believe you'll be a fantastic addition to the team. We'll follow up shortly with the formal offer letter and next steps.

Please don't hesitate to reach out with any questions in the meantime.

We look forward to welcoming you aboard!

Warm regards,
{{recruiter_name}}
{{recruiter_title}}
{{company_name}}`,

  rejection: `Hi {{first_name}},

Thank you for taking the time to apply for the {{position_title}} role at {{company_name}} and for your interest in joining our team.

After careful consideration, we've decided to move forward with candidates whose experience more closely aligns with our current needs. This was a difficult decision — your profile was strong and we appreciate the effort you put into the process.

We wish you all the best and hope our paths cross again in the future.

Best regards,
{{recruiter_name}}
{{recruiter_title}}
{{company_name}}`,
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function resolvePlaceholders(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (vars[key] !== undefined && vars[key] !== '') return vars[key]
    const label = key.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
    return `[${label}]`
  })
}

function textToHtml(text: string): string {
  const lines = text.split('\n')
  let html = ''
  for (const line of lines) {
    html += line.trim() === '' ? '<p></p>' : `<p>${line}</p>`
  }
  return html
}

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
}

// ── Email tags input ──────────────────────────────────────────────────────────

function EmailTagsInput({
  emails,
  onChange,
  placeholder,
  autoFocus,
}: {
  emails: string[]
  onChange: (emails: string[]) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const addEmail = (raw: string) => {
    const trimmed = raw.trim().toLowerCase()
    if (isEmail(trimmed) && !emails.includes(trimmed)) {
      onChange([...emails, trimmed])
    }
    setInput('')
  }

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',' || e.key === ' ') && input.trim()) {
      e.preventDefault()
      addEmail(input)
    }
    if (e.key === 'Backspace' && !input && emails.length > 0) {
      onChange(emails.slice(0, -1))
    }
  }

  return (
    <div
      className="flex flex-wrap gap-1 px-2 py-1.5 min-h-[36px] rounded-lg border border-slate-200 bg-white focus-within:ring-2 focus-within:ring-violet-300 focus-within:border-violet-400 cursor-text"
      onClick={() => inputRef.current?.focus()}
    >
      {emails.map(email => (
        <span key={email} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
          {email}
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onChange(emails.filter(m => m !== email)) }}
            className="text-slate-400 hover:text-red-500 transition-colors"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        autoFocus={autoFocus}
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => { if (input.trim()) addEmail(input) }}
        placeholder={emails.length === 0 ? (placeholder ?? 'Add email…') : ''}
        className="flex-1 min-w-[120px] text-xs text-slate-800 outline-none bg-transparent placeholder-slate-400"
      />
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface EmailDraftDrawerProps {
  appId: string
  candidateEmail: string
  candidateName: string
  positionTitle?: string
  onClose: () => void
  onSent?: () => void
}

type Step = 'pick' | 'compose' | 'sent' | 'save_template'

// ── Component ─────────────────────────────────────────────────────────────────

export default function EmailDraftDrawer({
  appId,
  candidateEmail,
  candidateName,
  positionTitle = '',
  onClose,
  onSent,
}: EmailDraftDrawerProps) {
  const { settings } = useSettings()

  const [step,           setStep]           = useState<Step>('pick')
  const [selectedTpl,    setSelectedTpl]    = useState<AnyTemplate | null>(null)
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>([])
  const [tplLoading,     setTplLoading]     = useState(true)

  // Compose fields
  const [toEmails,  setToEmails]  = useState<string[]>([candidateEmail].filter(Boolean))
  const [ccEmails,  setCcEmails]  = useState<string[]>([])
  const [bccEmails, setBccEmails] = useState<string[]>([])
  const [showCc,    setShowCc]    = useState(false)
  const [showBcc,   setShowBcc]   = useState(false)
  const [subject,   setSubject]   = useState('')
  const [body,      setBody]      = useState('')

  // Schedule send
  const [scheduled,   setScheduled]   = useState(false)
  const [schedDate,   setSchedDate]   = useState('')
  const [schedTime,   setSchedTime]   = useState('09:00')

  // Save-template form
  const [tplName,     setTplName]     = useState('')
  const [tplSaving,   setTplSaving]   = useState(false)

  // Generation / sending
  const [generating,  setGenerating]  = useState(false)
  const [genError,    setGenError]    = useState('')
  const [sending,     setSending]     = useState(false)
  const [sendError,   setSendError]   = useState('')
  const [sentSubject, setSentSubject] = useState('')
  const [sentSched,   setSentSched]   = useState<string | null>(null)

  // Load saved templates
  useEffect(() => {
    fetch('/api/email-templates')
      .then(r => r.json())
      .then(json => { if (json.data) setSavedTemplates(json.data) })
      .catch(() => {})
      .finally(() => setTplLoading(false))
  }, [])

  // Build all-templates list for the picker
  const allTemplates: AnyTemplate[] = [
    ...BUILT_IN_META.map(m => ({
      kind:    'builtin' as const,
      id:      m.id,
      name:    m.name,
      emoji:   m.emoji,
      subject: BUILT_IN_SUBJECTS[m.id],
      body:    BUILT_IN_BODIES[m.id],
    })),
    ...savedTemplates.map(t => ({
      kind:    'saved' as const,
      id:      t.id,
      name:    t.name,
      emoji:   '📋',
      subject: t.subject,
      body:    t.body,
    })),
  ]

  // ── Vars for placeholder resolution ─────────────────────────────────────────

  const vars: Record<string, string> = {
    first_name:      candidateName.split(' ')[0] || candidateName,
    position_title:  positionTitle                || '',
    company_name:    settings.company_name        || '',
    recruiter_name:  settings.recruiter_name      || '',
    recruiter_title: settings.recruiter_title     || '',
  }

  // ── Apply template (use template button) ────────────────────────────────────

  const applyTemplate = (tpl: AnyTemplate) => {
    const resolvedSubject = resolvePlaceholders(tpl.subject, vars)
    const rawBody = tpl.kind === 'saved' ? tpl.body : tpl.body   // both HTML for saved, plain-text for built-in
    const resolvedBody = resolvePlaceholders(rawBody, vars)
    setSubject(resolvedSubject)
    // Built-in bodies are plain text; saved templates are HTML (from the editor)
    setBody(tpl.kind === 'saved' ? resolvedBody : textToHtml(resolvedBody))
    setSelectedTpl(tpl)
    setStep('compose')
  }

  // ── Generate with AI ────────────────────────────────────────────────────────

  const generateWithAI = async (tplId: string) => {
    setGenerating(true); setGenError('')
    const res = await fetch(`/api/applications/${appId}/email-draft`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template:        tplId,
        recruiter_name:  settings.recruiter_name  || undefined,
        recruiter_title: settings.recruiter_title || undefined,
        company_name:    settings.company_name    || undefined,
      }),
    })
    const json = await res.json()
    setGenerating(false)
    if (!res.ok) { setGenError(json.error ?? 'Generation failed'); return }
    setSubject(json.data.subject)
    setBody(textToHtml(json.data.body))
    setStep('compose')
  }

  // ── Save current draft as template ──────────────────────────────────────────

  const saveTemplate = async () => {
    if (!tplName.trim() || !subject.trim() || isHtmlEmpty(body)) return
    setTplSaving(true)
    const res = await fetch('/api/email-templates', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: tplName.trim(), subject: subject.trim(), body }),
    })
    const json = await res.json()
    setTplSaving(false)
    if (!res.ok) { return }
    setSavedTemplates(prev => [...prev, json.data])
    setTplName('')
    setStep('compose')
  }

  const deleteTemplate = async (id: string) => {
    await fetch(`/api/email-templates/${id}`, { method: 'DELETE' })
    setSavedTemplates(prev => prev.filter(t => t.id !== id))
  }

  // ── Send email ─────────────────────────────────────────────────────────────

  const send = async () => {
    if (toEmails.length === 0) { setSendError('Add at least one recipient.'); return }
    if (!subject.trim() || isHtmlEmpty(body)) { setSendError('Subject and body are required.'); return }
    if (scheduled && !schedDate) { setSendError('Pick a date to schedule the send.'); return }

    setSending(true); setSendError('')

    let sendAt: number | undefined
    if (scheduled && schedDate) {
      const dt = new Date(`${schedDate}T${schedTime || '09:00'}:00`)
      sendAt = Math.floor(dt.getTime() / 1000)
    }

    const plainText = stripHtml(body)
    const res = await fetch(`/api/applications/${appId}/send-email`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject:   subject.trim(),
        body:      plainText,
        body_html: body,
        from_name: settings.recruiter_name || undefined,
        to_emails: toEmails,
        cc_emails: ccEmails.length > 0 ? ccEmails : undefined,
        bcc_emails: bccEmails.length > 0 ? bccEmails : undefined,
        send_at:   sendAt,
      }),
    })
    const json = await res.json()
    setSending(false)
    if (!res.ok) { setSendError(json.error ?? 'Failed to send email'); return }
    setSentSubject(subject.trim())
    setSentSched(scheduled && schedDate ? `${schedDate}T${schedTime}` : null)
    setStep('sent')
    onSent?.()
  }

  const fromName  = settings.recruiter_name || 'RecruiterStack'

  // ── Min date for schedule (tomorrow) ────────────────────────────────────────
  const minDate = (() => {
    const d = new Date(); d.setDate(d.getDate() + 1)
    return d.toISOString().split('T')[0]
  })()

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 shrink-0">
          <div className="flex items-center gap-2">
            {(step === 'compose' || step === 'save_template') && (
              <button
                onClick={() => step === 'save_template' ? setStep('compose') : setStep('pick')}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <Wand2 className="h-4 w-4 text-violet-500" />
            <h2 className="text-sm font-bold text-slate-900">
              {step === 'sent'          ? 'Email Sent'
                : step === 'save_template' ? 'Save Template'
                : 'Draft Email'}
            </h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── STEP: Pick template ───────────────────────────────────────────── */}
        {step === 'pick' && (
          <div className="flex-1 overflow-y-auto">

            {/* To (editable here too so user sees who they're emailing) */}
            <div className="px-5 pt-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 w-6 shrink-0">To</span>
                <EmailTagsInput
                  emails={toEmails}
                  onChange={setToEmails}
                  placeholder="Recipient email…"
                />
              </div>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* BUILT-IN templates */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Built-in templates</p>
                <div className="rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
                  {BUILT_IN_META.map(m => {
                    const tpl: AnyTemplate = {
                      kind: 'builtin', id: m.id, name: m.name, emoji: m.emoji,
                      subject: BUILT_IN_SUBJECTS[m.id], body: BUILT_IN_BODIES[m.id],
                    }
                    const active = selectedTpl?.id === m.id && selectedTpl?.kind === 'builtin'
                    return (
                      <button
                        key={m.id}
                        onClick={() => setSelectedTpl(active ? null : tpl)}
                        className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors ${active ? 'bg-violet-50' : 'hover:bg-slate-50'}`}
                      >
                        <span className="text-base shrink-0">{m.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-semibold ${active ? 'text-violet-700' : 'text-slate-700'}`}>{m.name}</p>
                          <p className="text-[10px] text-slate-400 truncate">{m.desc}</p>
                        </div>
                        {active && <Check className="h-3.5 w-3.5 text-violet-500 shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* MY templates */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">My templates</p>
                </div>
                {tplLoading ? (
                  <div className="rounded-xl border border-slate-100 px-4 py-3 text-xs text-slate-400 animate-pulse">Loading…</div>
                ) : savedTemplates.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No saved templates yet.</p>
                ) : (
                  <div className="rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
                    {savedTemplates.map(t => {
                      const tpl: AnyTemplate = { kind: 'saved', id: t.id, name: t.name, emoji: '📋', subject: t.subject, body: t.body }
                      const active = selectedTpl?.id === t.id && selectedTpl?.kind === 'saved'
                      return (
                        <div key={t.id} className={`flex items-center gap-2 px-3.5 py-2.5 transition-colors ${active ? 'bg-violet-50' : 'hover:bg-slate-50'}`}>
                          <button className="flex-1 flex items-center gap-3 text-left min-w-0" onClick={() => setSelectedTpl(active ? null : tpl)}>
                            <span className="text-base shrink-0">📋</span>
                            <div className="min-w-0">
                              <p className={`text-xs font-semibold truncate ${active ? 'text-violet-700' : 'text-slate-700'}`}>{t.name}</p>
                              <p className="text-[10px] text-slate-400 truncate">{t.subject}</p>
                            </div>
                            {active && <Check className="h-3.5 w-3.5 text-violet-500 shrink-0" />}
                          </button>
                          <button
                            onClick={() => deleteTemplate(t.id)}
                            className="p-1 rounded text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors shrink-0"
                            title="Delete template"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {genError && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{genError}</div>
              )}
            </div>

            {/* Footer actions */}
            <div className="px-5 pb-5 space-y-2 border-t border-slate-100 pt-4">
              <button
                onClick={() => selectedTpl ? applyTemplate(selectedTpl) : undefined}
                disabled={!selectedTpl}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Use Template
              </button>
              <button
                onClick={() => selectedTpl ? generateWithAI(selectedTpl.id) : generateWithAI('interview_invite')}
                disabled={generating}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60 transition-colors"
              >
                {generating
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
                  : <><Wand2 className="h-3.5 w-3.5 text-violet-500" /> Generate with AI</>}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP: Compose (full CRM view) ─────────────────────────────────── */}
        {step === 'compose' && (
          <>
            <div className="flex-1 overflow-y-auto">

              {/* From / To / CC / BCC header */}
              <div className="border-b border-slate-100 divide-y divide-slate-100">
                {/* From */}
                <div className="flex items-center gap-3 px-5 py-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 w-7 shrink-0">From</span>
                  <span className="text-xs text-slate-500 truncate">{fromName}</span>
                </div>

                {/* To */}
                <div className="flex items-start gap-3 px-5 py-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 w-7 shrink-0 pt-1.5">To</span>
                  <div className="flex-1 min-w-0">
                    <EmailTagsInput emails={toEmails} onChange={setToEmails} placeholder="Add recipient…" autoFocus={false} />
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 pt-1">
                    {!showCc  && <button onClick={() => setShowCc(true)}  className="text-[10px] font-medium text-slate-400 hover:text-slate-700 transition-colors">Cc</button>}
                    {!showBcc && <button onClick={() => setShowBcc(true)} className="text-[10px] font-medium text-slate-400 hover:text-slate-700 transition-colors">Bcc</button>}
                  </div>
                </div>

                {/* CC */}
                {showCc && (
                  <div className="flex items-start gap-3 px-5 py-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 w-7 shrink-0 pt-1.5">Cc</span>
                    <div className="flex-1 min-w-0">
                      <EmailTagsInput emails={ccEmails} onChange={setCcEmails} placeholder="Add CC…" />
                    </div>
                    <button onClick={() => { setShowCc(false); setCcEmails([]) }} className="shrink-0 pt-1.5 text-slate-300 hover:text-red-400 transition-colors">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}

                {/* BCC */}
                {showBcc && (
                  <div className="flex items-start gap-3 px-5 py-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 w-7 shrink-0 pt-1.5">Bcc</span>
                    <div className="flex-1 min-w-0">
                      <EmailTagsInput emails={bccEmails} onChange={setBccEmails} placeholder="Add BCC…" />
                    </div>
                    <button onClick={() => { setShowBcc(false); setBccEmails([]) }} className="shrink-0 pt-1.5 text-slate-300 hover:text-red-400 transition-colors">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}

                {/* Subject */}
                <div className="flex items-center gap-3 px-5 py-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 w-7 shrink-0">Re</span>
                  <input
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    placeholder="Subject line…"
                    className="flex-1 text-sm font-medium text-slate-800 outline-none bg-transparent placeholder-slate-300"
                  />
                </div>
              </div>

              {/* Body */}
              <div className="px-5 py-4">
                <RichTextEditor
                  value={body}
                  onChange={setBody}
                  placeholder="Compose your message…"
                  minHeight={240}
                />
              </div>

              {/* Schedule send */}
              <div className="px-5 pb-4 space-y-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setScheduled(s => !s)}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border transition-colors ${scheduled ? 'border-violet-400 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'}`}
                  >
                    <Clock className="h-3 w-3" /> Schedule send
                  </button>
                  {selectedTpl && (
                    <button
                      onClick={() => { setTplName(selectedTpl.name + ' (copy)'); setStep('save_template') }}
                      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50 transition-colors"
                    >
                      <Plus className="h-3 w-3" /> Save as template
                    </button>
                  )}
                  {!selectedTpl && (
                    <button
                      onClick={() => { setTplName(''); setStep('save_template') }}
                      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50 transition-colors"
                    >
                      <Plus className="h-3 w-3" /> Save as template
                    </button>
                  )}
                </div>

                {scheduled && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-violet-50 border border-violet-200">
                    <Calendar className="h-4 w-4 text-violet-500 shrink-0" />
                    <input
                      type="date"
                      value={schedDate}
                      min={minDate}
                      onChange={e => setSchedDate(e.target.value)}
                      className="text-xs text-slate-700 border border-slate-200 rounded-lg px-2 py-1 bg-white outline-none focus:ring-2 focus:ring-violet-300"
                    />
                    <input
                      type="time"
                      value={schedTime}
                      onChange={e => setSchedTime(e.target.value)}
                      className="text-xs text-slate-700 border border-slate-200 rounded-lg px-2 py-1 bg-white outline-none focus:ring-2 focus:ring-violet-300"
                    />
                    <p className="text-[10px] text-violet-600 ml-auto">Email will send at this time</p>
                  </div>
                )}

                {sendError && (
                  <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{sendError}</div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-t border-slate-100 bg-slate-50/60 shrink-0">
              <button
                onClick={() => setStep('pick')}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-white transition-colors"
              >
                Back
              </button>
              <button
                onClick={send}
                disabled={sending || toEmails.length === 0 || !subject.trim() || isHtmlEmpty(body)}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60"
              >
                {sending
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                  : scheduled && schedDate
                    ? <><Clock className="h-4 w-4" /> Schedule</>
                    : <><Send className="h-4 w-4" /> Send Email</>}
              </button>
            </div>
          </>
        )}

        {/* ── STEP: Save template ───────────────────────────────────────────── */}
        {step === 'save_template' && (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
              <p className="text-xs text-slate-500 leading-relaxed">
                Save this draft as a reusable template. Placeholders like{' '}
                <code className="bg-slate-100 px-1 rounded text-slate-700">{'{{first_name}}'}</code> will be
                resolved automatically when you next use it.
              </p>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Template name</label>
                <input
                  autoFocus
                  value={tplName}
                  onChange={e => setTplName(e.target.value)}
                  placeholder="e.g. Interview Invite — Tech Roles"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 transition-colors"
                />
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Preview</p>
                <p className="text-xs font-medium text-slate-700 truncate">{subject || '(no subject)'}</p>
                <p className="text-[11px] text-slate-400 line-clamp-2">{stripHtml(body) || '(no body)'}</p>
              </div>
            </div>
            <div className="flex gap-2.5 px-5 py-3.5 border-t border-slate-100 bg-slate-50/60 shrink-0">
              <button onClick={() => setStep('compose')} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-white transition-colors">
                Cancel
              </button>
              <button
                onClick={saveTemplate}
                disabled={tplSaving || !tplName.trim()}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60"
              >
                {tplSaving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : 'Save Template'}
              </button>
            </div>
          </>
        )}

        {/* ── STEP: Sent confirmation ───────────────────────────────────────── */}
        {step === 'sent' && (
          <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-5">
            <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center">
              {sentSched ? <Clock className="h-7 w-7 text-emerald-600" /> : <Check className="h-7 w-7 text-emerald-600" />}
            </div>
            <div>
              <p className="text-base font-bold text-slate-900 mb-1">
                {sentSched ? 'Email scheduled!' : 'Email sent!'}
              </p>
              <p className="text-sm text-slate-500">
                {sentSched
                  ? `Will send on ${new Date(sentSched).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                  : `Delivered to ${toEmails.join(', ')}`}
              </p>
            </div>
            <div className="w-full rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-left">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Subject</p>
              <p className="text-sm font-medium text-slate-700">{sentSubject}</p>
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
