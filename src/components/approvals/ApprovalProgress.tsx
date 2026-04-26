'use client'

import { useEffect, useState } from 'react'
import { Check, X, Clock, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ApprovalRow {
  id:                 string
  status:             'pending' | 'approved' | 'rejected' | 'cancelled'
  current_step_index: number
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

export function ApprovalProgress({ approvalId }: { approvalId: string }) {
  const [data, setData] = useState<{
    approval: ApprovalRow
    steps:    StepRow[]
    chain_steps: ChainStepMeta[]
    approvers:   ApproverMeta[]
  } | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch(`/api/approvals/${approvalId}`)
      .then(r => r.json())
      .then(({ data }) => { setData(data ?? null); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [approvalId])

  if (!loaded) return <p className="text-xs text-slate-400">Loading approval…</p>
  if (!data)   return <p className="text-xs text-slate-400">No approval data.</p>

  const { steps, chain_steps, approvers } = data
  const stepName = (id: string) => chain_steps.find(c => c.id === id)?.name ?? `Step`
  const approverName = (id: string) => {
    const u = approvers.find(a => a.id === id)
    return u?.full_name ?? u?.email ?? id.slice(0, 6)
  }

  return (
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
  )
}
