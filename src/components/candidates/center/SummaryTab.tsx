'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Wand2, Loader2, RefreshCw, FileText, ExternalLink, TrendingUp, TrendingDown, Phone, ChevronRight } from 'lucide-react'
import type { Candidate, Application, AiRecommendation, HiringRequest } from '@/lib/types/database'
import VoiceCallDetailModal from '../VoiceCallDetailModal'
import { ScoreRing } from '@/components/ui/ScoreRing'
import { Panel } from '@/components/ui/card'
import { useCandidateProfile } from '../CandidateProfileContext'

interface VoiceCallSummary {
  id: string
  status: string
  created_at: string
  duration_seconds: number | null
  ai_score: number | null
  ai_recommendation: string | null
  hiring_request_id: string | null
  metadata: { position_title?: string; candidate_name?: string }
}

const CALL_STATUS: Record<string, { label: string; color: string }> = {
  completed:   { label: 'Completed',   color: 'text-emerald-600' },
  in_progress: { label: 'In Progress', color: 'text-slate-600'    },
  ringing:     { label: 'Ringing',     color: 'text-amber-600'   },
  no_answer:   { label: 'No Answer',   color: 'text-slate-500'   },
  failed:      { label: 'Failed',      color: 'text-red-600'     },
  cancelled:   { label: 'Cancelled',   color: 'text-slate-500'   },
}

const CALL_REC: Record<string, { label: string; color: string; bg: string }> = {
  strong_yes: { label: 'Strong Yes', color: 'text-emerald-700', bg: 'bg-emerald-100' },
  yes:        { label: 'Yes',        color: 'text-slate-700',    bg: 'bg-slate-100'    },
  maybe:      { label: 'Maybe',      color: 'text-amber-700',   bg: 'bg-amber-100'   },
  no:         { label: 'No',         color: 'text-red-700',     bg: 'bg-red-100'     },
}

interface SummaryTabProps {
  candidate: Candidate
  applications: (Application & {
    pipeline_stages: { name: string; color: string } | null
    hiring_requests: Pick<HiringRequest, 'id' | 'position_title' | 'department' | 'ticket_number'> | null
  })[]
}

const REC_CONFIG: Record<AiRecommendation, { label: string; color: string; bg: string }> = {
  strong_yes: { label: 'Strong Yes',  color: 'text-emerald-700', bg: 'bg-emerald-100' },
  yes:        { label: 'Yes',         color: 'text-slate-700',    bg: 'bg-slate-100'    },
  maybe:      { label: 'Maybe',       color: 'text-amber-700',   bg: 'bg-amber-100'   },
  no:         { label: 'No',          color: 'text-red-700',     bg: 'bg-red-100'     },
}


export default function SummaryTab({ candidate, applications }: SummaryTabProps) {
  const { reload } = useCandidateProfile()
  const [summary, setSummary] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')
  const mountedRef = useRef(true)

  // Re-run CV extraction on demand (fills blank profile fields from the resume).
  const [reparsing, setReparsing] = useState(false)
  const reparse = async () => {
    setReparsing(true)
    try {
      const res = await fetch(`/api/candidates/${candidate.id}/parse-cv`, { method: 'POST' })
      const json = await res.json().catch(() => null)
      if (res.ok && json?.data?.updated) await reload()
    } catch {
      // Non-critical — leave the profile as-is on failure.
    } finally {
      if (mountedRef.current) setReparsing(false)
    }
  }

  // Phone screen call history
  const [calls, setCalls] = useState<VoiceCallSummary[]>([])
  const [callsLoading, setCallsLoading] = useState(true)
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // Check for existing summary on mount
  const checkExisting = useCallback(async () => {
    try {
      const res = await fetch(`/api/candidates/${candidate.id}/ai-summary`)
      if (res.ok) {
        const json = await res.json()
        if (json.data?.summary && mountedRef.current) {
          setSummary(json.data.summary)
        }
      }
    } catch {
      // Silently ignore — non-critical
    }
  }, [candidate.id])

  useEffect(() => { checkExisting() }, [checkExisting])

  // Load voice calls for this candidate
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/voice/calls?candidate_id=${candidate.id}&limit=10`)
        if (res.ok) {
          const json = await res.json()
          if (mountedRef.current) setCalls(json.data ?? [])
        }
      } catch { /* non-critical */ } finally {
        if (mountedRef.current) setCallsLoading(false)
      }
    }
    load()
  }, [candidate.id])

  // Poll for summary result after triggering background generation
  const pollForResult = useCallback(async () => {
    const MAX_ATTEMPTS = 30
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      if (!mountedRef.current) return
      await new Promise(resolve => setTimeout(resolve, 2000))
      if (!mountedRef.current) return

      try {
        const res = await fetch(`/api/candidates/${candidate.id}/ai-summary`)
        if (!res.ok) continue
        const json = await res.json()
        if (json.data?.summary) {
          if (mountedRef.current) {
            setSummary(json.data.summary)
            setGenerating(false)
          }
          return
        }
        // Still processing — continue polling
      } catch {
        // Network error — continue polling
      }
    }
    // Timed out
    if (mountedRef.current) {
      setGenError('Taking longer than expected. Please try again later.')
      setGenerating(false)
    }
  }, [candidate.id])

  const generate = async () => {
    setGenerating(true); setGenError('')
    try {
      const res = await fetch(`/api/candidates/${candidate.id}/ai-summary`, { method: 'POST' })
      const json = await res.json()

      if (res.status === 202) {
        // Background processing started — poll for result
        pollForResult()
        return
      }

      if (!res.ok) {
        setGenError(json.error ?? 'Generation failed')
        setGenerating(false)
        return
      }

      // Direct response (non-background mode)
      if (json.data?.summary) {
        setSummary(json.data.summary)
      }
      setGenerating(false)
    } catch {
      setGenError('Network error. Please try again.')
      setGenerating(false)
    }
  }

  // Find applications that have been AI-scored
  const scoredApps = applications.filter(a => a.ai_score !== null && a.ai_scored_at)

  return (
    <>
    <div className="space-y-4 p-5">

      {/* ── AI Scorecard (one per scored application) ─────────────────────── */}
      {scoredApps.map(app => {
        const rec = app.ai_recommendation ? REC_CONFIG[app.ai_recommendation] : null
        return (
          <Panel
            key={app.id}
            icon={TrendingUp}
            title="AI Score"
            meta={applications.length > 1 ? `· ${app.hiring_requests?.position_title ?? 'Role'}` : undefined}
            action={app.ai_scored_at ? (
              <span className="text-[10px] text-slate-400">
                Scored {new Date(app.ai_scored_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            ) : undefined}
          >
            <div className="flex items-start gap-5 px-5 py-4">
              <ScoreRing score={app.ai_score!} />
              <div className="min-w-0 flex-1">
                {rec && (
                  <span className={`mb-3 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${rec.bg} ${rec.color}`}>
                    {rec.label}
                  </span>
                )}
                {app.ai_criterion_scores && app.ai_criterion_scores.length > 0 && (
                  <div className="mb-3 space-y-1.5">
                    {app.ai_criterion_scores.map((c, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <p className="w-28 shrink-0 truncate text-[10px] text-slate-500">{c.name}</p>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-slate-500" style={{ width: `${(c.rating / 4) * 100}%` }} />
                        </div>
                        <span className="w-8 text-right text-[10px] text-slate-400">{c.rating}/4</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  {app.ai_strengths?.length > 0 && (
                    <div>
                      <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                        <TrendingUp className="h-2.5 w-2.5" /> Strengths
                      </p>
                      <ul className="space-y-0.5">
                        {app.ai_strengths.slice(0, 3).map((s, i) => (
                          <li key={i} className="text-[10px] leading-relaxed text-slate-600">• {s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {app.ai_gaps?.length > 0 && (
                    <div>
                      <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold text-amber-600">
                        <TrendingDown className="h-2.5 w-2.5" /> Gaps
                      </p>
                      <ul className="space-y-0.5">
                        {app.ai_gaps.slice(0, 3).map((g, i) => (
                          <li key={i} className="text-[10px] leading-relaxed text-slate-600">• {g}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Panel>
        )
      })}

      {/* ── AI Summary ────────────────────────────────────────────────────── */}
      <Panel
        icon={Wand2}
        title="AI Summary"
        action={
          <button
            onClick={generate}
            disabled={generating}
            className="flex items-center gap-1.5 rounded-lg bg-slate-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-60 transition-colors"
          >
            {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : summary ? <RefreshCw className="h-3 w-3" /> : <Wand2 className="h-3 w-3" />}
            {generating ? 'Generating…' : summary ? 'Regenerate' : 'Generate Summary'}
          </button>
        }
      >
        <div className="px-5 py-4">
          {genError && <p className="text-sm text-red-600">{genError}</p>}
          {summary ? (
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{summary}</p>
          ) : !generating && (
            <p className="text-sm italic text-slate-400">Click &quot;Generate Summary&quot; to get an AI overview of this candidate.</p>
          )}
        </div>
      </Panel>

      {/* ── Phone Screens ─────────────────────────────────────────────────── */}
      <Panel
        icon={Phone}
        title="Phone Screens"
        action={!callsLoading ? (
          <span className="text-xs text-slate-400">{calls.length} call{calls.length !== 1 ? 's' : ''}</span>
        ) : undefined}
      >
        <div className="divide-y divide-slate-100">
          {callsLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            </div>
          ) : calls.length === 0 ? (
            <div className="flex flex-col items-center px-4 py-8 text-center">
              <Phone className="mb-2 h-7 w-7 text-slate-200" />
              <p className="text-sm text-slate-400">No phone screens yet</p>
              <p className="mt-1 text-xs text-slate-300">Use the &quot;Phone Screen&quot; button above to start one</p>
            </div>
          ) : calls.map(call => {
              const statusCfg = CALL_STATUS[call.status] ?? { label: call.status, color: 'text-slate-500' }
              const recCfg    = call.ai_recommendation ? CALL_REC[call.ai_recommendation] : null
              const dateStr   = new Date(call.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              const duration  = call.duration_seconds != null
                ? `${Math.floor(call.duration_seconds / 60)}m ${call.duration_seconds % 60}s`
                : null
              return (
                <button
                  key={call.id}
                  onClick={() => setSelectedCallId(call.id)}
                  className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-slate-50"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-50">
                    <Phone className="h-3.5 w-3.5 text-emerald-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-xs font-semibold ${statusCfg.color}`}>{statusCfg.label}</span>
                      {recCfg && (
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${recCfg.bg} ${recCfg.color}`}>
                          {recCfg.label}
                        </span>
                      )}
                      {call.ai_score != null && (
                        <span className="text-[10px] text-slate-400">Score: {call.ai_score}/100</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {dateStr}{duration ? ` · ${duration}` : ''}
                      {call.metadata?.position_title ? ` · ${call.metadata.position_title}` : ''}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                </button>
              )
            })}
        </div>
      </Panel>

      {/* ── Resume / CV ───────────────────────────────────────────────────── */}
      <Panel
        icon={FileText}
        title="Resume / CV"
        action={candidate.resume_url ? (
          <div className="flex items-center gap-3">
            <button
              onClick={reparse}
              disabled={reparsing}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 disabled:opacity-60"
              title="Re-read this CV and fill in any blank profile fields (skills, title, etc.)"
            >
              {reparsing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              {reparsing ? 'Reading…' : 'Re-parse CV'}
            </button>
            <a href={`/api/candidates/${candidate.id}/resume`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-800">
              <ExternalLink className="h-3 w-3" /> Download
            </a>
          </div>
        ) : undefined}
      >
        <div className="p-2">
          {candidate.resume_url ? (
            <iframe
              src={`/api/candidates/${candidate.id}/resume`}
              className="h-[500px] w-full rounded-xl border border-slate-100"
              title="Resume"
            />
          ) : (
            <div className="flex flex-col items-center py-10 text-center">
              <FileText className="mb-2 h-8 w-8 text-slate-200" />
              <p className="text-sm text-slate-400">No resume uploaded</p>
            </div>
          )}
        </div>
      </Panel>
    </div>

    {selectedCallId && (
      <VoiceCallDetailModal
        callId={selectedCallId}
        onClose={() => setSelectedCallId(null)}
      />
    )}
    </>
  )
}
