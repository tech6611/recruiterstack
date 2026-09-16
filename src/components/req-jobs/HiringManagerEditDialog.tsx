'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { teamMemberName, type TeamMember } from '@/lib/team-members'

/** How the hiring manager is changed from the Team card (see GET /api/jobs/:id/team). */
export type HmEditMode = 'opening' | 'job'

interface Props {
  jobId:         string
  mode:          HmEditMode
  /** Linked requisition the change goes through when mode is 'opening'. */
  openingId:     string | null
  /** Currently assigned hiring manager (org user id), if known. */
  currentUserId: string | null
  team:          TeamMember[]
  /** `changed` is true when the server accepted the change (applied or pending). */
  onClose:       (changed: boolean) => void
}

const NONE = ''

/**
 * "Change hiring manager" — the requisition is the source of truth. With a
 * linked requisition we PATCH it and the job follows (possibly after approval
 * when the org gates that field); without one we update the job directly.
 */
export function HiringManagerEditDialog({ jobId, mode, openingId, currentUserId, team, onClose }: Props) {
  const [value, setValue]   = useState<string>(currentUserId ?? NONE)
  const [saving, setSaving] = useState(false)

  const members = team.filter(m => m.is_active !== false)
  const userId  = value === NONE ? null : value

  async function save() {
    setSaving(true)
    try {
      if (mode === 'opening') {
        if (!openingId) { toast.error('No linked requisition to update'); return }
        const res  = await fetch(`/api/openings/${openingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hiring_manager_id: userId }),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) { toast.error(body.error ?? 'Could not update the hiring manager'); return }
        if (body.pending_change) toast.success('Change submitted for approval')
        else toast.success('Hiring manager updated')
      } else {
        const res  = await fetch(`/api/jobs/${jobId}/hiring-manager`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId }),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) { toast.error(body.error ?? 'Could not update the hiring manager'); return }
        toast.success('Hiring manager updated')
      }
      onClose(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => onClose(false)}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Change hiring manager</h3>
          <button type="button" onClick={() => onClose(false)} aria-label="Close">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="hm-edit-select">Hiring manager</label>
        <Select id="hm-edit-select" value={value} onChange={e => setValue(e.target.value)} disabled={saving}>
          <option value={NONE}>— none —</option>
          {members.map(m => (
            <option key={m.user_id} value={m.user_id}>{teamMemberName(m)}</option>
          ))}
        </Select>

        <p className="mt-3 text-xs text-slate-500">
          {mode === 'opening'
            ? 'This updates the linked requisition. The job follows it.'
            : 'This job has no requisition, so the change applies to the job directly.'}
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onClose(false)} disabled={saving}>Cancel</Button>
          <Button size="sm" loading={saving} onClick={save} disabled={userId === (currentUserId ?? null)}>Save</Button>
        </div>
      </div>
    </div>
  )
}
