'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Archive } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

/**
 * Archives an approval chain (soft delete — sets is_active=false).
 *
 * We never hard-delete a chain because approvals.chain_id is a FK with
 * historical references; dropping the row would orphan the audit trail.
 * To restore a chain after archiving, edit it and tick "Active".
 */
export function ArchiveChainButton({ chainId, isActive }: { chainId: string; isActive: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  if (!isActive) return null     // nothing to archive; restore is via the Active checkbox in the editor

  async function archive() {
    if (!confirm('Archive this chain? It will stop being picked for new submissions. In-flight approvals already using it keep running. You can restore it later from the editor.')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/approval-chains/${chainId}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Could not archive')
        return
      }
      toast.success('Chain archived')
      router.push('/admin/approvals')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button variant="outline" onClick={archive} loading={busy}>
      <Archive className="h-4 w-4" /> Archive
    </Button>
  )
}
