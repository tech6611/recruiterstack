'use client'

import Link from 'next/link'
import { useAuth } from '@clerk/nextjs'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Sparkles, UserCircle, Users } from 'lucide-react'
import { flags } from '@/lib/flags'
import type { HrCase, HrCaseAuthorRole, HrCaseMessage, HrCaseStatus } from '@/lib/types/database'

type CaseRow = HrCase & { requester: { name: string | null; email: string | null } | null }

const STATUS_BADGE: Record<HrCaseStatus, string> = {
  open:         'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  in_progress:  'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  resolved:     'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  closed:       'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
}

function authorLabel(role: HrCaseAuthorRole): { icon: React.ElementType; label: string; tone: string } {
  switch (role) {
    case 'agent':    return { icon: Sparkles,   label: 'AI assistant',  tone: 'text-violet-600' }
    case 'hr':       return { icon: Users,      label: 'You (HR)',      tone: 'text-emerald-600' }
    case 'employee': return { icon: UserCircle, label: 'Employee',      tone: 'text-slate-700' }
    case 'system':   return { icon: Sparkles,   label: 'System',        tone: 'text-slate-400' }
  }
}

export default function HrCaseAdminDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { orgId } = useAuth()
  const [hrCase, setCase] = useState<CaseRow | null>(null)
  const [messages, setMessages] = useState<HrCaseMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [reply, setReply] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetchAll = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const r = await fetch(`/api/hris/cases/${id}`)
    if (r.ok) {
      const j = await r.json()
      setCase(j.data?.case as CaseRow)
      setMessages((j.data?.messages ?? []) as HrCaseMessage[])
    }
    setLoading(false)
  }, [id])

  useEffect(() => { if (orgId) fetchAll() }, [fetchAll, orgId])

  async function sendReply() {
    if (!reply.trim()) return
    setSubmitting(true)
    const r = await fetch(`/api/hris/cases/${id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: reply.trim() }),
    })
    if (r.ok) { setReply(''); await fetchAll() }
    setSubmitting(false)
  }

  async function changeStatus(newStatus: HrCaseStatus) {
    const r = await fetch(`/api/hris/cases/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (r.ok) await fetchAll()
  }

  if (!flags.hris) return <div className="p-8 text-sm text-slate-500">The HRIS module is not enabled.</div>

  return (
    <div className="p-8">
      <Link href="/hris/cases" className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> All HR cases
      </Link>

      {loading ? (
        <div className="text-sm text-slate-400">Loading…</div>
      ) : !hrCase ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
          Case not found.
        </div>
      ) : (
        <>
          <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-slate-900">{hrCase.subject}</h1>
                <p className="mt-1 text-xs text-slate-500">
                  From <span className="font-medium text-slate-700">{hrCase.requester?.name ?? '—'}</span>{' '}
                  <span className="text-slate-400">({hrCase.requester?.email ?? '—'})</span>
                  {' · '}<span className="capitalize">{hrCase.category}</span>
                  {' · '}created {new Date(hrCase.created_at).toLocaleString()}
                </p>
                {hrCase.ai_attempted_at && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-violet-700">
                    <Sparkles className="h-3.5 w-3.5" />
                    AI took a first pass at {new Date(hrCase.ai_attempted_at).toLocaleString()}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[hrCase.status]}`}>
                  {hrCase.status.replace('_', ' ')}
                </span>
                <select
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                  value={hrCase.status}
                  onChange={e => changeStatus(e.target.value as HrCaseStatus)}
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{hrCase.body}</p>
          </div>

          {/* Thread */}
          <div className="space-y-3">
            {messages.map(m => {
              const { icon: Icon, label, tone } = authorLabel(m.author_role)
              const isAgent = m.author_role === 'agent'
              return (
                <div key={m.id} className={`rounded-xl border p-4 ${isAgent ? 'border-violet-200 bg-violet-50/40' : 'border-slate-200 bg-white'}`}>
                  <div className="mb-2 flex items-center gap-2 text-xs">
                    <Icon className={`h-4 w-4 ${tone}`} />
                    <span className={`font-semibold ${tone}`}>{label}</span>
                    <span className="text-slate-400">· {new Date(m.created_at).toLocaleString()}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-slate-700">{m.body}</p>
                </div>
              )
            })}
          </div>

          {/* HR reply box */}
          {hrCase.status !== 'closed' && (
            <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
              <textarea
                className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                rows={3}
                value={reply}
                onChange={e => setReply(e.target.value)}
                placeholder="Reply as HR…"
              />
              <div className="mt-2 flex justify-end">
                <button
                  onClick={sendReply}
                  disabled={!reply.trim() || submitting}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {submitting ? 'Sending…' : 'Send reply'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
