'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type TargetType = 'opening' | 'job' | 'offer'

interface Chain {
  id:               string
  name:             string
  description:      string | null
  target_type:      TargetType
  is_active:        boolean
  updated_at:       string
  // null means "no scope conditions" → catch-all for that target_type.
  // The API already returns this; we read it to detect the fallback gap.
  scope_conditions: unknown | null
}

const TARGET_LABEL: Record<TargetType, string> = {
  opening: 'Opening',
  job:     'Pipeline',
  offer:   'Offer',
}

export default function ApprovalChainsListPage() {
  const router = useRouter()
  const [items, setItems]     = useState<Chain[]>([])
  const [loaded, setLoaded]   = useState(false)
  const [creating, setCreating] = useState<TargetType | null>(null)

  async function refresh() {
    const r = await fetch('/api/admin/approval-chains').then(x => x.json()).catch(() => ({ data: [] }))
    setItems(r.data ?? [])
    setLoaded(true)
  }

  useEffect(() => { refresh() }, [])

  // A target_type is "at risk" iff it has ≥1 active scoped chain but no active
  // chain with null scope_conditions to act as the catch-all. Submissions for
  // any target that doesn't match the scoped chains will hit
  // ApprovalError("No approval chain matches this target") and get refused.
  const missingFallback = useMemo<TargetType[]>(() => {
    const types: TargetType[] = ['opening', 'job', 'offer']
    return types.filter(t => {
      const forType = items.filter(c => c.target_type === t && c.is_active)
      if (forType.length === 0) return false                                  // no chains at all → not the gap we're flagging
      return !forType.some(c => c.scope_conditions == null)                   // has chains but none unscoped → gap
    })
  }, [items])

  async function createDefaultChain(targetType: TargetType) {
    setCreating(targetType)
    try {
      const res = await fetch('/api/admin/approval-chains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Default ${TARGET_LABEL[targetType].toLowerCase()} approval`,
          description: `Catch-all chain used when no scoped chain matches a submitted ${TARGET_LABEL[targetType].toLowerCase()}. Edit me to change the approvers.`,
          target_type: targetType,
          scope_conditions: null,
          is_active: true,
          steps: [
            {
              step_index: 0,
              name: 'Hiring Manager',
              step_type: 'sequential',
              approver_type: 'hiring_team_member',
              approver_value: { role: 'hiring_manager' },
              min_approvals: 1,
            },
          ],
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Could not create default chain')
        return
      }
      const { data } = await res.json()
      toast.success('Default chain created — open it to customize the approvers.')
      // Jump straight into the editor so the admin can tweak before it's used.
      if (data?.id) router.push(`/admin/approvals/${data.id}`)
      else await refresh()
    } finally {
      setCreating(null)
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Approval chains</h1>
          <p className="text-sm text-slate-500 mt-1">Templates picked when a target is submitted for approval.</p>
        </div>
        <Link href="/admin/approvals/new">
          <Button><Plus className="h-4 w-4" /> New chain</Button>
        </Link>
      </div>

      {/* Fallback-gap banners — one per target_type with scoped chains but no catch-all. */}
      {loaded && missingFallback.length > 0 && (
        <div className="mb-4 space-y-2">
          {missingFallback.map(t => (
            <div
              key={t}
              className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="flex-1">
                <div className="font-semibold text-amber-900">
                  No fallback chain for {TARGET_LABEL[t]} submissions
                </div>
                <div className="text-xs text-amber-800 mt-0.5">
                  Every active {TARGET_LABEL[t].toLowerCase()} chain has scope conditions, so a {TARGET_LABEL[t].toLowerCase()} that
                  doesn&rsquo;t match any of them will fail to submit with &ldquo;No approval chain matches this target.&rdquo;
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => createDefaultChain(t)}
                loading={creating === t}
              >
                Create default chain
              </Button>
            </div>
          ))}
        </div>
      )}

      {!loaded ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : items.length === 0 ? (
        <Card><CardContent><p className="py-8 text-center text-sm text-slate-500">No chains yet.</p></CardContent></Card>
      ) : (
        <div className="space-y-2">
          {items.map(c => (
            <Link key={c.id} href={`/admin/approvals/${c.id}`}>
              <Card className={cn('hover:shadow-md transition-shadow', !c.is_active && 'opacity-50')}>
                <CardContent>
                  <div className="flex items-center justify-between py-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                        {c.name}
                        {c.scope_conditions == null && (
                          <span className="text-[10px] uppercase font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                            Catch-all
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 capitalize">{c.target_type} · {c.description ?? 'no description'}</div>
                    </div>
                    <span className="text-[10px] uppercase font-semibold text-slate-400">
                      {c.is_active ? `Updated ${new Date(c.updated_at).toLocaleDateString()}` : 'Archived'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
