'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, AlertTriangle, Pencil, ChevronDown, ChevronRight, Network, FileText, Briefcase, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { StatCards } from '@/components/ui/stat-cards'
import { ChainRowActions } from '@/components/approvals/ChainRowActions'
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
  opening: 'Requisition',
  job:     'Pipeline',
  offer:   'Offer',
}

// Plural section headings + the fixed display order the admin asked for:
// Requisitions first, then Pipelines (jobs), then Offers.
const TARGET_ORDER: TargetType[] = ['opening', 'job', 'offer']
const SECTION_LABEL: Record<TargetType, string> = {
  opening: 'Requisitions',
  job:     'Pipelines',
  offer:   'Offers',
}

// Header-row tint per section, using the brand palette (emerald = pine,
// gold = amber accent). Each entry colours only the top "first line" of the
// pane: background fill, hover, chevron/title/count-badge text.
const HEADER_TONE: Record<TargetType, {
  bar: string; hover: string; chevron: string; title: string; badge: string
}> = {
  // Theme 1 "Signal" — each section a distinct hue: Requisitions green,
  // Pipelines amber, Offers blue. Intensity: +1 notch (deeper than the base 50s).
  opening: {
    bar:     'bg-[#d6f5e5]',
    hover:   'hover:bg-[#c6efd9]',
    chevron: 'text-[#059669]',
    title:   'text-[#065f46]',
    badge:   'text-[#047857] bg-[#bff0d8]',
  },
  job: {
    bar:     'bg-[#fde8c8]',
    hover:   'hover:bg-[#fbdfb0]',
    chevron: 'text-[#c26f04]',
    title:   'text-[#854d0e]',
    badge:   'text-[#a16207] bg-[#fbdfa6]',
  },
  offer: {
    bar:     'bg-[#dde9fe]',
    hover:   'hover:bg-[#cbdcfd]',
    chevron: 'text-[#2f6fe0]',
    title:   'text-[#1e3a8a]',
    badge:   'text-[#1d4ed8] bg-[#c9defb]',
  },
}

export default function ApprovalChainsListPage() {
  const router = useRouter()
  const [items, setItems]     = useState<Chain[]>([])
  const [loaded, setLoaded]   = useState(false)
  const [creating, setCreating] = useState<TargetType | null>(null)
  // Which sections are folded shut. All open by default.
  const [collapsed, setCollapsed] = useState<Record<TargetType, boolean>>({
    opening: false, job: false, offer: false,
  })
  const toggleSection = (t: TargetType) =>
    setCollapsed(prev => ({ ...prev, [t]: !prev[t] }))

  // Bucket the flat list into the three target types so each gets its own
  // foldable card, rendered in the fixed reqs < jobs < offers order.
  const grouped = useMemo<Record<TargetType, Chain[]>>(() => {
    const g: Record<TargetType, Chain[]> = { opening: [], job: [], offer: [] }
    for (const c of items) g[c.target_type]?.push(c)
    return g
  }, [items])

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
    <div className="p-6">
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
      ) : (
        <div className="space-y-4">
          {/* Summary stat cards — same at-a-glance strip as the other list pages. */}
          <StatCards
            cards={[
              { key: 'total',    label: 'Total chains', value: items.length,           tone: 'slate', icon: <Network className="h-4 w-4" /> },
              { key: 'opening',  label: 'Requisitions', value: grouped.opening.length, tone: 'pine',  icon: <FileText className="h-4 w-4" /> },
              { key: 'job',      label: 'Pipelines',    value: grouped.job.length,     tone: 'amber', icon: <Briefcase className="h-4 w-4" /> },
              { key: 'offer',    label: 'Offers',       value: grouped.offer.length,   tone: 'gold',  icon: <Wallet className="h-4 w-4" /> },
            ]}
          />

          {TARGET_ORDER.map(t => {
            const chains   = grouped[t]
            const isOpen   = !collapsed[t]
            const Chevron  = isOpen ? ChevronDown : ChevronRight
            const tone     = HEADER_TONE[t]
            return (
              <Card key={t} className="overflow-hidden">
                {/* Foldable section header — click anywhere to collapse/expand.
                    The first line is tinted per-section with the brand palette. */}
                <button
                  type="button"
                  onClick={() => toggleSection(t)}
                  className={cn(
                    'flex w-full items-center gap-2 px-4 py-3 text-left transition-colors',
                    tone.bar, tone.hover,
                  )}
                >
                  <Chevron className={cn('h-4 w-4 shrink-0', tone.chevron)} />
                  <span className={cn('text-sm font-semibold', tone.title)}>{SECTION_LABEL[t]}</span>
                  <span className={cn('text-[11px] font-semibold rounded-full px-2 py-0.5', tone.badge)}>
                    {chains.length}
                  </span>
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100 p-2 space-y-2">
                    {chains.length === 0 ? (
                      <p className="py-6 text-center text-sm text-slate-400">
                        No {SECTION_LABEL[t].toLowerCase()} chains yet.
                      </p>
                    ) : (
                      chains.map(c => (
                        <Link key={c.id} href={`/admin/approvals/${c.id}`}>
                          <Card className={cn('hover:shadow-md transition-shadow', !c.is_active && 'opacity-60')}>
                            <CardContent>
                              <div className="flex items-center justify-between gap-3 py-2">
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                                    {c.name}
                                    {c.scope_conditions == null && (
                                      <span className="text-[10px] uppercase font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                                        Catch-all
                                      </span>
                                    )}
                                    {!c.is_active && (
                                      <span className="text-[10px] uppercase font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">
                                        Archived
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-slate-500 mt-0.5">{TARGET_LABEL[c.target_type]} · {c.description ?? 'No description'}</div>
                                </div>
                                <span className="text-[10px] uppercase font-semibold text-slate-400 hidden sm:inline">
                                  Updated {new Date(c.updated_at).toLocaleDateString()}
                                </span>
                                {/* Explicit Edit affordance. The whole card is already a link
                                    to the editor; this button just makes that discoverable.
                                    It intentionally does NOT stop propagation, so the click
                                    bubbles up to the row's <Link> and opens the editor. */}
                                <Button variant="outline" size="sm">
                                  <Pencil className="h-3.5 w-3.5" /> Edit
                                </Button>
                                <ChainRowActions
                                  chainId={c.id}
                                  chainName={c.name}
                                  isActive={c.is_active}
                                  onChanged={refresh}
                                />
                              </div>
                            </CardContent>
                          </Card>
                        </Link>
                      ))
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
