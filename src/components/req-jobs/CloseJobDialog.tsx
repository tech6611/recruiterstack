'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { JOB_CLOSE_REASONS, type JobCloseReason } from '@/lib/openings/seat-math'

const NOTE_MAX = 2000

interface Props {
  jobId:          string
  /** Linked seats that could still be closed alongside the job (0 hides the checkbox). */
  seatTotal:      number
  /** Reason to pre-select (e.g. 'filled' when every seat is already taken). */
  initialReason?: JobCloseReason
  /** `closed` is true when the server accepted the close. */
  onClose:        (closed: boolean) => void
}

/**
 * "Close job" — the normal end-of-life for a job (as opposed to Withdraw, which
 * is the abandon-it kill switch). Postings come down and the public link stops
 * working; candidates stay in the pipeline.
 */
export function CloseJobDialog({ jobId, seatTotal, initialReason = 'filled', onClose }: Props) {
  const [reason, setReason]         = useState<JobCloseReason>(initialReason)
  const [note, setNote]             = useState('')
  const [closeSeats, setCloseSeats] = useState(true)
  const [saving, setSaving]         = useState(false)

  async function submit() {
    setSaving(true)
    try {
      const res = await fetch(`/api/req-jobs/${jobId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason,
          note: note.trim() || undefined,
          close_open_seats: seatTotal > 0 ? closeSeats : false,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(body.error ?? 'Could not close the job'); return }
      toast.success('Job closed')
      onClose(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => onClose(false)}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Close job</h3>
          <button type="button" onClick={() => onClose(false)} aria-label="Close">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="close-job-reason">Reason</Label>
            <Select id="close-job-reason" value={reason} onChange={e => setReason(e.target.value as JobCloseReason)} disabled={saving}>
              {JOB_CLOSE_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="close-job-note">Note <span className="font-normal text-slate-400">(optional)</span></Label>
            <Textarea
              id="close-job-note"
              rows={3}
              className="min-h-[72px]"
              value={note}
              maxLength={NOTE_MAX}
              disabled={saving}
              onChange={e => setNote(e.target.value.slice(0, NOTE_MAX))}
              placeholder="Anything worth remembering about why this job ended."
            />
          </div>

          {seatTotal > 0 && (
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={closeSeats}
                disabled={saving}
                onChange={e => setCloseSeats(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600"
              />
              <span className="text-sm text-slate-700">
                Also close this job&apos;s open seats
                <span className="block text-xs text-slate-400">
                  Seats already filled by a hire stay filled. Untick to keep the remaining seats available for another job.
                </span>
              </span>
            </label>
          )}

          <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Postings come down and the public application link stops working. Candidates stay in the
            pipeline; you can archive them from the pipeline view.
          </p>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onClose(false)} disabled={saving}>Cancel</Button>
          <Button size="sm" loading={saving} onClick={submit}>Close job</Button>
        </div>
      </div>
    </div>
  )
}
