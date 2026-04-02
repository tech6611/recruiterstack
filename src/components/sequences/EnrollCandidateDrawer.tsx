'use client'

import { useState, useEffect } from 'react'
import { X, Loader2, UserPlus, AlertTriangle, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { Sequence } from '@/lib/types/database'

interface Props {
  candidateIds: string[]        // one or more candidate IDs
  candidateNames?: string[]     // display names (parallel array)
  applicationId?: string        // optional: tie to a specific job
  onClose: () => void
  onEnrolled: () => void
}

export default function EnrollCandidateDrawer({
  candidateIds, candidateNames, applicationId, onClose, onEnrolled,
}: Props) {
  const router = useRouter()
  const [sequences, setSequences]     = useState<Sequence[]>([])
  const [selectedId, setSelectedId]   = useState('')
  const [loading, setLoading]         = useState(true)
  const [enrolling, setEnrolling]     = useState(false)
  const [creating, setCreating]       = useState(false)
  const [error, setError]             = useState('')
  const [result, setResult]           = useState<{ enrolled_count: number; skipped_count: number } | null>(null)

  const loadSequences = () => {
    setLoading(true)
    fetch('/api/sequences')
      .then(r => r.json())
      .then(json => {
        const active = (json.data ?? []).filter((s: Sequence) => s.status === 'active')
        setSequences(active)
        if (active.length > 0 && !selectedId) setSelectedId(active[0].id)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadSequences() }, [])

  const handleEnroll = async () => {
    if (!selectedId) { setError('Select a sequence'); return }
    setEnrolling(true)
    setError('')

    const res = await fetch(`/api/sequences/${selectedId}/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candidate_ids: candidateIds,
        ...(applicationId ? { application_id: applicationId } : {}),
      }),
    })

    const json = await res.json()
    setEnrolling(false)

    if (!res.ok) { setError(json.error ?? 'Enrollment failed'); return }

    setResult(json.data)
    onEnrolled()
  }

  const handleCreateSequence = async () => {
    setCreating(true)
    setError('')

    const res = await fetch('/api/sequences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Untitled Sequence',
        stages: [
          { order_index: 1, delay_days: 0, subject: 'Hi {{candidate_first_name}}', body: '<p>Write your first outreach email here.</p>' },
        ],
      }),
    })

    if (!res.ok) {
      const json = await res.json()
      setError(json.error ?? 'Failed to create sequence')
      setCreating(false)
      return
    }

    const { data: newSeq } = await res.json()
    setCreating(false)

    // Navigate to the sequence builder so user can configure stages properly
    onClose()
    router.push(`/sequences/${newSeq.id}`)
  }

  const selectedSeq = sequences.find(s => s.id === selectedId)

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="enroll-candidate-title" className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-blue-500" />
            <h2 id="enroll-candidate-title" className="text-base font-bold text-slate-900">Enroll in Sequence</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Candidate preview */}
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="text-xs font-semibold text-blue-600 mb-1">
              {candidateIds.length} candidate{candidateIds.length > 1 ? 's' : ''}
            </p>
            {candidateNames && candidateNames.length > 0 && (
              <p className="text-xs text-blue-500 truncate">
                {candidateNames.slice(0, 5).join(', ')}
                {candidateNames.length > 5 && ` +${candidateNames.length - 5} more`}
              </p>
            )}
          </div>

          {/* Sequence selector */}
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading sequences...
            </div>
          ) : sequences.length === 0 ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <div className="flex items-center gap-2 text-amber-700">
                  <AlertTriangle className="h-4 w-4" />
                  <p className="text-sm font-medium">No active sequences</p>
                </div>
                <p className="text-xs text-amber-600 mt-1">
                  Create a new sequence to get started, or activate an existing one from the Sequences page.
                </p>
              </div>
              <button
                onClick={handleCreateSequence}
                disabled={creating}
                className="flex items-center justify-center gap-2 w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {creating ? 'Creating...' : 'Create & Configure Sequence'}
              </button>
              <button
                onClick={() => { onClose(); router.push('/sequences') }}
                className="flex items-center justify-center gap-2 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Go to Sequences Page
              </button>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-500">Select Sequence</label>
                <button
                  onClick={handleCreateSequence}
                  disabled={creating}
                  className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                >
                  {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                  New
                </button>
              </div>
              <select
                value={selectedId}
                onChange={e => setSelectedId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                {sequences.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.stage_count ?? 0} stages, {s.enrollment_count ?? 0} enrolled)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Sequence preview */}
          {selectedSeq && selectedSeq.stages && selectedSeq.stages.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500">Stages Preview</p>
              {selectedSeq.stages.map((stage, i) => (
                <div key={stage.id} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-600 mt-0.5">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-700 truncate">{stage.subject}</p>
                    <p className="text-[10px] text-slate-400">
                      {stage.delay_days === 0 ? 'Immediate' : `Day ${stage.delay_days}`}
                      {stage.send_on_behalf_of && ` · From: ${stage.send_on_behalf_of}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-sm font-semibold text-emerald-700">
                {result.enrolled_count} enrolled successfully
              </p>
              {result.skipped_count > 0 && (
                <p className="text-xs text-emerald-600 mt-0.5">
                  {result.skipped_count} skipped (already in an active sequence)
                </p>
              )}
            </div>
          )}

          {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-6 py-4 flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && sequences.length > 0 && (
            <button
              onClick={handleEnroll}
              disabled={enrolling}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {enrolling && <Loader2 className="h-4 w-4 animate-spin" />}
              Enroll
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
