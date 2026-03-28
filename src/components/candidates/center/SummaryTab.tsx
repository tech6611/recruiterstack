'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Wand2, Loader2, RefreshCw, FileText, ExternalLink, TrendingUp, TrendingDown, Phone, ChevronRight } from 'lucide-react'
import type { Candidate, Application, AiRecommendation, HiringRequest } from '@/lib/types/database'
import VoiceCallDetailModal from '../VoiceCallDetailModal'

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
  in_progress: { label: 'In Progress', color: 'text-blue-600'    },
  ringing:     { label: 'Ringing',     color: 'text-amber-600'   },
  no_answer:   { label: 'No Answer',   color: 'text-slate-500'   },
  failed:      { label: 'Failed',      color: 'text-red-600'     },
  cancelled:   { label: 'Cancelled',   color: 'text-slate-500'   },
}

const CALL_REC: Record<string, { label: string; color: string; bg: string }> = {
  strong_yes: { label: 'Strong Yes', color: 'text-emerald-700', bg: 'bg-emerald-100' },
  yes:        { label: 'Yes',        color: 'text-blue-700',    bg: 'bg-blue-100'    },
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
  yes:        { label: 'Yes',         color: 'text-blue-700',    bg: 'bg-blue-100'    },
  maybe:      { label: 'Maybe',       color: 'text-amber-700',   bg: 'bg-amber-100'   },
  no:         { label: 'No',          color: 'text-red-700',     bg: 'bg-red-100'     },
}

function ScoreRing({ score }: { score: number }) {
  const radius = 28
  const circ   = 2 * Math.PI * radius
  const offset = circ - (score / 100) * circ
  const color  = score >= 70 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444'
  return (
    <svg width="72" height="72" className="shrink-0">
      <circle cx="36" cy="36" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="6" />
      <circle
        cx="36" cy="36" r={radius} fill="none"
        stroke={color} strokeWidth="6"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 36 36)"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
      <text x="36" y="36" textAnchor="middle" dominantBaseline="central"
        fill={color} fontSize="14" fontWeight="700">
        {score}
      </text>
    </svg>
  )
}

export default function SummaryTab({ candidate, applications }: SummaryTabProps) {
  const [summary, setSummary] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')
  const mountedRef = useRef(true)

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
    <div className="p-5 space-y-5">

      {/* ── AI Scorecard (if any application has been scored) ─────────────── */}
      {scoredApps.map(app => {
        const rec = app.ai_recommendation ? REC_CONFIG[app.ai_recommendation] : null
        return (
          <div key={app.id} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-violet-500" />
                <h3 className="text-sm font-semibold text-slate-800">AI Score</h3>
                {applications.length > 1 && (
                  <span className="text-[10px] text-slate-400">
                    · {app.hiring_requests?.position_title ?? 'Role'}
                  </span>
                )}
              </div>
              {app.ai_scored_at && (
                <span className="text-[10px] text-slate-400">
                  Scored {new Date(app.ai_scored_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              )}
            </div>

            <div className="px-4 py-4 flex items-start gap-5">
              {/* Score ring */}
              <ScoreRing score={app.ai_score!} />

              {/* Recommendation + criteria */}
              <div className="flex-1 min-w-0">
                {rec && (
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold mb-3 ${rec.bg} ${rec.color}`}>
                    {rec.label}
                  </span>
                )}

                {/* Criteria bars */}
                {app.ai_criterion_scores && app.ai_criterion_scores.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {app.ai_criterion_scores.map((c, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <p className="text-[10px] text-slate-500 w-28 shrink-0 truncate">{c.name}</p>
                        <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-violet-500"
                            style={{ width: `${(c.rating / 4) * 100}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-slate-400 w-8 text-right">{c.rating}/4</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Strengths & Gaps */}
                <div className="grid grid-cols-2 gap-3">
                  {app.ai_strengths?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-emerald-600 flex items-center gap-1 mb-1">
                        <TrendingUp className="h-2.5 w-2.5" /> Strengths
                      </p>
                      <ul className="space-y-0.5">
                        {app.ai_strengths.slice(0, 3).map((s, i) => (
                          <li key={i} className="text-[10px] text-slate-600 leading-relaxed">• {s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {app.ai_gaps?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-amber-600 flex items-center gap-1 mb-1">
                        <TrendingDown className="h-2.5 w-2.5" /> Gaps
                      </p>
                      <ul className="space-y-0.5">
                        {app.ai_gaps.slice(0, 3).map((g, i) => (
                          <li key={i} className="text-[10px] text-slate-600 leading-relaxed">• {g}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })}

      {/* ── AI Summary ────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-violet-500" />
            <h3 className="text-sm font-semibold text-slate-800">AI Summary</h3>
          </div>
          <button
            onClick={generate}
            disabled={generating}
            className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-60 transition-colors"
          >
            {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : summary ? <RefreshCw className="h-3 w-3" /> : <Wand2 className="h-3 w-3" />}
            {generating ? 'Generating…' : summary ? 'Regenerate' : 'Generate Summary'}
          </button>
        </div>
        <div className="px-4 py-4">
          {genError && <p className="text-sm text-red-600">{genError}</p>}
          {summary ? (
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{summary}</p>
          ) : !generating && (
            <p className="text-sm text-slate-400 italic">Click &quot;Generate Summary&quot; to get an AI overview of this candidate.</p>
          )}
        </div>
      </div>

      {/* ── Phone Screens ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
          <Phone className="h-4 w-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-slate-800">Phone Screens</h3>
          {!callsLoading && (
            <span className="ml-auto text-xs text-slate-400">{calls.length} call{calls.length !== 1 ? 's' : ''}</span>
          )}
        </div>
        <div className="divide-y divide-slate-100">
          {callsLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            </div>
          ) : calls.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center px-4">
              <Phone className="h-7 w-7 text-slate-200 mb-2" />
              <p className="text-sm text-slate-400">No phone screens yet</p>
              <p className="text-xs text-slate-300 mt-1">Use the &quot;Phone Screen&quot; button above to start one</p>
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
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
                >
                  <div className="h-8 w-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                    <Phone className="h-3.5 w-3.5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
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
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {dateStr}{duration ? ` · ${duration}` : ''}
                      {call.metadata?.position_title ? ` · ${call.metadata.position_title}` : ''}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
                </button>
              )
            })}
          </div>
        </div>

      {/* ── Resume / CV ───────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-800">Resume / CV</h3>
          </div>
          {candidate.resume_url && (
            <a href={candidate.resume_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
              <ExternalLink className="h-3 w-3" /> Download
            </a>
          )}
        </div>
        <div className="p-2">
          {candidate.resume_url ? (
            <iframe
              src={candidate.resume_url}
              className="w-full h-[500px] rounded-xl border border-slate-100"
              title="Resume"
            />
          ) : (
            <div className="flex flex-col items-center py-10 text-center">
              <FileText className="h-8 w-8 text-slate-200 mb-2" />
              <p className="text-sm text-slate-400">No resume uploaded</p>
            </div>
          )}
        </div>
      </div>
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
