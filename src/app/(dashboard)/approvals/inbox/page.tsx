'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckSquare, ChevronDown, ChevronRight, Clock, CheckCircle, XCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { StatCards } from '@/components/ui/stat-cards'
import { DecisionModal } from '@/components/approvals/DecisionModal'
import { cn } from '@/lib/utils'

interface InboxItem {
  approval_id:        string
  step_id:            string
  step_index:         number
  target_type:        string
  target_id:          string
  target_title:       string
  target_type_label:  string
  requested_by_name:  string | null
  activated_at:       string
  due_at:             string | null
}

interface HistoryItem {
  approval_id:        string
  target_type:        string
  target_id:          string
  target_title:       string
  target_type_label:  string
  status:             string
  requested_by_name:  string | null
  my_decision:        'approved' | 'rejected'
  my_decision_at:     string
  created_at:         string
  completed_at:       string | null
}

/** Detail-page route for a given approval target. */
function targetHref(targetType: string, targetId: string): string {
  switch (targetType) {
    case 'opening': return `/openings/${targetId}`
    case 'job':     return `/req-jobs/${targetId}`
    default:        return '#'
  }
}

const STATUS_BADGE: Record<string, string> = {
  pending:   'bg-amber-100 text-amber-800',
  approved:  'bg-emerald-100 text-emerald-800',
  rejected:  'bg-red-100 text-red-700',
  cancelled: 'bg-slate-200 text-slate-600',
}

// Foldable pane header tints — same treatment as the Requisitions / Jobs list
// pages and the Approval chains page: Pending gets the honey "waiting" tint,
// History the muted stone "past" tint.
type PaneTone = { bar: string; title: string; chevron: string; badge: string }
const PANE_TINT: { pending: PaneTone; history: PaneTone } = {
  pending: { bar: 'bg-[#fbe7bc] hover:bg-[#f7dfae]', title: 'text-[#6f450f]', chevron: 'text-[#b97e14]', badge: 'text-[#8a5a14]' },
  history: { bar: 'bg-[#eae6dd] hover:bg-[#e0dbce]', title: 'text-[#4f483d]', chevron: 'text-[#9a8f7d]', badge: 'text-[#8a7f6f]' },
}

export default function ApprovalInboxPage() {
  const [items, setItems]     = useState<InboxItem[]>([])
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [loaded, setLoaded]   = useState(false)
  const [open,  setOpen]      = useState<InboxItem | null>(null)
  const [pendingOpen, setPendingOpen] = useState(true)
  const [historyOpen, setHistoryOpen] = useState(true)

  // History filters
  const [q, setQ]               = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter]     = useState('all')

  async function refresh() {
    const [inboxRes, histRes] = await Promise.all([
      fetch('/api/approvals/inbox'),
      fetch('/api/approvals/history'),
    ])
    const inboxBody = await inboxRes.json()
    const histBody  = await histRes.json()
    setItems(inboxBody.data ?? [])
    setHistory(histBody.data ?? [])
    setLoaded(true)
  }

  useEffect(() => { refresh() }, [])

  const filteredHistory = history.filter(h => {
    if (statusFilter !== 'all' && h.status !== statusFilter) return false
    if (typeFilter !== 'all' && h.target_type !== typeFilter) return false
    if (q.trim()) {
      const needle = q.trim().toLowerCase()
      const hay = `${h.target_title} ${h.requested_by_name ?? ''}`.toLowerCase()
      if (!hay.includes(needle)) return false
    }
    return true
  })

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 mb-6">
        <CheckSquare className="h-6 w-6 text-emerald-600" />
        <h1 className="text-2xl font-semibold text-slate-900">Approvals</h1>
      </div>

      {!loaded ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <div className="space-y-4">
          {/* Summary stat cards — same at-a-glance strip as the other list pages. */}
          <StatCards
            cards={[
              { key: 'total',    label: 'Total',      value: items.length + history.length,                              tone: 'slate', icon: <CheckSquare className="h-4 w-4" /> },
              { key: 'pending',  label: 'Pending',    value: items.length,                                               tone: 'amber', icon: <Clock className="h-4 w-4" /> },
              { key: 'approved', label: 'Approved',   value: history.filter(h => h.my_decision === 'approved').length,   tone: 'pine',  icon: <CheckCircle className="h-4 w-4" /> },
              { key: 'rejected', label: 'Rejected',   value: history.filter(h => h.my_decision === 'rejected').length,   tone: 'stone', icon: <XCircle className="h-4 w-4" /> },
            ]}
          />

          {/* ── Pending decisions (foldable pane) ─────────────────── */}
          <Card className="overflow-clip border-slate-300 shadow-sm">
            <button
              type="button"
              onClick={() => setPendingOpen(o => !o)}
              className={cn('flex w-full items-center gap-2 px-4 py-3 text-left transition-colors', PANE_TINT.pending.bar)}
            >
              {pendingOpen
                ? <ChevronDown className={cn('h-4 w-4 shrink-0', PANE_TINT.pending.chevron)} />
                : <ChevronRight className={cn('h-4 w-4 shrink-0', PANE_TINT.pending.chevron)} />}
              <span className={cn('text-sm font-semibold uppercase tracking-wide', PANE_TINT.pending.title)}>Pending decisions</span>
              <span className={cn('inline-flex items-center justify-center rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold', PANE_TINT.pending.badge)}>
                {items.length}
              </span>
            </button>

            {pendingOpen && (
              items.length === 0 ? (
                <p className="border-t border-slate-100 py-8 text-center text-sm text-slate-500">No pending decisions.</p>
              ) : (
                <div className="space-y-3 border-t border-slate-100 p-3">
                  {items.map(item => {
                    const isOverdue = item.due_at != null && new Date(item.due_at).getTime() < Date.now()
                    return (
                      <Card key={item.step_id}>
                        <CardContent>
                          <div className="flex items-center justify-between gap-4 py-1">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="inline-flex shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                  {item.target_type_label}
                                </span>
                                <Link href={targetHref(item.target_type, item.target_id)} className="truncate text-sm font-semibold text-slate-900 hover:text-emerald-700">
                                  {item.target_title}
                                </Link>
                              </div>
                              <div className="text-xs text-slate-500 mt-0.5">
                                {item.requested_by_name && <>Requested by {item.requested_by_name} · </>}
                                Step {item.step_index + 1} · activated {new Date(item.activated_at).toLocaleString()}
                                {item.due_at && (
                                  <span className={isOverdue ? 'text-red-600 font-medium ml-2' : 'text-amber-700 ml-2'}>
                                    · due {new Date(item.due_at).toLocaleString()}
                                  </span>
                                )}
                              </div>
                            </div>
                            <Button onClick={() => setOpen(item)} size="sm">Decide</Button>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )
            )}
          </Card>

          {/* ── History (foldable pane) ───────────────────────────── */}
          <Card className="overflow-clip border-slate-300 shadow-sm">
            <button
              type="button"
              onClick={() => setHistoryOpen(o => !o)}
              className={cn('flex w-full items-center gap-2 px-4 py-3 text-left transition-colors', PANE_TINT.history.bar)}
            >
              {historyOpen
                ? <ChevronDown className={cn('h-4 w-4 shrink-0', PANE_TINT.history.chevron)} />
                : <ChevronRight className={cn('h-4 w-4 shrink-0', PANE_TINT.history.chevron)} />}
              <span className={cn('text-sm font-semibold uppercase tracking-wide', PANE_TINT.history.title)}>History</span>
              <span className={cn('inline-flex items-center justify-center rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold', PANE_TINT.history.badge)}>
                {history.length}
              </span>
            </button>

            {historyOpen && (
              <div className="border-t border-slate-100">
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
                  <Input
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    placeholder="Search title or requester…"
                    className="h-8 w-56 text-sm"
                  />
                  <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="h-8 text-sm">
                    <option value="all">All statuses</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                    <option value="pending">Pending</option>
                    <option value="cancelled">Cancelled</option>
                  </Select>
                  <Select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="h-8 text-sm">
                    <option value="all">All types</option>
                    <option value="job">Job posting</option>
                    <option value="opening">Requisition</option>
                    <option value="offer">Offer</option>
                  </Select>
                </div>

                {filteredHistory.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-500">
                    {history.length === 0 ? "You haven't decided on any approvals yet." : 'No approvals match these filters.'}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          <th className="px-4 py-2.5 font-semibold">Type</th>
                          <th className="px-4 py-2.5 font-semibold">Title</th>
                          <th className="px-4 py-2.5 font-semibold">Status</th>
                          <th className="px-4 py-2.5 font-semibold">Your decision</th>
                          <th className="px-4 py-2.5 font-semibold">Requested by</th>
                          <th className="px-4 py-2.5 font-semibold">Decided</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredHistory.map(h => (
                          <tr key={h.approval_id} className="hover:bg-slate-50">
                            <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">{h.target_type_label}</td>
                            <td className="px-4 py-2.5">
                              <Link href={targetHref(h.target_type, h.target_id)} className="font-medium text-slate-900 hover:text-emerald-700">
                                {h.target_title}
                              </Link>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize', STATUS_BADGE[h.status] ?? 'bg-slate-100 text-slate-600')}>
                                {h.status}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize',
                                h.my_decision === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700')}>
                                {h.my_decision}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{h.requested_by_name ?? '—'}</td>
                            <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">{new Date(h.my_decision_at).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      )}

      {open && (
        <DecisionModal
          approvalId={open.approval_id}
          stepId={open.step_id}
          title={open.target_title}
          onClose={(decided) => { setOpen(null); if (decided) refresh() }}
        />
      )}
    </div>
  )
}
