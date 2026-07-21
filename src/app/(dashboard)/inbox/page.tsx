'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import Link from 'next/link'
import {
  Inbox, RefreshCw, AlertCircle, ArrowRight, Clock,
  User, Briefcase, MessageSquare, MoveRight, CheckCircle, XCircle, Mail, Bot,
} from 'lucide-react'
import type { StageColor } from '@/lib/types/database'
import { timeAgo } from '@/lib/ui/date-utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CandidateMini { id: string; full_name: string; email: string }
interface JobMini       { id: string; position_title: string; department: string | null }

interface ActivityEvent {
  id:         string
  event_type: string
  from_stage: string | null
  to_stage:   string | null
  note:       string | null
  created_by: string | null
  created_at: string
  application: {
    id:        string
    status:    string
    candidate: CandidateMini | null
    job:       JobMini | null
  } | null
}

interface StaleApp {
  id:        string
  status:    string
  applied_at: string
  stage_id:  string | null
  candidate: CandidateMini | null
  job:       JobMini | null
  stage:     { name: string; color: StageColor } | null
}

interface InboxData {
  activity:        ActivityEvent[]
  needs_attention: StaleApp[]
}

interface EmailConversationSummary {
  id:                  string
  candidate_id:        string | null
  candidate_name:      string | null
  candidate_email:     string | null
  subject:             string | null
  status:              string
  agent_enabled:       boolean
  unread:              boolean
  last_message_preview: string | null
  last_message_at:     string | null
}

// ── Colour maps ───────────────────────────────────────────────────────────────

const STAGE_BADGE: Record<StageColor, string> = {
  slate:   'bg-slate-100 text-slate-600',
  blue:    'bg-slate-100 text-slate-700',
  violet:  'bg-slate-100 text-slate-700',
  amber:   'bg-amber-100 text-amber-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  green:   'bg-emerald-100 text-emerald-700',
  red:     'bg-red-100 text-red-700',
  pink:    'bg-slate-100 text-slate-700',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function staleDays(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

function eventLabel(e: ActivityEvent): { icon: React.ElementType; text: string; color: string } {
  switch (e.event_type) {
    case 'stage_moved':
      return {
        icon:  MoveRight,
        text:  e.from_stage && e.to_stage
                 ? `Moved from ${e.from_stage} → ${e.to_stage}`
                 : e.to_stage ? `Moved to ${e.to_stage}` : 'Stage updated',
        color: 'text-slate-600',
      }
    case 'note_added':
      return { icon: MessageSquare, text: e.note ?? 'Note added', color: 'text-slate-600' }
    case 'status_changed':
      if (e.to_stage === 'hired')    return { icon: CheckCircle, text: 'Marked as Hired',    color: 'text-emerald-600' }
      if (e.to_stage === 'rejected') return { icon: XCircle,     text: 'Marked as Rejected', color: 'text-red-600'     }
      return { icon: ArrowRight, text: `Status → ${e.to_stage ?? 'updated'}`, color: 'text-slate-600' }
    default:
      return { icon: ArrowRight, text: e.event_type.replace(/_/g, ' '), color: 'text-slate-500' }
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = 'activity' | 'attention' | 'conversations'

export default function InboxPage() {
  const { orgId } = useAuth()
  const [data, setData]       = useState<InboxData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [tab, setTab]         = useState<Tab>('activity')
  const [conversations, setConversations] = useState<EmailConversationSummary[]>([])
  const [convLoading, setConvLoading]     = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const res = await fetch('/api/inbox')
    if (!res.ok) { setError('Failed to load inbox'); setLoading(false); return }
    const json = await res.json()
    setData(json.data)
    setLoading(false)
  }, [])

  const loadConversations = useCallback(async () => {
    setConvLoading(true)
    try {
      const res = await fetch('/api/email-conversations')
      if (res.ok) {
        const json = await res.json()
        setConversations(json.data?.conversations ?? [])
      }
    } finally {
      setConvLoading(false)
    }
  }, [])

  useEffect(() => { if (orgId) load() }, [load, orgId])
  useEffect(() => { if (orgId) loadConversations() }, [loadConversations, orgId])

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col gap-6 px-8 py-8">
        <div className="h-8 w-40 rounded-xl bg-slate-200 animate-pulse" />
        <div className="h-10 w-72 rounded-xl bg-slate-200 animate-pulse" />
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-16 rounded-2xl bg-slate-200 animate-pulse" />
        ))}
      </div>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-slate-400">
        <Inbox className="h-8 w-8" />
        <p className="text-sm">{error || 'No data'}</p>
        <button onClick={load} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition-colors">
          Retry
        </button>
      </div>
    )
  }

  const { activity, needs_attention } = data

  return (
    <div className="flex flex-col gap-6 px-8 py-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Inbox</h1>
          <p className="text-sm text-slate-400 mt-0.5">Activity feed and candidates needing attention</p>
        </div>
        <button
          onClick={() => { load(); loadConversations() }}
          className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1 w-fit">
        {([
          { id: 'activity',      label: 'Activity Feed',   count: activity.length },
          { id: 'attention',     label: 'Needs Attention', count: needs_attention.length },
          { id: 'conversations', label: 'Conversations',   count: conversations.filter(c => c.unread).length },
        ] as { id: Tab; label: string; count: number }[]).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              tab === t.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
            <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
              tab === t.id
                ? t.id === 'attention' && t.count > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'
                : 'bg-slate-200 text-slate-500'
            }`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Activity Feed ────────────────────────────────────────────────── */}
      {tab === 'activity' && (
        <div className="rounded-2xl bg-white border border-slate-200 divide-y divide-slate-100">
          {activity.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-slate-400">
              <Inbox className="h-6 w-6" />
              <p className="text-sm">No activity yet.</p>
            </div>
          ) : activity.map(event => {
            const { icon: Icon, text, color } = eventLabel(event)
            const candidate = event.application?.candidate
            const job       = event.application?.job
            return (
              <div key={event.id} className="flex items-start gap-4 px-5 py-4">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100">
                  <Icon className={`h-4 w-4 ${color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${color}`}>{text}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    {candidate && (
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <User className="h-3 w-3" />
                        {event.application?.id
                          ? <Link href={`/applications/${event.application.id}`} className="hover:text-emerald-600 hover:underline">{candidate.full_name}</Link>
                          : candidate.full_name}
                      </span>
                    )}
                    {job && (
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <Briefcase className="h-3 w-3" />
                        <Link href={`/jobs/${job.id}`} className="hover:text-emerald-600 hover:underline">{job.position_title}</Link>
                        {job.department && <span>· {job.department}</span>}
                      </span>
                    )}
                  </div>
                  {event.event_type === 'note_added' && event.note && (
                    <p className="mt-1 text-xs text-slate-500 italic line-clamp-2">&ldquo;{event.note}&rdquo;</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-xs text-slate-400">{timeAgo(event.created_at)}</span>
                  {event.created_by && (
                    <span className="text-[10px] text-slate-300">{event.created_by}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Needs Attention ──────────────────────────────────────────────── */}
      {tab === 'attention' && (
        <div className="rounded-2xl bg-white border border-slate-200 divide-y divide-slate-100">
          {needs_attention.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-slate-400">
              <CheckCircle className="h-6 w-6 text-emerald-400" />
              <p className="text-sm">All caught up — no stale candidates.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 px-5 py-3 bg-amber-50 rounded-t-2xl">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                <p className="text-xs font-medium text-amber-700">
                  {needs_attention.length} active candidate{needs_attention.length !== 1 ? 's' : ''} with no movement for 14+ days
                </p>
              </div>
              {needs_attention.map(app => {
                const days  = staleDays(app.applied_at)
                const badge = app.stage?.color ? STAGE_BADGE[app.stage.color] : 'bg-slate-100 text-slate-600'
                return (
                  <div key={app.id} className="flex items-center gap-4 px-5 py-4">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
                      <Clock className="h-4 w-4 text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/applications/${app.id}`}
                          className="text-sm font-semibold text-slate-900 hover:text-emerald-600 hover:underline truncate"
                        >
                          {app.candidate?.full_name ?? 'Unknown'}
                        </Link>
                        {app.stage && (
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge}`}>
                            {app.stage.name}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        {app.candidate?.email && (
                          <span className="text-xs text-slate-400">{app.candidate.email}</span>
                        )}
                        {app.job && (
                          <span className="flex items-center gap-1 text-xs text-slate-400">
                            <Briefcase className="h-3 w-3" />
                            <Link href={`/jobs/${app.job.id}`} className="hover:text-emerald-600 hover:underline">
                              {app.job.position_title}
                            </Link>
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className={`text-sm font-bold ${days > 30 ? 'text-red-600' : 'text-amber-600'}`}>
                        {days}d
                      </span>
                      <p className="text-[10px] text-slate-400">inactive</p>
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}

      {/* ── Conversations (two-way email replies) ────────────────────────── */}
      {tab === 'conversations' && (
        <div className="rounded-2xl bg-white border border-slate-200 divide-y divide-slate-100">
          {convLoading ? (
            <div className="flex flex-col items-center gap-2 py-16 text-slate-400">
              <RefreshCw className="h-6 w-6 animate-spin" />
              <p className="text-sm">Loading conversations…</p>
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-slate-400">
              <Mail className="h-6 w-6" />
              <p className="text-sm">No email conversations yet.</p>
              <p className="text-xs text-slate-300">A thread appears here when a candidate replies to a sequence email.</p>
            </div>
          ) : conversations.map(conv => (
            <div key={conv.id} className="flex items-start gap-4 px-5 py-4">
              <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${conv.unread ? 'bg-indigo-100' : 'bg-slate-100'}`}>
                <Mail className={`h-4 w-4 ${conv.unread ? 'text-indigo-600' : 'text-slate-500'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {conv.candidate_id ? (
                    <Link
                      href={`/candidates/${conv.candidate_id}`}
                      className={`text-sm ${conv.unread ? 'font-bold text-slate-900' : 'font-semibold text-slate-800'} hover:text-indigo-600 hover:underline truncate`}
                    >
                      {conv.candidate_name ?? conv.candidate_email ?? 'Candidate'}
                    </Link>
                  ) : (
                    <span className="text-sm font-semibold text-slate-800 truncate">
                      {conv.candidate_name ?? conv.candidate_email ?? 'Candidate'}
                    </span>
                  )}
                  {conv.unread && (
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">New</span>
                  )}
                  {conv.agent_enabled && (
                    <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                      <Bot className="h-3 w-3" /> AI
                    </span>
                  )}
                </div>
                {conv.subject && <p className="mt-0.5 text-xs font-medium text-slate-500 truncate">{conv.subject}</p>}
                {conv.last_message_preview && (
                  <p className="mt-0.5 text-xs text-slate-400 line-clamp-1">{conv.last_message_preview}</p>
                )}
              </div>
              <div className="shrink-0 text-right">
                {conv.last_message_at && <span className="text-xs text-slate-400">{timeAgo(conv.last_message_at)}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
