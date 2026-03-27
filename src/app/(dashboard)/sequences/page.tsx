'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import {
  Plus, Mail, Loader2, MoreHorizontal,
  Play, Pause, Archive, ChevronRight,
} from 'lucide-react'
import type { Sequence, SequenceStatus } from '@/lib/types/database'

// ── Status config ───────────────────────────────────────────────────────────

const STATUS_BADGE: Record<SequenceStatus, { label: string; cls: string }> = {
  draft:    { label: 'Draft',    cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  active:   { label: 'Active',   cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  archived: { label: 'Archived', cls: 'bg-red-50 text-red-600 border-red-200' },
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function SequencesPage() {
  const router = useRouter()
  const { orgId } = useAuth()
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/sequences')
    if (res.ok) {
      const json = await res.json()
      setSequences(json.data ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { if (orgId) load() }, [load, orgId])

  const handleCreate = async () => {
    setCreating(true)
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
    if (res.ok) {
      const json = await res.json()
      router.push(`/sequences/${json.data.id}`)
    }
    setCreating(false)
  }

  const handleStatusChange = async (id: string, status: SequenceStatus) => {
    const res = await fetch(`/api/sequences/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) load()
  }

  // ── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="px-8 py-8">
        <div className="h-8 w-48 rounded-xl bg-slate-200 animate-pulse mb-6" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-16 rounded-2xl bg-slate-100 animate-pulse mb-3" />
        ))}
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="px-8 py-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Sequences</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Multi-stage email outreach campaigns
          </p>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          New Sequence
        </button>
      </div>

      {/* Empty state */}
      {sequences.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 mb-4">
            <Mail className="h-7 w-7 text-blue-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-800 mb-1">No sequences yet</h2>
          <p className="text-sm text-slate-400 max-w-sm mb-6">
            Create your first email sequence to automate candidate outreach with multi-stage drip campaigns.
          </p>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" /> Create Sequence
          </button>
        </div>
      )}

      {/* Sequence list */}
      {sequences.length > 0 && (
        <div className="space-y-2">
          {sequences.map(seq => {
            const badge = STATUS_BADGE[seq.status] ?? STATUS_BADGE.draft
            const replyRate = seq.enrollment_count && seq.reply_count
              ? Math.round((seq.reply_count / seq.enrollment_count) * 100)
              : 0

            return (
              <div
                key={seq.id}
                onClick={() => router.push(`/sequences/${seq.id}`)}
                className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 hover:border-slate-300 hover:shadow-sm cursor-pointer transition-all"
              >
                {/* Icon */}
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  seq.status === 'active' ? 'bg-emerald-50' : 'bg-slate-50'
                }`}>
                  <Mail className={`h-5 w-5 ${seq.status === 'active' ? 'text-emerald-500' : 'text-slate-400'}`} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-800 truncate">{seq.name}</p>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </div>
                  {seq.description && (
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{seq.description}</p>
                  )}
                </div>

                {/* Stats */}
                <div className="flex items-center gap-6 shrink-0 text-xs text-slate-500">
                  <div className="text-center">
                    <p className="font-bold text-slate-700">{seq.stage_count ?? 0}</p>
                    <p>Stages</p>
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-slate-700">{seq.enrollment_count ?? 0}</p>
                    <p>Enrolled</p>
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-emerald-600">{seq.reply_count ?? 0}{replyRate ? ` (${replyRate}%)` : ''}</p>
                    <p>Replied</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                     onClick={e => e.stopPropagation()}>
                  {seq.status === 'draft' && (
                    <button
                      onClick={() => handleStatusChange(seq.id, 'active')}
                      title="Activate"
                      className="rounded-lg p-1.5 text-emerald-500 hover:bg-emerald-50 transition-colors"
                    >
                      <Play className="h-4 w-4" />
                    </button>
                  )}
                  {seq.status === 'active' && (
                    <button
                      onClick={() => handleStatusChange(seq.id, 'draft')}
                      title="Pause (set to draft)"
                      className="rounded-lg p-1.5 text-amber-500 hover:bg-amber-50 transition-colors"
                    >
                      <Pause className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleStatusChange(seq.id, 'archived')}
                    title="Archive"
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition-colors"
                  >
                    <Archive className="h-4 w-4" />
                  </button>
                </div>

                <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
