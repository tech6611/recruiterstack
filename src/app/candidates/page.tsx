'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { CandidateTable } from '@/components/dashboard/CandidateTable'
import { SlideOver } from '@/components/ui/SlideOver'
import { CandidateForm } from '@/components/candidates/CandidateForm'
import type { Candidate } from '@/lib/types/database'

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [slideOpen, setSlideOpen] = useState(false)

  const fetchCandidates = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/candidates')
    if (res.ok) {
      const json = await res.json()
      setCandidates(json.data ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchCandidates()
  }, [fetchCandidates])

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Candidates</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage your talent pool</p>
        </div>
        <button
          onClick={() => setSlideOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" />
          Add Candidate
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
          Loading candidates…
        </div>
      ) : (
        <CandidateTable candidates={candidates} clickable />
      )}

      <SlideOver
        open={slideOpen}
        onClose={() => setSlideOpen(false)}
        title="Add Candidate"
      >
        <CandidateForm
          onSuccess={() => {
            setSlideOpen(false)
            fetchCandidates()
          }}
        />
      </SlideOver>
    </div>
  )
}
