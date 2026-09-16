'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { OPENING_CLOSE_REASONS, type OpeningCloseReason } from '@/lib/openings/seat-math'

const NOTE_MAX = 2000

interface Props {
  openingId: string
  /** `closed` is true when the server accepted the close. */
  onClose:   (closed: boolean) => void
}

/**
 * "Close requisition" — retires a headcount seat that won't be filled through
 * this requisition (cancelled, filled another way, budget pulled…). A seat
 * filled by a hire is set to `filled` by the hire flow, not here.
 */
export function CloseOpeningDialog({ openingId, onClose }: Props) {
  const [reason, setReason] = useState<OpeningCloseReason>('cancelled')
  const [note, setNote]     = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    setSaving(true)
    try {
      const res = await fetch(`/api/openings/${openingId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, note: note.trim() || undefined }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(body.error ?? 'Could not close the requisition'); return }
      toast.success('Requisition closed')
      onClose(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => onClose(false)}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Close requisition</h3>
          <button type="button" onClick={() => onClose(false)} aria-label="Close">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="close-opening-reason">Reason</Label>
            <Select id="close-opening-reason" value={reason} onChange={e => setReason(e.target.value as OpeningCloseReason)} disabled={saving}>
              {OPENING_CLOSE_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="close-opening-note">Note <span className="font-normal text-slate-400">(optional)</span></Label>
            <Textarea
              id="close-opening-note"
              rows={3}
              className="min-h-[72px]"
              value={note}
              maxLength={NOTE_MAX}
              disabled={saving}
              onChange={e => setNote(e.target.value.slice(0, NOTE_MAX))}
              placeholder="Why this seat is being retired."
            />
          </div>
          <p className="text-xs text-slate-500">
            A closed requisition no longer counts as a seat on any linked job.
          </p>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onClose(false)} disabled={saving}>Cancel</Button>
          <Button size="sm" loading={saving} onClick={submit}>Close requisition</Button>
        </div>
      </div>
    </div>
  )
}
