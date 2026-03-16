'use client'

import { useState } from 'react'
import { X, Loader2, ClipboardList, AlertCircle } from 'lucide-react'
import type { ScorecardRecommendation, ScorecardScore, Scorecard } from '@/lib/types/database'
import type { Application, HiringRequest } from '@/lib/types/database'
import { RECOMMENDATION_CONFIG, RATING_CONFIG } from './ScorecardCard'

const DEFAULT_CRITERIA = ['Technical Skills', 'Communication', 'Problem Solving', 'Culture Fit']

type ApplicationWithHiringRequest = Application & {
  hiring_requests: Pick<HiringRequest, 'id' | 'position_title' | 'department' | 'ticket_number'> | null
}

interface ScorecardDrawerProps {
  activeApps: ApplicationWithHiringRequest[]
  defaultAppId: string
  onClose: () => void
  onSaved: () => void
}

export default function ScorecardDrawer({ activeApps, defaultAppId, onClose, onSaved }: ScorecardDrawerProps) {
  const [appId, setAppId]                     = useState(defaultAppId)
  const [interviewer, setInterviewer]         = useState('')
  const [round, setRound]                     = useState('')
  const [recommendation, setRecommendation]   = useState<ScorecardRecommendation | ''>('')
  const [scores, setScores]                   = useState<{ criterion: string; rating: 0 | 1 | 2 | 3 | 4; notes: string }[]>(
    DEFAULT_CRITERIA.map(c => ({ criterion: c, rating: 0, notes: '' })),
  )
  const [notes, setNotes]   = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const setRating = (idx: number, rating: 1 | 2 | 3 | 4) => {
    setScores(prev => prev.map((s, i) => i === idx ? { ...s, rating } : s))
  }

  const submit = async () => {
    if (!interviewer.trim()) { setError('Interviewer name is required'); return }
    if (!recommendation)     { setError('Please select a recommendation'); return }
    const unrated = scores.filter(s => s.rating === 0)
    if (unrated.length > 0)  { setError(`Please rate all criteria (missing: ${unrated.map(s => s.criterion).join(', ')})`); return }

    setSaving(true)
    setError('')
    const res = await fetch('/api/scorecards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        application_id:   appId,
        interviewer_name: interviewer.trim(),
        stage_name:       round.trim() || null,
        recommendation,
        scores:           scores.map(s => ({ criterion: s.criterion, rating: s.rating, notes: s.notes })) as ScorecardScore[],
        overall_notes:    notes.trim() || null,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const json = await res.json()
      setError(json.error ?? 'Failed to save scorecard')
      return
    }
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-xl bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
              <ClipboardList className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Add Scorecard</h2>
              <p className="text-xs text-slate-400">Structured interview feedback</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Application selector (if multiple) */}
          {activeApps.length > 1 && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Application</label>
              <select
                value={appId}
                onChange={e => setAppId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                {activeApps.map(app => (
                  <option key={app.id} value={app.id}>
                    {app.hiring_requests?.position_title ?? 'Unknown Role'}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Interviewer + Round */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Interviewer Name *
              </label>
              <input
                value={interviewer}
                onChange={e => setInterviewer(e.target.value)}
                placeholder="Jane Smith"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                Interview Round
              </label>
              <input
                value={round}
                onChange={e => setRound(e.target.value)}
                placeholder="e.g. Phone Screen, Onsite"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>

          {/* Criteria ratings */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Criteria Ratings *</p>
            <div className="space-y-4">
              {scores.map((s, idx) => (
                <div key={s.criterion}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-slate-700">{s.criterion}</span>
                    {s.rating > 0 && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${RATING_CONFIG[s.rating - 1].active}`}>
                        {RATING_CONFIG[s.rating - 1].label}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {RATING_CONFIG.map(r => (
                      <button
                        key={r.value}
                        onClick={() => setRating(idx, r.value)}
                        className={`flex-1 rounded-xl px-2 py-2 text-xs font-semibold border transition-all ${
                          s.rating === r.value ? r.active : r.btn
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Overall recommendation */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Overall Recommendation *</p>
            <div className="grid grid-cols-4 gap-2">
              {(Object.entries(RECOMMENDATION_CONFIG) as [ScorecardRecommendation, typeof RECOMMENDATION_CONFIG[ScorecardRecommendation]][]).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => setRecommendation(key)}
                  className={`rounded-xl px-3 py-2.5 text-sm font-semibold border transition-all ${
                    recommendation === key ? cfg.active : cfg.btn
                  }`}
                >
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Overall impression, key observations…"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2.5">
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-200 shrink-0">
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors border border-slate-200"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 transition-colors disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
            Submit Scorecard
          </button>
        </div>
      </div>
    </div>
  )
}
