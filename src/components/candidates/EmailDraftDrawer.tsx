'use client'

import { useState, useEffect, useRef, useCallback, KeyboardEvent } from 'react'
import {
  Wand2, X, Send, Loader2, Check, ChevronDown,
  Plus, Trash2, Clock, Calendar, Pencil,
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolvePlaceholders(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (vars[key] !== undefined && vars[key] !== '') return vars[key]
    const label = key.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
    return `[${label}]`
  })
}

function textToHtml(text: string): string {
  let html = ''
  for (const line of text.split('\n')) {
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
    if (isEmail(trimmed) && !emails.includes(trimmed)) onChange([...emails, trimmed])
    setInput('')
  }

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',' || e.key === ' ') && input.trim()) {
      e.preventDefault(); addEmail(input)
    }
    if (e.key === 'Backspace' && !input && emails.length > 0) onChange(emails.slice(0, -1))
  }

  return (
    <div
      className="flex flex-wrap gap-1 px-2 py-1.5 min-h-[34px] rounded-lg border border-slate-200 bg-white focus-within:ring-2 focus-within:ring-violet-300 focus-within:border-violet-400 cursor-text"
      onClick={() => inputRef.current?.focus()}
    >
      {emails.map(email => (
        <span key={email} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
          {email}
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onChange(emails.filter(m => m !== email)) }}
            aria-label="Remove email"
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

type Step = 'compose' | 'sent'

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

  const [step, setStep] = useState<Step>('compose')

  // Saved templates
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>([])
  const [tplLoading,     setTplLoading]     = useState(true)

  // Dropdown open states
  const [builtInOpen, setBuiltInOpen] = useState(false)
  const [myTplOpen,   setMyTplOpen]   = useState(false)
  const [aiOpen,      setAiOpen]      = useState(false)

  // Refs for outside-click dismissal
  const builtInRef = useRef<HTMLDivElement>(null)
  const myTplRef   = useRef<HTMLDivElement>(null)
  const aiRef      = useRef<HTMLDivElement>(null)

  // Inline "save current email as template" form (inside My Templates dropdown)
  const [addingTpl,  setAddingTpl]  = useState(false)
  const [newTplName, setNewTplName] = useState('')
  const [tplSaving,  setTplSaving]  = useState(false)
  const [tplError,   setTplError]   = useState('')

  // Inline rename for My Templates
  const [renamingId,   setRenamingId]   = useState<string | null>(null)
  const [renamingName, setRenamingName] = useState('')

  // Compose fields
  const [toEmails,  setToEmails]  = useState<string[]>([candidateEmail].filter(Boolean))
  const [ccEmails,  setCcEmails]  = useState<string[]>([])
  const [bccEmails, setBccEmails] = useState<string[]>([])
  const [showCc,    setShowCc]    = useState(false)
  const [showBcc,   setShowBcc]   = useState(false)
  const [subject,   setSubject]   = useState('')
  const [body,      setBody]      = useState('')
  // Incrementing this key forces Tiptap to remount (re-read `value`) when
  // a template or AI draft replaces the body — Tiptap is uncontrolled after mount.
  const [editorKey, setEditorKey] = useState(0)

  // Drawer resize (drag left edge)
  const [drawerWidth, setDrawerWidth] = useState(560)
  const isDragging   = useRef(false)
  const dragStartX   = useRef(0)
  const dragStartW   = useRef(0)

  // Multi-draft support (Gmail-style)
  interface EmailDraftRecord {
    id: string; name: string; subject: string; body: string
    updated_at: string; to_emails: string[]; cc_emails: string[]; bcc_emails: string[]
  }
  const currentDraftIdRef = useRef<string | null>(null)
  const [allDrafts,       setAllDrafts]       = useState<EmailDraftRecord[]>([])
  const [showDraftsPanel, setShowDraftsPanel] = useState(false)

  // Draft auto-save status
  const [draftStatus,    setDraftStatus]    = useState<'idle' | 'saving' | 'saved'>('idle')
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Schedule send
  const [scheduled, setScheduled] = useState(false)
  const [schedDate, setSchedDate] = useState('')
  const [schedTime, setSchedTime] = useState('09:00')

  // AI generation
  const [generating, setGenerating] = useState(false)
  const [genError,   setGenError]   = useState('')

  // Send
  const [sending,     setSending]     = useState(false)
  const [sendError,   setSendError]   = useState('')
  const [sentSubject, setSentSubject] = useState('')
  const [sentSched,   setSentSched]   = useState<string | null>(null)

  // ── Load saved templates ──────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/email-templates')
      .then(r => r.json())
      .then(json => { if (json.data) setSavedTemplates(json.data) })
      .catch(() => {})
      .finally(() => setTplLoading(false))
  }, [])

  // ── Escape key closes the drawer ─────────────────────────────────────────

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // ── Close all dropdowns on outside click ──────────────────────────────────

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (builtInRef.current && !builtInRef.current.contains(e.target as Node)) setBuiltInOpen(false)
      if (aiRef.current      && !aiRef.current.contains(e.target as Node))      setAiOpen(false)
      if (myTplRef.current   && !myTplRef.current.contains(e.target as Node)) {
        setMyTplOpen(false)
        setAddingTpl(false)
        setNewTplName('')
        setRenamingId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Drag-to-resize handler ────────────────────────────────────────────────

  const onDragHandleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current  = true
    dragStartX.current  = e.clientX
    dragStartW.current  = drawerWidth
    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return
      const delta  = dragStartX.current - ev.clientX
      const clamped = Math.min(Math.max(dragStartW.current + delta, 440), window.innerWidth * 0.85)
      setDrawerWidth(clamped)
    }
    const onUp = () => {
      isDragging.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
  }, [drawerWidth])

  // ── Load all drafts on mount — restore most recent ───────────────────────

  useEffect(() => {
    fetch(`/api/applications/${appId}/draft`)
      .then(r => r.json())
      .then(json => {
        const drafts: EmailDraftRecord[] = json.data ?? []
        setAllDrafts(drafts)
        if (drafts.length === 0) return
        const d = drafts[0] // most-recent first (API sorts by updated_at desc)
        currentDraftIdRef.current = d.id
        if (d.to_emails?.length)  setToEmails(d.to_emails)
        if (d.cc_emails?.length)  { setCcEmails(d.cc_emails); setShowCc(true) }
        if (d.bcc_emails?.length) { setBccEmails(d.bcc_emails); setShowBcc(true) }
        if (d.subject) setSubject(d.subject)
        if (d.body)    { setBody(d.body); setEditorKey(k => k + 1) }
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId])

  // ── Debounced auto-save whenever compose fields change ────────────────────

  useEffect(() => {
    // Don't auto-save if nothing has been typed yet (only default recipient)
    if (!subject && isHtmlEmpty(body) && toEmails.length <= 1 && ccEmails.length === 0 && bccEmails.length === 0) return
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current)
    setDraftStatus('saving')
    draftSaveTimer.current = setTimeout(async () => {
      try {
        const payload = { to_emails: toEmails, cc_emails: ccEmails, bcc_emails: bccEmails, subject, body }
        const draftId = currentDraftIdRef.current

        let savedDraft: EmailDraftRecord | null = null
        if (draftId) {
          // Update existing draft
          const res = await fetch(`/api/applications/${appId}/draft?draft_id=${draftId}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
          savedDraft = (await res.json()).data ?? null
        } else {
          // Create new draft and remember its ID
          const res = await fetch(`/api/applications/${appId}/draft`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
          savedDraft = (await res.json()).data ?? null
          if (savedDraft?.id) {
            currentDraftIdRef.current = savedDraft.id
            setAllDrafts(prev => [savedDraft!, ...prev])
          }
        }
        if (savedDraft) {
          setAllDrafts(prev => prev.map(d => d.id === savedDraft!.id ? savedDraft! : d))
        }
        setDraftStatus('saved')
        setTimeout(() => setDraftStatus('idle'), 3000)
      } catch {
        setDraftStatus('idle')
      }
    }, 1500)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, body, toEmails, ccEmails, bccEmails])

  // ── Placeholder vars ──────────────────────────────────────────────────────

  const vars: Record<string, string> = {
    first_name:      candidateName.split(' ')[0] || candidateName,
    position_title:  positionTitle                || '',
    company_name:    settings.company_name        || '',
    recruiter_name:  settings.recruiter_name      || '',
    recruiter_title: settings.recruiter_title     || '',
  }

  // ── Apply template (fills subject + body immediately) ─────────────────────

  const applyTemplate = (tpl: AnyTemplate) => {
    setSubject(resolvePlaceholders(tpl.subject, vars))
    const resolved = resolvePlaceholders(tpl.body, vars)
    setBody(tpl.kind === 'saved' ? resolved : textToHtml(resolved))
    setEditorKey(k => k + 1) // force Tiptap remount with new content
  }

  // ── Generate with AI (fills subject + body via API) ───────────────────────

  const generateWithAI = async (tplId: string) => {
    setGenerating(true); setGenError(''); setAiOpen(false)
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
    setEditorKey(k => k + 1) // force Tiptap remount with new content
  }

  // ── Save current compose as a new "My Template" ───────────────────────────

  const addTemplate = async () => {
    if (!newTplName.trim()) return
    setTplSaving(true); setTplError('')
    const res = await fetch('/api/email-templates', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newTplName.trim(), subject: subject.trim() || '(no subject)', body }),
    })
    const json = await res.json()
    setTplSaving(false)
    if (!res.ok) { setTplError(json.error ?? 'Failed to save template'); return }
    setSavedTemplates(prev => [...prev, json.data])
    setNewTplName('')
    setAddingTpl(false)
  }

  // ── Rename a saved template inline ────────────────────────────────────────

  const renameTemplate = async (id: string, name: string) => {
    if (!name.trim()) { setRenamingId(null); return }
    await fetch(`/api/email-templates/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    })
    setSavedTemplates(prev => prev.map(t => t.id === id ? { ...t, name: name.trim() } : t))
    setRenamingId(null)
  }

  // ── Delete a saved template ───────────────────────────────────────────────

  const deleteTemplate = async (id: string) => {
    await fetch(`/api/email-templates/${id}`, { method: 'DELETE' })
    setSavedTemplates(prev => prev.filter(t => t.id !== id))
  }

  // ── Send email ────────────────────────────────────────────────────────────

  const send = async () => {
    if (toEmails.length === 0)                     { setSendError('Add at least one recipient.'); return }
    if (!subject.trim() || isHtmlEmpty(body))      { setSendError('Subject and body are required.'); return }
    if (scheduled && !schedDate)                   { setSendError('Pick a date to schedule the send.'); return }

    setSending(true); setSendError('')

    let sendAt: number | undefined
    if (scheduled && schedDate) {
      const dt = new Date(`${schedDate}T${schedTime || '09:00'}:00`)
      sendAt = Math.floor(dt.getTime() / 1000)
    }

    const res = await fetch(`/api/applications/${appId}/send-email`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject:    subject.trim(),
        body:       stripHtml(body),
        body_html:  body,
        from_name:  settings.recruiter_name || undefined,
        to_emails:  toEmails,
        cc_emails:  ccEmails.length  > 0 ? ccEmails  : undefined,
        bcc_emails: bccEmails.length > 0 ? bccEmails : undefined,
        send_at:    sendAt,
      }),
    })
    const json = await res.json()
    setSending(false)
    if (!res.ok) { setSendError(json.error ?? 'Failed to send email'); return }
    setSentSubject(subject.trim())
    setSentSched(scheduled && schedDate ? `${schedDate}T${schedTime}` : null)
    setStep('sent')
    onSent?.()
    // Delete the specific draft that was just sent
    const sentDraftId = currentDraftIdRef.current
    if (sentDraftId) {
      fetch(`/api/applications/${appId}/draft?draft_id=${sentDraftId}`, { method: 'DELETE' }).catch(() => {})
    }
  }

  const fromName = settings.recruiter_name || 'RecruiterStack'
  const minDate  = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0] })()

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="email-draft-title" className="relative flex h-full flex-col bg-white shadow-2xl" style={{ width: drawerWidth }}>
          {/* Drag handle — grab left edge to resize */}
          <div
            onMouseDown={onDragHandleMouseDown}
            className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-violet-400/40 active:bg-violet-400/60 transition-colors z-20"
            title="Drag to resize"
          />

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 shrink-0">
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-violet-500" />
            <h2 id="email-draft-title" className="text-sm font-bold text-slate-900">
              {step === 'sent' ? 'Email Sent' : 'Draft Email'}
            </h2>
            {draftStatus === 'saving' && <span className="text-[10px] text-slate-400">Saving draft…</span>}
            {draftStatus === 'saved'  && <span className="text-[10px] text-emerald-500">✓ Draft saved</span>}
          </div>
          <div className="flex items-center gap-1.5">
            {step === 'compose' && allDrafts.length > 0 && (
              <button
                onClick={() => setShowDraftsPanel(p => !p)}
                className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold transition-colors ${
                  showDraftsPanel
                    ? 'bg-violet-100 text-violet-700'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                }`}
              >
                📄 {allDrafts.length} draft{allDrafts.length > 1 ? 's' : ''}
                <ChevronDown className={`h-2.5 w-2.5 transition-transform ${showDraftsPanel ? 'rotate-180' : ''}`} />
              </button>
            )}
            <button onClick={onClose} aria-label="Close email drawer" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── COMPOSE ──────────────────────────────────────────────────────── */}
        {step === 'compose' && (
          <>
            {/* ── Drafts panel ─────────────────────────────────────────────── */}
            {showDraftsPanel && (
              <div className="shrink-0 border-b border-slate-200 bg-slate-50">
                <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Saved Drafts</span>
                  <button
                    onClick={() => {
                      // Start a fresh draft — clear compose + reset ID
                      currentDraftIdRef.current = null
                      setToEmails([candidateEmail].filter(Boolean))
                      setCcEmails([]); setBccEmails([]); setShowCc(false); setShowBcc(false)
                      setSubject(''); setBody(''); setEditorKey(k => k + 1)
                      setShowDraftsPanel(false)
                    }}
                    className="flex items-center gap-0.5 text-[10px] font-semibold text-violet-600 hover:text-violet-800 transition-colors"
                  >
                    <Plus className="h-2.5 w-2.5" /> New Draft
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
                  {allDrafts.map(d => {
                    const isActive = currentDraftIdRef.current === d.id
                    return (
                      <button
                        key={d.id}
                        onClick={() => {
                          currentDraftIdRef.current = d.id
                          setToEmails(d.to_emails?.length ? d.to_emails : [candidateEmail].filter(Boolean))
                          if (d.cc_emails?.length)  { setCcEmails(d.cc_emails);  setShowCc(true)  } else { setCcEmails([]);  setShowCc(false)  }
                          if (d.bcc_emails?.length) { setBccEmails(d.bcc_emails); setShowBcc(true) } else { setBccEmails([]); setShowBcc(false) }
                          setSubject(d.subject || '')
                          setBody(d.body || ''); setEditorKey(k => k + 1)
                          setShowDraftsPanel(false)
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white transition-colors ${isActive ? 'bg-white' : ''}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-700 truncate">{d.subject || '(no subject)'}</p>
                          <p className="text-[10px] text-slate-400">
                            {new Date(d.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        {isActive && <Check className="h-3 w-3 text-violet-500 shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto">

              {/* ── Row 1: To ──────────────────────────────────────────────── */}
              <div className="flex items-start gap-3 px-5 py-2.5 border-b border-slate-100">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 w-7 shrink-0 pt-1.5">To</span>
                <div className="flex-1 min-w-0">
                  <EmailTagsInput emails={toEmails} onChange={setToEmails} placeholder="Add recipient…" />
                </div>
                <div className="flex items-center gap-1.5 shrink-0 pt-1">
                  {!showCc  && <button onClick={() => setShowCc(true)}  className="text-[10px] font-medium text-slate-400 hover:text-violet-600 transition-colors">Cc</button>}
                  {!showBcc && <button onClick={() => setShowBcc(true)} className="text-[10px] font-medium text-slate-400 hover:text-violet-600 transition-colors">Bcc</button>}
                </div>
              </div>

              {/* ── Row 2: Template toolbar ────────────────────────────────── */}
              <div className="flex items-center gap-2 px-5 py-2.5 border-b border-slate-100 flex-wrap">

                {/* Built-in Templates dropdown */}
                <div ref={builtInRef} className="relative">
                  <button
                    onClick={() => { setBuiltInOpen(o => !o); setMyTplOpen(false); setAiOpen(false) }}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border transition-colors ${
                      builtInOpen
                        ? 'border-violet-400 bg-violet-50 text-violet-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    📧 Built-in Templates <ChevronDown className="h-3 w-3 opacity-60" />
                  </button>

                  {builtInOpen && (
                    <div className="absolute top-full left-0 mt-1.5 z-30 w-60 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden">
                      {BUILT_IN_META.map(m => (
                        <button
                          key={m.id}
                          onClick={() => {
                            applyTemplate({ kind: 'builtin', id: m.id, name: m.name, emoji: m.emoji, subject: BUILT_IN_SUBJECTS[m.id], body: BUILT_IN_BODIES[m.id] })
                            setBuiltInOpen(false)
                          }}
                          className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-violet-50 transition-colors"
                        >
                          <span className="text-base shrink-0">{m.emoji}</span>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-700">{m.name}</p>
                            <p className="text-[10px] text-slate-400 truncate">{m.desc}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* My Templates dropdown + (+) add button */}
                <div ref={myTplRef} className="relative flex items-center gap-1">
                  <button
                    onClick={() => { setMyTplOpen(o => !o); setBuiltInOpen(false); setAiOpen(false) }}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border transition-colors ${
                      myTplOpen
                        ? 'border-violet-400 bg-violet-50 text-violet-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    📋 My Templates <ChevronDown className="h-3 w-3 opacity-60" />
                  </button>

                  {/* (+) saves current compose as a new template */}
                  <button
                    onClick={() => { setAddingTpl(true); setMyTplOpen(true); setBuiltInOpen(false); setAiOpen(false) }}
                    className="flex items-center justify-center w-6 h-6 rounded-lg border border-slate-200 text-slate-500 hover:border-violet-400 hover:text-violet-600 hover:bg-violet-50 transition-colors"
                    title="Save current email as a template"
                  >
                    <Plus className="h-3 w-3" />
                  </button>

                  {myTplOpen && (
                    <div className="absolute top-full left-0 mt-1.5 z-30 w-72 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden">

                      {/* Inline "save current email as template" form */}
                      {addingTpl && (
                        <div className="px-3 py-2.5 bg-violet-50/60 border-b border-violet-100">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-600 mb-1.5">Save as template</p>
                          <div className="flex gap-1.5">
                            <input
                              autoFocus
                              value={newTplName}
                              onChange={e => { setNewTplName(e.target.value); setTplError('') }}
                              onKeyDown={e => {
                                if (e.key === 'Enter')  addTemplate()
                                if (e.key === 'Escape') { setAddingTpl(false); setNewTplName(''); setTplError('') }
                              }}
                              placeholder="Template name…"
                              className="flex-1 text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 bg-white"
                            />
                            <button
                              onClick={addTemplate}
                              disabled={tplSaving || !newTplName.trim()}
                              aria-label="Save template"
                              className="flex items-center justify-center w-8 shrink-0 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 transition-colors"
                            >
                              {tplSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                          {tplError && (
                            <p className="text-[10px] text-red-500 mt-1.5">{tplError}</p>
                          )}
                        </div>
                      )}

                      {/* Saved templates list */}
                      {tplLoading ? (
                        <div className="px-4 py-3 text-xs text-slate-400 animate-pulse">Loading…</div>
                      ) : savedTemplates.length === 0 ? (
                        <div className="px-4 py-4 text-center">
                          <p className="text-xs text-slate-400 italic">No templates saved yet.</p>
                          <p className="text-[10px] text-slate-300 mt-0.5">Compose an email and click (+) to save it here.</p>
                        </div>
                      ) : (
                        <div className="max-h-64 overflow-y-auto divide-y divide-slate-50">
                          {savedTemplates.map(t => (
                            <div key={t.id} className="flex items-center gap-1 px-3 py-2.5 hover:bg-slate-50 group transition-colors">
                              {renamingId === t.id ? (
                                /* Inline rename input */
                                <>
                                  <input
                                    autoFocus
                                    value={renamingName}
                                    onChange={e => setRenamingName(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter')  renameTemplate(t.id, renamingName)
                                      if (e.key === 'Escape') setRenamingId(null)
                                    }}
                                    onBlur={() => renameTemplate(t.id, renamingName)}
                                    className="flex-1 text-xs border border-violet-300 rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-violet-300 bg-white"
                                  />
                                  <button
                                    onClick={() => setRenamingId(null)}
                                    aria-label="Cancel rename"
                                    className="p-1 text-slate-400 hover:text-slate-600 transition-colors shrink-0"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </>
                              ) : (
                                /* Template row */
                                <>
                                  <button
                                    className="flex-1 text-left min-w-0"
                                    onClick={() => {
                                      applyTemplate({ kind: 'saved', id: t.id, name: t.name, emoji: '📋', subject: t.subject, body: t.body })
                                      setMyTplOpen(false)
                                    }}
                                  >
                                    <p className="text-xs font-semibold text-slate-700 truncate">{t.name}</p>
                                    <p className="text-[10px] text-slate-400 truncate">{t.subject}</p>
                                  </button>
                                  <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={e => { e.stopPropagation(); setRenamingId(t.id); setRenamingName(t.name) }}
                                      className="p-1 rounded text-slate-300 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                                      title="Rename"
                                      aria-label="Rename template"
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                    <button
                                      onClick={e => { e.stopPropagation(); deleteTemplate(t.id) }}
                                      className="p-1 rounded text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                                      title="Delete"
                                      aria-label="Delete template"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* AI Draft dropdown — right-aligned */}
                <div ref={aiRef} className="relative ml-auto">
                  <button
                    onClick={() => { setAiOpen(o => !o); setBuiltInOpen(false); setMyTplOpen(false) }}
                    disabled={generating}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border transition-colors disabled:opacity-50 ${
                      aiOpen
                        ? 'border-violet-400 bg-violet-50 text-violet-700'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    {generating
                      ? <><Loader2 className="h-3 w-3 animate-spin" /> Generating…</>
                      : <><Wand2 className="h-3 w-3 text-violet-500" /> AI Draft <ChevronDown className="h-3 w-3 opacity-60" /></>}
                  </button>

                  {aiOpen && (
                    <div className="absolute top-full right-0 mt-1.5 z-30 w-52 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden">
                      <p className="px-3.5 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Generate with AI</p>
                      {BUILT_IN_META.map(m => (
                        <button
                          key={m.id}
                          onClick={() => generateWithAI(m.id)}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left hover:bg-violet-50 transition-colors"
                        >
                          <span className="text-sm shrink-0">{m.emoji}</span>
                          <p className="text-xs font-medium text-slate-700">{m.name}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Row 3+: Full compose interface ─────────────────────────── */}

              {/* Cc */}
              {showCc && (
                <div className="flex items-start gap-3 px-5 py-2 border-b border-slate-100">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 w-7 shrink-0 pt-1.5">Cc</span>
                  <div className="flex-1 min-w-0">
                    <EmailTagsInput emails={ccEmails} onChange={setCcEmails} placeholder="Add CC…" />
                  </div>
                  <button onClick={() => { setShowCc(false); setCcEmails([]) }} aria-label="Remove CC field" className="shrink-0 pt-1.5 text-slate-300 hover:text-red-400 transition-colors">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}

              {/* Bcc */}
              {showBcc && (
                <div className="flex items-start gap-3 px-5 py-2 border-b border-slate-100">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 w-7 shrink-0 pt-1.5">Bcc</span>
                  <div className="flex-1 min-w-0">
                    <EmailTagsInput emails={bccEmails} onChange={setBccEmails} placeholder="Add BCC…" />
                  </div>
                  <button onClick={() => { setShowBcc(false); setBccEmails([]) }} aria-label="Remove BCC field" className="shrink-0 pt-1.5 text-slate-300 hover:text-red-400 transition-colors">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}

              {/* From (read-only) */}
              <div className="flex items-center gap-3 px-5 py-2 border-b border-slate-100">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 w-7 shrink-0">From</span>
                <span className="text-xs text-slate-500 truncate">{fromName}</span>
              </div>

              {/* Subject */}
              <div className="flex items-center gap-3 px-5 py-2 border-b border-slate-100">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 w-7 shrink-0">Re</span>
                <input
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="Subject line…"
                  className="flex-1 text-sm font-medium text-slate-800 outline-none bg-transparent placeholder-slate-300"
                />
              </div>

              {/* Body */}
              <div className="px-5 py-4">
                <RichTextEditor
                  key={editorKey}
                  value={body}
                  onChange={setBody}
                  placeholder="Compose your message… or pick a template above to get started."
                  minHeight={260}
                />
              </div>

              {/* Schedule send + errors */}
              <div className="px-5 pb-5 space-y-2">
                <button
                  onClick={() => setScheduled(s => !s)}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border transition-colors ${
                    scheduled
                      ? 'border-violet-400 bg-violet-50 text-violet-700'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Clock className="h-3 w-3" /> Schedule send
                </button>

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

                {genError  && <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{genError}</div>}
                {sendError && <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{sendError}</div>}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center px-5 py-3.5 border-t border-slate-100 bg-slate-50/60 shrink-0">
              <button
                onClick={send}
                disabled={sending || toEmails.length === 0 || !subject.trim() || isHtmlEmpty(body)}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60"
              >
                {sending
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                  : scheduled && schedDate
                    ? <><Clock className="h-4 w-4" /> Schedule Email</>
                    : <><Send className="h-4 w-4" /> Send Email</>}
              </button>
            </div>
          </>
        )}

        {/* ── SENT confirmation ─────────────────────────────────────────────── */}
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
