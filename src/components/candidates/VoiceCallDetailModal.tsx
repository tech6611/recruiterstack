'use client'

import { useEffect, useState } from 'react'
import { X, Phone, Clock, Calendar, Loader2, MessageSquare, Sparkles, Mic } from 'lucide-react'

interface TranscriptTurn {
  role: 'assistant' | 'user' | string
  content: string
}

interface VoiceCallDetail {
  id: string
  status: string
  phone_number: string | null
  duration_seconds: number | null
  started_at: string | null
  ended_at: string | null
  created_at: string
  transcript: TranscriptTurn[] | null
  summary: string | null
  ai_score: number | null
  ai_recommendation: string | null
  candidate: { name: string; email: string } | null
  hiring_request: { position_title: string; department: string | null } | null
}

const REC_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  strong_yes: { label: 'Strong Yes', color: 'text-emerald-700', bg: 'bg-emerald-100' },
  yes:        { label: 'Yes',        color: 'text-blue-700',    bg: 'bg-blue-100'    },
  maybe:      { label: 'Maybe',      color: 'text-amber-700',   bg: 'bg-amber-100'   },
  no:         { label: 'No',         color: 'text-red-700',     bg: 'bg-red-100'     },
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  completed:   { label: 'Completed',   color: 'text-emerald-700', bg: 'bg-emerald-100' },
  in_progress: { label: 'In Progress', color: 'text-blue-700',    bg: 'bg-blue-100'    },
  ringing:     { label: 'Ringing',     color: 'text-amber-700',   bg: 'bg-amber-100'   },
  no_answer:   { label: 'No Answer',   color: 'text-slate-600',   bg: 'bg-slate-100'   },
  failed:      { label: 'Failed',      color: 'text-red-700',     bg: 'bg-red-100'     },
  cancelled:   { label: 'Cancelled',   color: 'text-slate-600',   bg: 'bg-slate-100'   },
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

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

interface Props {
  callId: string
  onClose: () => void
}

export default function VoiceCallDetailModal({ callId, onClose }: Props) {
  const [call, setCall] = useState<VoiceCallDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/voice/calls/${callId}`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to load call')
        setCall(json.data)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [callId])

  const statusCfg = call ? (STATUS_CONFIG[call.status] ?? { label: call.status, color: 'text-slate-600', bg: 'bg-slate-100' }) : null
  const recCfg    = call?.ai_recommendation ? (REC_CONFIG[call.ai_recommendation] ?? null) : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-blue-50 flex items-center justify-center">
              <Phone className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Phone Screen Details</h3>
              {call && (
                <p className="text-xs text-slate-400 mt-0.5">
                  {call.hiring_request?.position_title ?? 'Unknown Role'}
                  {call.candidate ? ` · ${call.candidate.name}` : ''}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-20 text-sm text-red-500">{error}</div>
          ) : call ? (
            <div className="p-5 space-y-5">

              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-3">
                {statusCfg && (
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${statusCfg.bg} ${statusCfg.color}`}>
                    {statusCfg.label}
                  </span>
                )}
                {call.created_at && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatDate(call.created_at)}
                  </span>
                )}
                {call.duration_seconds != null && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                    <Clock className="h-3.5 w-3.5" />
                    {formatDuration(call.duration_seconds)}
                  </span>
                )}
                {call.phone_number && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                    <Phone className="h-3.5 w-3.5" />
                    {call.phone_number}
                  </span>
                )}
              </div>

              {/* Score + Recommendation */}
              {(call.ai_score != null || recCfg) && (
                <div className="flex items-center gap-5 rounded-xl bg-slate-50 border border-slate-100 px-4 py-4">
                  {call.ai_score != null && <ScoreRing score={call.ai_score} />}
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">AI Assessment</p>
                    {recCfg && (
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${recCfg.bg} ${recCfg.color}`}>
                        {recCfg.label}
                      </span>
                    )}
                    {call.ai_score != null && (
                      <p className="text-xs text-slate-500">
                        Score: <strong>{call.ai_score}/100</strong>
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Summary */}
              {call.summary && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-violet-500" />
                    <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">AI Summary</p>
                  </div>
                  <div className="rounded-xl bg-violet-50 border border-violet-100 px-4 py-3">
                    <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{call.summary}</p>
                  </div>
                </div>
              )}

              {/* Transcript */}
              {call.transcript && call.transcript.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-3.5 w-3.5 text-slate-500" />
                    <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                      Transcript <span className="font-normal text-slate-400 normal-case tracking-normal">({call.transcript.length} turns)</span>
                    </p>
                  </div>
                  <div className="space-y-2 rounded-xl border border-slate-100 p-3 bg-slate-50/50 max-h-80 overflow-y-auto">
                    {call.transcript.map((turn, i) => {
                      const isAI = turn.role === 'assistant'
                      return (
                        <div key={i} className={`flex gap-2.5 ${isAI ? '' : 'flex-row-reverse'}`}>
                          <div className={`h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold mt-0.5
                            ${isAI ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'}`}
                          >
                            {isAI ? 'AI' : 'C'}
                          </div>
                          <div className={`rounded-xl px-3 py-2 text-xs leading-relaxed max-w-[80%]
                            ${isAI ? 'bg-white border border-slate-100 text-slate-700' : 'bg-blue-600 text-white'}`}
                          >
                            {turn.content}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : call.status === 'completed' ? (
                <div className="flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                  <Mic className="h-4 w-4 text-slate-400" />
                  <p className="text-sm text-slate-500">Transcript not available for this call.</p>
                </div>
              ) : null}

              {/* Pending state */}
              {['ringing', 'in_progress', 'queued'].includes(call.status) && (
                <div className="flex items-center gap-3 rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-500 shrink-0" />
                  <p className="text-sm text-blue-700">
                    {call.status === 'ringing' ? 'Ringing candidate…' :
                     call.status === 'in_progress' ? 'Call in progress — transcript will appear when it ends.' :
                     'Call queued…'}
                  </p>
                </div>
              )}

            </div>
          ) : null}
        </div>

      </div>
    </div>
  )
}
