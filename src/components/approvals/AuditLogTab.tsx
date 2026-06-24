'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'

interface Entry {
  id:           string
  action:       string
  from_state:   string | null
  to_state:     string | null
  metadata:     Record<string, unknown>
  actor_user_id: string | null
  created_at:   string
  users:        { full_name: string | null; email: string } | null
  entity?:      string   // 'opening' | 'job' | 'offer' — which entity this row belongs to
  entity_label?: string  // 'Requisition' | 'Job' | 'Offer'
}

interface Props {
  targetType: 'opening' | 'job' | 'offer'
  targetId:   string
}

const ACTION_LABEL: Record<string, string> = {
  created:          'Created',
  submitted:        'Submitted for approval',
  approved:         'Fully approved',
  rejected:         'Rejected',
  cancelled:        'Cancelled',
  step_activated:   'Step activated',
  step_decided:     'Step decided',
  step_skipped:     'Step skipped',
  edit_cancelled:   'Cancelled by edit',
  sla_breach:       'SLA breached',
  auto_approved:    'Auto-approved',
}

// Per-entity badge colours so a job's timeline visibly separates its
// requisition phase from its job phase.
const ENTITY_BADGE: Record<string, string> = {
  Requisition: 'bg-violet-100 text-violet-700',
  Job:         'bg-emerald-100 text-emerald-700',
  Offer:       'bg-amber-100 text-amber-700',
}

export function AuditLogTab({ targetType, targetId }: Props) {
  const [items, setItems]   = useState<Entry[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch(`/api/audit-log?target_type=${targetType}&target_id=${targetId}`)
      .then(r => r.json())
      .then(({ data }) => { setItems((data ?? []) as Entry[]); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [targetType, targetId])

  // Tag rows with their entity only when the timeline spans more than one
  // (a job page that folds in its requisition's history).
  const showEntity = new Set(items.map(i => i.entity)).size > 1

  return (
    <Card>
      <CardContent>
        {!loaded ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">No audit history yet.</p>
        ) : (
          <ol className="space-y-4 py-2">
            {items.map(e => {
              const who = e.users?.full_name ?? e.users?.email ?? (e.actor_user_id ? 'Someone' : 'System')
              const actionLabel = ACTION_LABEL[e.action] ?? e.action
              const meta = formatMeta(e.metadata)
              // Show the entity tag only when the timeline mixes entities
              // (e.g. a job page that also carries its requisition's history).
              const badge = showEntity && e.entity_label
                ? (ENTITY_BADGE[e.entity_label] ?? 'bg-slate-100 text-slate-600')
                : null
              return (
                <li key={e.id} className="flex gap-3 text-sm">
                  <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${e.entity === 'opening' ? 'bg-violet-500' : 'bg-emerald-500'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-slate-900">
                      {badge && (
                        <span className={`mr-1.5 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${badge}`}>
                          {e.entity_label}
                        </span>
                      )}
                      <span className="font-medium">{who}</span> — {actionLabel}
                      {e.from_state && e.to_state && (
                        <span className="text-slate-500"> ({e.from_state} → {e.to_state})</span>
                      )}
                    </div>
                    {meta && <div className="text-xs text-slate-500 mt-0.5">{meta}</div>}
                    <div className="text-[11px] text-slate-400 mt-0.5">{new Date(e.created_at).toLocaleString()}</div>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}

function formatMeta(m: Record<string, unknown>): string | null {
  if (!m || typeof m !== 'object') return null
  const parts: string[] = []
  if ('name'       in m) parts.push(`Step: ${String(m.name)}`)
  if ('step_index' in m && m.step_index !== undefined) parts.push(`#${Number(m.step_index) + 1}`)
  if ('decision'   in m && typeof m.decision === 'string') parts.push(`Decision: ${m.decision}`)
  if ('comment'    in m && typeof m.comment === 'string' && m.comment) parts.push(`“${m.comment}”`)
  if ('reason'     in m && typeof m.reason === 'string') parts.push(`Reason: ${m.reason}`)
  return parts.length > 0 ? parts.join(' · ') : null
}
