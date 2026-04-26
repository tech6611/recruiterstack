'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckSquare } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { DecisionModal } from '@/components/approvals/DecisionModal'

interface InboxItem {
  approval_id:  string
  step_id:      string
  step_index:   number
  target_type:  string
  target_id:    string
  target_title: string
  activated_at: string
  due_at:       string | null
}

export default function ApprovalInboxPage() {
  const [items, setItems]   = useState<InboxItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [open,  setOpen]    = useState<InboxItem | null>(null)

  async function refresh() {
    const res = await fetch('/api/approvals/inbox')
    const body = await res.json()
    setItems(body.data ?? [])
    setLoaded(true)
  }

  useEffect(() => { refresh() }, [])

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <CheckSquare className="h-6 w-6 text-emerald-600" />
        <h1 className="text-2xl font-semibold text-slate-900">Approvals inbox</h1>
      </div>

      {!loaded ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : items.length === 0 ? (
        <Card>
          <CardContent>
            <p className="py-8 text-center text-sm text-slate-500">No pending decisions.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map(item => {
            const isOverdue = item.due_at != null && new Date(item.due_at).getTime() < Date.now()
            return (
              <Card key={item.step_id}>
                <CardContent>
                  <div className="flex items-center justify-between gap-4 py-1">
                    <div className="min-w-0 flex-1">
                      <Link href={`/openings/${item.target_id}`} className="text-sm font-semibold text-slate-900 hover:text-emerald-700">
                        {item.target_title}
                      </Link>
                      <div className="text-xs text-slate-500 mt-0.5">
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
