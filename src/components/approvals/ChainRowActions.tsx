'use client'

import { useState } from 'react'
import { Archive, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

/**
 * Per-row archive/restore action for the chains list.
 *
 * Archive sends DELETE (soft-deactivates) — never a hard delete because
 * approvals.chain_id is FK-referenced from history; dropping the row would
 * orphan the audit trail.
 *
 * Restore sends PATCH { is_active: true } — the same endpoint used by the
 * editor's Active checkbox.
 *
 * The button uses preventDefault + stopPropagation in onClick so it doesn't
 * navigate when nested inside the row's <Link>.
 */
export function ChainRowActions({
  chainId,
  chainName,
  isActive,
  onChanged,
}: {
  chainId:    string
  chainName:  string
  isActive:   boolean
  /** Called after a successful change so the parent can refresh its list. */
  onChanged:  () => void
}) {
  const [busy, setBusy] = useState(false)

  async function archive(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm(
      `Archive “${chainName}”?\n\nIt will stop being picked for new submissions. ` +
      `In-flight approvals already using it keep running. ` +
      `You can restore it from this list anytime.`
    )) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/approval-chains/${chainId}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Could not archive')
        return
      }
      toast.success('Chain archived')
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  async function restore(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/approval-chains/${chainId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: true }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Could not restore')
        return
      }
      toast.success('Chain restored')
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  return isActive ? (
    <Button variant="outline" size="sm" onClick={archive} loading={busy}>
      <Archive className="h-3.5 w-3.5" /> Archive
    </Button>
  ) : (
    <Button variant="outline" size="sm" onClick={restore} loading={busy}>
      <RotateCcw className="h-3.5 w-3.5" /> Restore
    </Button>
  )
}
