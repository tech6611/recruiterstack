'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Pencil, Trash2, FileText } from 'lucide-react'
import { SlideOver } from '@/components/ui/SlideOver'
import { CandidateForm } from '@/components/candidates/CandidateForm'
import { MatchCard } from '@/components/matching/MatchCard'
import { StatusBadge } from '@/components/ui/Badge'
import type { Candidate, MatchWithRelations } from '@/lib/types/database'

export default function CandidateProfilePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [matches, setMatches] = useState<MatchWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [candRes, matchRes] = await Promise.all([
      fetch(`/api/candidates/${id}`),
      fetch(`/api/matches?candidate_id=${id}`),
    ])
    if (candRes.ok) {
      const json = await candRes.json()
      setCandidate(json.data)
    }
    if (matchRes.ok) {
      const json = await matchRes.json()
      setMatches(json.data ?? [])
    }
    setLoading(false)
  }, [id])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleDelete = async () => {
    if (!confirm(`Delete ${candidate?.name}? This cannot be undone.`)) return
    setDeleting(true)
    const res = await fetch(`/api/candidates/${id}`, { method: 'DELETE' })
    if (res.ok) {
      router.push('/candidates')
    } else {
      alert('Failed to delete candidate.')
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
        Loading…
      </div>
    )
  }

  if (!candidate) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
        Candidate not found.
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      {/* Profile card */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{candidate.name}</h1>
            <p className="text-sm text-slate-500 mt-0.5">{candidate.email}</p>
            {candidate.phone && (
              <p className="text-sm text-slate-400">{candidate.phone}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge status={candidate.status} variant="candidate" />
            <button
              onClick={() => setEditOpen(true)}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              title="Edit"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Title</p>
            <p className="text-slate-700">{candidate.current_title ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Location</p>
            <p className="text-slate-700">{candidate.location ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Experience</p>
            <p className="text-slate-700">{candidate.experience_years} yrs</p>
          </div>
        </div>

        {candidate.resume_url && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <FileText className="h-4 w-4 text-blue-400 shrink-0" />
            <span className="font-medium text-slate-600">Resume on file</span>
          </div>
        )}

        {candidate.skills.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Skills</p>
            <div className="flex flex-wrap gap-1.5">
              {candidate.skills.map(skill => (
                <span
                  key={skill}
                  className="inline-block rounded-md bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600 font-medium"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Match scores */}
      {matches.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-slate-800">AI Match Scores</h2>
          {matches.map(match => (
            <MatchCard key={match.id} match={match} showRole />
          ))}
        </div>
      )}

      {/* Edit slide-over */}
      <SlideOver open={editOpen} onClose={() => setEditOpen(false)} title="Edit Candidate">
        <CandidateForm
          candidate={candidate}
          onSuccess={() => {
            setEditOpen(false)
            fetchData()
          }}
        />
      </SlideOver>
    </div>
  )
}
