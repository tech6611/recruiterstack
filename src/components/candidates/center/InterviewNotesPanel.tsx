'use client'

import { useEffect, useState } from 'react'
import { FileText, Sparkles, Loader2, ClipboardList, ChevronDown, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'

interface Notes {
  summary: string
  competency_notes: { name: string; signal: string; evidence: string }[]
  highlights: string[]
  concerns: string[]
  follow_ups: string[]
}
interface ScorecardDraft {
  scores: { criterion: string; rating: number; notes: string }[]
  overall_notes: string
}

const SIGNAL: Record<string, string> = {
  strong: 'text-emerald-600',
  mixed: 'text-amber-600',
  weak: 'text-red-600',
  not_covered: 'text-slate-400',
}

/** Component 10 + 11 — paste a transcript, get AI notes mapped to the ICP, then
 *  draft a scorecard from it. Bring-your-own transcript (no meeting bot). */
export function InterviewNotesPanel({ interviewId }: { interviewId: string }) {
  const [open, setOpen] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [notes, setNotes] = useState<Notes | null>(null)
  const [draft, setDraft] = useState<ScorecardDraft | null>(null)
  const [busy, setBusy] = useState<'notes' | 'scorecard' | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!open || loaded) return
    fetch(`/api/interviews/${interviewId}/notes`)
      .then((r) => (r.ok ? r.json() : { data: null }))
      .then((j) => {
        if (j.data?.ai_notes) setNotes(j.data.ai_notes as Notes)
        if (j.data?.transcript) setTranscript(j.data.transcript)
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [open, loaded, interviewId])

  async function generate() {
    if (!transcript.trim()) { toast.error('Paste the interview transcript first.'); return }
    setBusy('notes')
    const res = await fetch(`/api/interviews/${interviewId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript }),
    })
    setBusy(null)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error ?? 'Could not generate notes')
      return
    }
    const { data } = await res.json()
    setNotes(data as Notes)
    toast.success('Interview notes generated.')
  }

  async function draftScorecard() {
    setBusy('scorecard')
    const res = await fetch(`/api/interviews/${interviewId}/scorecard-draft`, { method: 'POST' })
    setBusy(null)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error ?? 'Could not draft a scorecard')
      return
    }
    const { data } = await res.json()
    setDraft(data as ScorecardDraft)
    toast.success('Scorecard drafted — review it, then fill your scorecard.')
  }

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700">
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <FileText className="h-3.5 w-3.5" /> Notes &amp; transcript
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={4}
            placeholder="Paste the interview transcript here…"
            className="w-full rounded-lg border border-slate-200 p-2.5 text-xs text-slate-800 focus:border-emerald-500 focus:outline-none"
          />
          <div className="flex flex-wrap gap-2">
            <button onClick={generate} disabled={busy !== null}
              className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              {busy === 'notes' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Generate notes
            </button>
            {notes && (
              <button onClick={draftScorecard} disabled={busy !== null}
                className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                {busy === 'scorecard' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardList className="h-3.5 w-3.5" />} Draft scorecard
              </button>
            )}
          </div>

          {notes && (
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-xs">
              <p className="text-slate-700">{notes.summary}</p>
              {notes.competency_notes?.length > 0 && (
                <div className="space-y-1">
                  {notes.competency_notes.map((c, i) => (
                    <div key={i}>
                      <span className="font-medium text-slate-700">{c.name}</span>
                      <span className={`ml-1 font-semibold ${SIGNAL[c.signal] ?? 'text-slate-500'}`}>{c.signal.replace('_', ' ')}</span>
                      {c.evidence && <span className="text-slate-500"> — {c.evidence}</span>}
                    </div>
                  ))}
                </div>
              )}
              {notes.concerns?.length > 0 && <p className="text-red-600">Concerns: {notes.concerns.join('; ')}</p>}
              {notes.follow_ups?.length > 0 && <p className="text-slate-500">Follow-ups: {notes.follow_ups.join('; ')}</p>}
            </div>
          )}

          {draft && (
            <div className="space-y-1.5 rounded-lg border border-sky-200 bg-sky-50/60 p-3 text-xs">
              <div className="font-semibold text-sky-700">Draft scorecard (review, then fill yours)</div>
              {draft.scores.map((s, i) => (
                <div key={i}>
                  <span className="font-medium text-slate-700">{s.criterion}</span>
                  <span className="text-slate-400"> · {s.rating}/4</span>
                  {s.notes && <span className="text-slate-500"> — {s.notes}</span>}
                </div>
              ))}
              {draft.overall_notes && <p className="mt-1 text-slate-600">{draft.overall_notes}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
