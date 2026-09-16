'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, Clock, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { DecisionModal } from '@/components/approvals/DecisionModal'

interface ApprovalRow {
  id:                 string
  status:             'pending' | 'approved' | 'rejected' | 'cancelled'
  current_step_index: number
}

// One pending decision in the current user's inbox (subset of the inbox API).
interface MyPendingStep {
  approval_id:  string
  step_id:      string
  target_title: string
}

interface StepRow {
  id:           string
  step_index:   number
  status:       'pending' | 'approved' | 'rejected' | 'skipped' | 'not_applicable'
  approvers:    Array<{ user_id: string }>
  decisions:    Array<{ user_id: string; decision: 'approved' | 'rejected'; comment: string | null; at: string }>
  activated_at: string | null
  due_at:       string | null
  chain_step_id: string
}

interface ChainStepMeta { id: string; name: string }
interface ApproverMeta  { id: string; full_name: string | null; email: string }

// Present only when the approval is for a gated requisition edit
// (target_type 'opening_change'): the before/after the approvers decide on.
interface ChangeMeta {
  change_request_id: string
  status:            string
  note:              string | null
  opening_id:        string
  opening_title:     string | null
  diff:              Array<{ field: string; label: string; before: unknown; after: unknown }>
}

/** Render a diff value: nulls as a dash, numbers with separators, everything else as-is. */
function formatDiffValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'number') return v.toLocaleString()
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (Array.isArray(v)) return v.map(x => String(x)).join(', ') || '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export function ApprovalProgress({ approvalId, onDecided }: { approvalId: string; onDecided?: () => void }) {
  const router = useRouter()
  const [data, setData] = useState<{
    approval: ApprovalRow
    steps:    StepRow[]
    chain_steps: ChainStepMeta[]
    approvers:   ApproverMeta[]
    change?:     ChangeMeta | null
  } | null>(null)
  const [loaded, setLoaded] = useState(false)
  // If the current user has a pending decision on THIS approval, the inbox
  // returns it — we surface an Approve/Reject button right here so they can
  // decide from the detail page instead of hunting in the Approvals inbox.
  const [myStep, setMyStep] = useState<MyPendingStep | null>(null)
  const [deciding, setDeciding] = useState(false)

  const load = useCallback(() => {
    Promise.all([
      fetch(`/api/approvals/${approvalId}`).then(r => r.json()).catch(() => ({ data: null })),
      fetch('/api/approvals/inbox').then(r => r.json()).catch(() => ({ data: [] })),
    ]).then(([approvalRes, inboxRes]) => {
      setData(approvalRes.data ?? null)
      const mine = (inboxRes.data ?? []).find((i: MyPendingStep) => i.approval_id === approvalId) ?? null
      setMyStep(mine)
      setLoaded(true)
    })
  }, [approvalId])

  useEffect(() => { load() }, [load])

  if (!loaded) return <p className="text-xs text-slate-400">Loading approval…</p>
  if (!data)   return <p className="text-xs text-slate-400">No approval data.</p>

  const { steps, chain_steps, approvers } = data
  const change = data.change ?? null
  const stepName = (id: string) => chain_steps.find(c => c.id === id)?.name ?? `Step`
  const approverName = (id: string) => {
    const u = approvers.find(a => a.id === id)
    return u?.full_name ?? u?.email ?? id.slice(0, 6)
  }
  const changeTitle = change ? `Change to ${change.opening_title ?? 'requisition'}` : null

  return (
    <>
    {/* Gated requisition edit → show approvers exactly what would change. */}
    {change && (
      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
        <p className="text-xs font-semibold text-amber-900 mb-2">
          Proposed change to {change.opening_title ?? 'this requisition'}
        </p>
        {change.diff.length === 0 ? (
          <p className="text-xs text-slate-500">No field differences recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                  <th className="text-left font-semibold pb-1 pr-2">Field</th>
                  <th className="text-left font-semibold pb-1 pr-2">Before</th>
                  <th className="text-left font-semibold pb-1">After</th>
                </tr>
              </thead>
              <tbody>
                {change.diff.map(d => (
                  <tr key={d.field} className="border-t border-amber-100 align-top">
                    <td className="py-1 pr-2 font-medium text-slate-700">{d.label}</td>
                    <td className="py-1 pr-2 text-slate-500 line-through decoration-slate-300 break-words">{formatDiffValue(d.before)}</td>
                    <td className="py-1 text-slate-900 font-medium break-words">{formatDiffValue(d.after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {change.note && <p className="mt-2 text-xs text-slate-600 italic">“{change.note}”</p>}
      </div>
    )}

    <ol className="space-y-3">
      {steps.map(s => {
        const isCurrent  = data.approval.status === 'pending' && s.status === 'pending' && s.activated_at != null
        const isUpcoming = data.approval.status === 'pending' && s.status === 'pending' && s.activated_at == null
        return (
          <li key={s.id} className="flex gap-3">
            <div className={cn(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
              s.status === 'approved'        && 'bg-emerald-500 text-white',
              s.status === 'rejected'        && 'bg-red-500 text-white',
              s.status === 'not_applicable'  && 'bg-slate-200 text-slate-400',
              s.status === 'skipped'         && 'bg-slate-200 text-slate-400',
              isCurrent  && 'bg-amber-500 text-white ring-4 ring-amber-100',
              isUpcoming && 'bg-slate-100 text-slate-400 border border-slate-200',
            )}>
              {s.status === 'approved' && <Check className="h-3.5 w-3.5" />}
              {s.status === 'rejected' && <X className="h-3.5 w-3.5" />}
              {(s.status === 'not_applicable' || s.status === 'skipped') && <Minus className="h-3.5 w-3.5" />}
              {isCurrent  && <Clock className="h-3.5 w-3.5" />}
              {isUpcoming && <span className="text-[10px] font-bold">{s.step_index + 1}</span>}
            </div>
            <div className="flex-1 min-w-0 -mt-0.5">
              <div className="text-sm font-medium text-slate-800">
                {stepName(s.chain_step_id)}
                {s.status === 'not_applicable' && <span className="ml-2 text-[10px] uppercase font-semibold text-slate-400">skipped</span>}
              </div>
              {s.approvers.length > 0 && (
                <div className="text-xs text-slate-500 mt-0.5">
                  {s.approvers.map(a => approverName(a.user_id)).join(', ')}
                </div>
              )}
              {s.decisions.length > 0 && (
                <div className="mt-1 text-xs text-slate-600 space-y-0.5">
                  {s.decisions.map((d, i) => (
                    <div key={i}>
                      <span className={cn('font-medium', d.decision === 'approved' ? 'text-emerald-700' : 'text-red-700')}>
                        {d.decision === 'approved' ? '✓' : '✗'} {approverName(d.user_id)}
                      </span>
                      {d.comment && <span className="text-slate-500"> — {d.comment}</span>}
                    </div>
                  ))}
                </div>
              )}
              {isCurrent && s.due_at && (
                <p className="text-[11px] text-amber-700 mt-1">Due {new Date(s.due_at).toLocaleString()}</p>
              )}
            </div>
          </li>
        )
      })}
    </ol>

    {/* This user can decide the active step → let them do it right here. */}
    {myStep && (
      <div className="mt-4 border-t border-slate-100 pt-3">
        <p className="text-xs text-slate-500 mb-2">This approval is waiting on your decision.</p>
        <Button size="sm" className="w-full" onClick={() => setDeciding(true)}>
          Approve / Reject
        </Button>
      </div>
    )}

    {deciding && myStep && (
      <DecisionModal
        approvalId={myStep.approval_id}
        stepId={myStep.step_id}
        title={changeTitle ?? myStep.target_title}
        onClose={(decided) => {
          setDeciding(false)
          // load() refreshes this approval card; onDecided() re-reads the parent job so
          // the title status badge + action buttons update live; router.refresh() syncs
          // the rest of the server-rendered page (audit log, openings).
          if (decided) { load(); onDecided?.(); router.refresh() }
        }}
      />
    )}
    </>
  )
}
