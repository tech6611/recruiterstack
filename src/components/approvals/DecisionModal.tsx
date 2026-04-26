'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface Props {
  approvalId: string
  stepId:     string
  title:      string             // human-readable target title for context
  onClose:    (decided: boolean) => void
}

export function DecisionModal({ approvalId, stepId, title, onClose }: Props) {
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState<'approved' | 'rejected' | null>(null)

  async function decide(decision: 'approved' | 'rejected') {
    if (decision === 'rejected' && comment.trim().length < 20) {
      toast.error('Reject comment must be at least 20 characters.')
      return
    }
    setSubmitting(decision)
    const res = await fetch(`/api/approvals/${approvalId}/steps/${stepId}/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, comment: comment.trim() || null }),
    })
    setSubmitting(null)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(body.error ?? 'Failed to record decision')
      return
    }
    toast.success(decision === 'approved' ? 'Approved' : 'Rejected')
    onClose(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => onClose(false)}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-900">Decide on approval</h3>
          <button type="button" onClick={() => onClose(false)} aria-label="Close"><X className="h-4 w-4 text-slate-500" /></button>
        </div>
        <p className="text-sm text-slate-700 mb-3">{title}</p>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-600">Comment</label>
          <Textarea value={comment} onChange={e => setComment(e.target.value)} className="min-h-[80px]" placeholder="Optional for approve. Required (≥ 20 chars) for reject." />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => decide('rejected')} loading={submitting === 'rejected'}>
            Reject
          </Button>
          <Button onClick={() => decide('approved')} loading={submitting === 'approved'}>
            Approve
          </Button>
        </div>
      </div>
    </div>
  )
}
