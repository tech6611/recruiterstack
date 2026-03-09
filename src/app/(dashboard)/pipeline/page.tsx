'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import type { Candidate, CandidateStatus } from '@/lib/types/database'

// ─── Column config ───────────────────────────────────────────────────────────

type Column = {
  status: CandidateStatus
  label: string
  color: string          // ring / border accent
  bg: string             // column header bg
  dot: string            // dot color
}

const COLUMNS: Column[] = [
  { status: 'active',         label: 'Active',        color: 'border-blue-300',   bg: 'bg-blue-50',    dot: 'bg-blue-500'   },
  { status: 'interviewing',   label: 'Interviewing',  color: 'border-violet-300', bg: 'bg-violet-50',  dot: 'bg-violet-500' },
  { status: 'offer_extended', label: 'Offer Extended',color: 'border-amber-300',  bg: 'bg-amber-50',   dot: 'bg-amber-500'  },
  { status: 'hired',          label: 'Hired',         color: 'border-emerald-300',bg: 'bg-emerald-50', dot: 'bg-emerald-500'},
  { status: 'rejected',       label: 'Rejected',      color: 'border-red-300',    bg: 'bg-red-50',     dot: 'bg-red-400'    },
  { status: 'inactive',       label: 'Inactive',      color: 'border-slate-300',  bg: 'bg-slate-100',  dot: 'bg-slate-400'  },
]

// ─── Card ────────────────────────────────────────────────────────────────────

function CandidateCard({
  candidate,
  onDragStart,
  onClick,
}: {
  candidate: Candidate
  onDragStart: (id: string) => void
  onClick: (id: string) => void
}) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(candidate.id)}
      onClick={() => onClick(candidate.id)}
      className="cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm hover:shadow-md hover:border-slate-300 transition-all select-none"
    >
      <p className="text-sm font-semibold text-slate-800 truncate">{candidate.name}</p>
      {candidate.current_title && (
        <p className="text-xs text-slate-400 mt-0.5 truncate">{candidate.current_title}</p>
      )}
      <div className="flex flex-wrap gap-1 mt-2">
        {candidate.skills.slice(0, 2).map(skill => (
          <span
            key={skill}
            className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500 font-medium"
          >
            {skill}
          </span>
        ))}
        {candidate.skills.length > 2 && (
          <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-400">
            +{candidate.skills.length - 2}
          </span>
        )}
      </div>
      {candidate.experience_years > 0 && (
        <p className="text-xs text-slate-400 mt-2">{candidate.experience_years} yrs exp</p>
      )}
    </div>
  )
}

// ─── Column ──────────────────────────────────────────────────────────────────

function BoardColumn({
  col,
  candidates,
  onDragStart,
  onDrop,
  onCardClick,
}: {
  col: Column
  candidates: Candidate[]
  onDragStart: (id: string) => void
  onDrop: (status: CandidateStatus) => void
  onCardClick: (id: string) => void
}) {
  const [over, setOver] = useState(false)

  return (
    <div
      className={`flex flex-col rounded-2xl border-2 transition-colors ${
        over ? col.color + ' shadow-md' : 'border-transparent'
      }`}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={() => { setOver(false); onDrop(col.status) }}
    >
      {/* Column header */}
      <div className={`flex items-center justify-between rounded-xl px-4 py-3 ${col.bg}`}>
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full shrink-0 ${col.dot}`} />
          <span className="text-sm font-semibold text-slate-700">{col.label}</span>
        </div>
        <span className="text-xs font-semibold text-slate-400 bg-white rounded-full px-2 py-0.5 border border-slate-200">
          {candidates.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 p-2 min-h-[120px]">
        {candidates.map(c => (
          <CandidateCard
            key={c.id}
            candidate={c}
            onDragStart={onDragStart}
            onClick={onCardClick}
          />
        ))}
        {candidates.length === 0 && (
          <div className={`flex-1 rounded-xl border-2 border-dashed transition-colors ${
            over ? col.color : 'border-slate-100'
          } min-h-[80px]`} />
        )}
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function PipelinePage() {
  const router = useRouter()
  const { orgId } = useAuth()
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const dragId = useRef<string | null>(null)

  const fetchCandidates = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/candidates?limit=200')
    if (res.ok) {
      const json = await res.json()
      setCandidates(json.data ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { if (orgId) fetchCandidates() }, [fetchCandidates, orgId])

  const handleDrop = async (newStatus: CandidateStatus) => {
    const id = dragId.current
    if (!id) return
    const candidate = candidates.find(c => c.id === id)
    if (!candidate || candidate.status === newStatus) return

    // Optimistic update
    setCandidates(prev =>
      prev.map(c => c.id === id ? { ...c, status: newStatus } : c)
    )

    const res = await fetch(`/api/candidates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })

    if (!res.ok) {
      // Revert on failure
      setCandidates(prev =>
        prev.map(c => c.id === id ? { ...c, status: candidate.status } : c)
      )
    }

    dragId.current = null
  }

  const grouped = COLUMNS.reduce<Record<CandidateStatus, Candidate[]>>(
    (acc, col) => {
      acc[col.status] = candidates.filter(c => c.status === col.status)
      return acc
    },
    {} as Record<CandidateStatus, Candidate[]>,
  )

  return (
    <div className="flex flex-col min-h-full">
      <div className="px-8 pt-8 mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Pipeline</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Drag candidates between stages to update their status
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
          Loading pipeline…
        </div>
      ) : (
        <div className="flex gap-3 items-start overflow-x-auto px-8 pb-8">
          {COLUMNS.map(col => (
            <div key={col.status} className="w-[220px] shrink-0">
            <BoardColumn
              col={col}
              candidates={grouped[col.status]}
              onDragStart={(id) => { dragId.current = id }}
              onDrop={handleDrop}
              onCardClick={(id) => router.push(`/candidates/${id}`)}
            />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
