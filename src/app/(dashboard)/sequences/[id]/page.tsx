'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Loader2, Plus, Trash2, Pencil, X,
  ArrowDown, Play, Pause, Mail, Users, TrendingUp,
  User, Clock,
} from 'lucide-react'
import type { Sequence, SequenceStage, SequenceEnrollment, SequenceStatus, Candidate } from '@/lib/types/database'
import SequenceStageEditor from '@/components/sequences/SequenceStageEditor'
import SequenceAnalytics from '@/components/sequences/SequenceAnalytics'

// ── Status config ───────────────────────────────────────────────────────────

const STATUS_BADGE: Record<SequenceStatus, { label: string; cls: string }> = {
  draft:    { label: 'Draft',    cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  active:   { label: 'Active',   cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  archived: { label: 'Archived', cls: 'bg-red-50 text-red-600 border-red-200' },
}

const ENROLL_STATUS_CLS: Record<string, string> = {
  active:    'bg-blue-50 text-blue-700',
  completed: 'bg-slate-100 text-slate-600',
  replied:   'bg-emerald-50 text-emerald-700',
  bounced:   'bg-red-50 text-red-600',
  paused:    'bg-amber-50 text-amber-700',
  cancelled: 'bg-slate-100 text-slate-500',
}

// ── Types ───────────────────────────────────────────────────────────────────

type Tab = 'stages' | 'enrollments' | 'analytics'

// ── Page ────────────────────────────────────────────────────────────────────

export default function SequenceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [seq, setSeq]                     = useState<Sequence | null>(null)
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState('')
  const [tab, setTab]                     = useState<Tab>('stages')
  const [editingName, setEditingName]     = useState(false)
  const [nameInput, setNameInput]         = useState('')
  const [enrollments, setEnrollments]     = useState<SequenceEnrollment[]>([])
  const [enrollLoading, setEnrollLoading] = useState(false)

  // Stage editor state
  const [editorOpen, setEditorOpen]       = useState(false)
  const [editingStage, setEditingStage]   = useState<SequenceStage | null>(null)

  // Add candidates state
  const [showAddCandidates, setShowAddCandidates] = useState(false)
  const [candidateSearch, setCandidateSearch]       = useState('')
  const [searchResults, setSearchResults]           = useState<Candidate[]>([])
  const [searching, setSearching]                   = useState(false)
  const [selectedCandidates, setSelectedCandidates] = useState<Candidate[]>([])
  const [enrollingDirect, setEnrollingDirect]       = useState(false)

  // ── Candidate search for direct enrollment ─────────────────────────────
  const searchCandidates = async (q: string) => {
    setCandidateSearch(q)
    if (q.length < 2) { setSearchResults([]); return }
    setSearching(true)
    const res = await fetch(`/api/candidates?search=${encodeURIComponent(q)}&limit=10`)
    if (res.ok) {
      const json = await res.json()
      setSearchResults(json.data ?? [])
    }
    setSearching(false)
  }

  const toggleCandidate = (c: Candidate) => {
    setSelectedCandidates(prev =>
      prev.find(x => x.id === c.id) ? prev.filter(x => x.id !== c.id) : [...prev, c]
    )
  }

  const enrollSelected = async () => {
    if (selectedCandidates.length === 0) return
    setEnrollingDirect(true)
    const res = await fetch(`/api/sequences/${id}/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidate_ids: selectedCandidates.map(c => c.id) }),
    })
    setEnrollingDirect(false)
    if (res.ok) {
      setSelectedCandidates([])
      setCandidateSearch('')
      setSearchResults([])
      setShowAddCandidates(false)
      loadEnrollments()
      loadSequence()
    }
  }

  const loadSequence = useCallback(async () => {
    const res = await fetch(`/api/sequences/${id}`)
    if (res.ok) {
      const json = await res.json()
      setSeq(json.data)
      setNameInput(json.data.name)
    } else {
      setError('Sequence not found')
    }
    setLoading(false)
  }, [id])

  const loadEnrollments = useCallback(async () => {
    setEnrollLoading(true)
    const res = await fetch(`/api/sequences/${id}/enrollments`)
    if (res.ok) {
      const json = await res.json()
      setEnrollments(json.data ?? [])
    }
    setEnrollLoading(false)
  }, [id])

  useEffect(() => { loadSequence() }, [loadSequence])
  useEffect(() => { if (tab === 'enrollments') loadEnrollments() }, [tab, loadEnrollments])

  // ── Actions ─────────────────────────────────────────────────────────────

  const saveName = async () => {
    if (!nameInput.trim() || !seq) return
    await fetch(`/api/sequences/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nameInput.trim() }),
    })
    setEditingName(false)
    loadSequence()
  }

  const toggleStatus = async () => {
    if (!seq) return
    const newStatus: SequenceStatus = seq.status === 'active' ? 'draft' : 'active'
    await fetch(`/api/sequences/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    loadSequence()
  }

  const deleteStage = async (stageId: string) => {
    if (!confirm('Delete this stage? Candidates already past this stage won\'t be affected.')) return
    await fetch(`/api/sequences/${id}/stages/${stageId}`, { method: 'DELETE' })
    loadSequence()
  }

  const updateEnrollmentStatus = async (enrollId: string, status: string) => {
    await fetch(`/api/enrollments/${enrollId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    loadEnrollments()
  }

  // ── Loading / Error ───────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
      </div>
    )
  }

  if (error || !seq) {
    return (
      <div className="p-8">
        <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <p className="text-sm text-red-500">{error || 'Sequence not found'}</p>
      </div>
    )
  }

  const stages = seq.stages ?? []
  const badge = STATUS_BADGE[seq.status] ?? STATUS_BADGE.draft

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="px-8 py-8 max-w-4xl">
      {/* Header */}
      <button onClick={() => router.push('/sequences')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Sequences
      </button>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex-1 min-w-0">
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onBlur={saveName}
                onKeyDown={e => e.key === 'Enter' && saveName()}
                className="text-xl font-bold text-slate-900 border-b-2 border-blue-400 outline-none bg-transparent"
              />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 truncate">{seq.name}</h1>
              <button onClick={() => setEditingName(true)} className="text-slate-400 hover:text-slate-600">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.cls}`}>
                {badge.label}
              </span>
            </div>
          )}
          {seq.description && <p className="text-sm text-slate-400 mt-0.5">{seq.description}</p>}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowAddCandidates(true)}
            className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
          >
            <Users className="h-4 w-4" /> Add Candidates
          </button>
          <button
            onClick={toggleStatus}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
              seq.status === 'active'
                ? 'border border-amber-200 text-amber-700 hover:bg-amber-50'
                : 'bg-emerald-600 text-white hover:bg-emerald-700'
            }`}
          >
            {seq.status === 'active'
              ? <><Pause className="h-4 w-4" /> Deactivate</>
              : <><Play className="h-4 w-4" /> Activate</>
            }
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1 w-fit mb-6">
        {([
          { id: 'stages' as Tab,      label: 'Stages',      icon: Mail,       count: stages.length },
          { id: 'enrollments' as Tab, label: 'Enrollments', icon: Users,      count: seq.enrollment_count ?? 0 },
          { id: 'analytics' as Tab,   label: 'Analytics',   icon: TrendingUp },
        ]).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
            {t.count !== undefined && (
              <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                tab === t.id ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-500'
              }`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ─── Stages Tab ──────────────────────────────────────────────────── */}
      {tab === 'stages' && (
        <div className="space-y-0">
          {stages.map((stage, i) => {
            const cumulativeDays = stages.slice(0, i + 1).reduce((sum, s) => sum + s.delay_days, 0)
            return (
              <div key={stage.id}>
                {/* Stage card */}
                <div className="group rounded-2xl border border-slate-200 bg-white p-5 hover:border-slate-300 transition-all">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-600 mt-0.5">
                        {stage.order_index}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                            stage.channel === 'email' ? 'bg-blue-100 text-blue-700' :
                            stage.channel === 'whatsapp' ? 'bg-green-100 text-green-700' :
                            stage.channel === 'sms' ? 'bg-violet-100 text-violet-700' :
                            'bg-sky-100 text-sky-700'
                          }`}>
                            {stage.channel ?? 'email'}
                          </span>
                          {stage.condition && (
                            <span className="inline-flex items-center rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                              if {stage.condition.replace('_', ' ')}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-slate-800 truncate">{stage.subject}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {stage.delay_days === 0 ? 'Immediate' : `+${stage.delay_days} ${stage.delay_business_days ? 'business ' : ''}day${stage.delay_days > 1 ? 's' : ''}`}
                            {cumulativeDays > 0 && ` (Day ${cumulativeDays})`}
                          </span>
                          {stage.send_at_time && (
                            <span>at {stage.send_at_time.slice(0, 5)} {stage.send_timezone ?? 'UTC'}</span>
                          )}
                          {stage.send_on_behalf_of && (
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" /> {stage.send_on_behalf_of}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-2 line-clamp-2">
                          {stage.body.replace(/<[^>]*>/g, '').slice(0, 150)}...
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={() => { setEditingStage(stage); setEditorOpen(true) }}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                        title="Edit stage"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => deleteStage(stage.id)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                        title="Delete stage"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Connector arrow */}
                {i < stages.length - 1 && (
                  <div className="flex items-center justify-center py-1">
                    <ArrowDown className="h-4 w-4 text-slate-300" />
                  </div>
                )}
              </div>
            )
          })}

          {/* Add stage button */}
          <div className={stages.length > 0 ? 'pt-3' : ''}>
            <button
              onClick={() => { setEditingStage(null); setEditorOpen(true) }}
              className="flex items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 px-4 py-3 text-sm font-medium text-slate-400 hover:border-blue-300 hover:text-blue-600 transition-colors w-full justify-center"
            >
              <Plus className="h-4 w-4" /> Add Stage
            </button>
          </div>
        </div>
      )}

      {/* ─── Enrollments Tab ─────────────────────────────────────────────── */}
      {tab === 'enrollments' && (
        <div>
          {enrollLoading ? (
            <div className="flex items-center gap-2 py-12 justify-center text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading enrollments...
            </div>
          ) : enrollments.length === 0 ? (
            <div className="text-center py-16">
              <Users className="h-8 w-8 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">No candidates enrolled yet</p>
              <p className="text-xs text-slate-400 mt-1">Enroll candidates from their profile or the candidates list</p>
            </div>
          ) : (
            <div className="space-y-2">
              {enrollments.map(e => (
                <div key={e.id} className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{e.candidate_name || 'Unknown'}</p>
                    <p className="text-xs text-slate-400">{e.candidate_email || ''}</p>
                  </div>
                  <div className="text-xs text-slate-500 text-center">
                    Stage {e.current_stage_index} / {stages.length}
                  </div>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${ENROLL_STATUS_CLS[e.status] ?? 'bg-slate-100 text-slate-600'}`}>
                    {e.status}
                  </span>
                  {e.status === 'active' && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => updateEnrollmentStatus(e.id, 'paused')}
                        className="rounded-lg p-1 text-amber-500 hover:bg-amber-50"
                        title="Pause"
                      >
                        <Pause className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  {e.status === 'paused' && (
                    <button
                      onClick={() => updateEnrollmentStatus(e.id, 'active')}
                      className="rounded-lg p-1 text-emerald-500 hover:bg-emerald-50"
                      title="Resume"
                    >
                      <Play className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Analytics Tab ───────────────────────────────────────────────── */}
      {tab === 'analytics' && (
        <SequenceAnalytics sequenceId={id} />
      )}

      {/* ─── Stage Editor Drawer ─────────────────────────────────────────── */}
      {editorOpen && (
        <SequenceStageEditor
          sequenceId={id}
          stage={editingStage}
          stageCount={stages.length}
          isFirstStage={editingStage ? editingStage.order_index === 1 : stages.length === 0}
          onClose={() => { setEditorOpen(false); setEditingStage(null) }}
          onSaved={loadSequence}
        />
      )}

      {/* ─── Add Candidates Drawer ─────────────────────────────────────────── */}
      {showAddCandidates && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowAddCandidates(false)} />
          <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-500" />
                <h2 className="text-base font-bold text-slate-900">Add Candidates to Sequence</h2>
              </div>
              <button onClick={() => setShowAddCandidates(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {/* Sequence info */}
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
                <p className="text-xs font-semibold text-blue-600">{seq.name}</p>
                <p className="text-[11px] text-blue-500">{stages.length} stages · {seq.status}</p>
              </div>

              {seq.status !== 'active' && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-xs font-medium text-amber-700">Sequence is not active</p>
                  <p className="text-[11px] text-amber-600">Activate the sequence first before enrolling candidates.</p>
                </div>
              )}

              {/* Search */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Search Candidates</label>
                <input
                  type="text"
                  value={candidateSearch}
                  onChange={e => searchCandidates(e.target.value)}
                  placeholder="Search by name, email, or skills..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {/* Search results */}
              {searching && (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> Searching...
                </div>
              )}

              {searchResults.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-slate-400">{searchResults.length} result{searchResults.length !== 1 ? 's' : ''}</p>
                  {searchResults.map(c => {
                    const isSelected = selectedCandidates.some(x => x.id === c.id)
                    return (
                      <button
                        key={c.id}
                        onClick={() => toggleCandidate(c)}
                        className={`w-full flex items-center gap-3 rounded-xl border-2 px-3.5 py-2.5 text-left transition-all ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          isSelected ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {c.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-800 truncate">{c.name}</p>
                          <p className="text-xs text-slate-400 truncate">{c.email}{c.current_title ? ` · ${c.current_title}` : ''}</p>
                        </div>
                        {isSelected && (
                          <span className="text-xs font-semibold text-blue-600">Selected</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Selected candidates */}
              {selectedCandidates.length > 0 && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <p className="text-xs font-semibold text-emerald-700 mb-1">
                    {selectedCandidates.length} selected
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {selectedCandidates.map(c => (
                      <span key={c.id} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                        {c.name}
                        <button onClick={() => toggleCandidate(c)} className="text-emerald-500 hover:text-emerald-800">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-slate-100 px-6 py-4 flex justify-end gap-3 shrink-0">
              <button onClick={() => setShowAddCandidates(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={enrollSelected}
                disabled={enrollingDirect || selectedCandidates.length === 0 || seq.status !== 'active'}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
              >
                {enrollingDirect && <Loader2 className="h-4 w-4 animate-spin" />}
                Enroll {selectedCandidates.length > 0 ? `(${selectedCandidates.length})` : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
