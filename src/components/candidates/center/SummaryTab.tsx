'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Wand2, Loader2, RefreshCw, FileText, ExternalLink, TrendingUp, TrendingDown, Phone, ChevronRight, ClipboardList } from 'lucide-react'
import type { Candidate, Application, AiRecommendation, HiringRequest } from '@/lib/types/database'
import VoiceCallDetailModal from '../VoiceCallDetailModal'
import { ScoreRing } from '@/components/ui/ScoreRing'
import { Panel } from '@/components/ui/card'
import { useCandidateProfile } from '../CandidateProfileContext'
import { resumeStoragePath, resumeExt, OFFICE_EXTENSIONS } from '@/lib/storage/resume'

// PDFs and plain text render natively in a browser <iframe>. Word/ODF docs can't,
// but the resume API converts those to a faithful PDF (LibreOffice) before serving,
// so they preview too. Anything else falls back to the Download card.
function resumeIsPreviewable(resumeUrl: string | null | undefined): boolean {
  if (!resumeUrl) return false
  const path = resumeStoragePath(resumeUrl)
  if (!path) return true // external link (e.g. Google Drive) — let it try to embed
  const ext = resumeExt(path)
  return ext === 'pdf' || ext === 'txt' || OFFICE_EXTENSIONS.has(ext)
}

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


// Render one screening answer in plain text (mirrors FormsTab).
function fmtAnswer(value: unknown): string {
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—'
  const v = (value ?? '').toString().trim()
  return v.length ? v : '—'
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

  // Awaitable summary generation: POST, and if the server processes in the
  // background (202) poll until it lands. Sets `summary`; throws on failure.
  const runSummary = useCallback(async (): Promise<void> => {
    const res = await fetch(`/api/candidates/${candidate.id}/ai-summary`, { method: 'POST' })
    const json = await res.json().catch(() => null)

    if (res.status === 202) {
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 2000))
        if (!mountedRef.current) return
        const poll = await fetch(`/api/candidates/${candidate.id}/ai-summary`)
          .then(r => (r.ok ? r.json() : null))
          .catch(() => null)
        if (poll?.data?.summary) { if (mountedRef.current) setSummary(poll.data.summary); return }
      }
      throw new Error('Taking longer than expected. Please try again later.')
    }

    if (!res.ok) throw new Error(json?.error ?? 'Generation failed')
    if (json?.data?.summary && mountedRef.current) setSummary(json.data.summary)
  }, [candidate.id])

  // Regenerate the whole AI Assessment: (re)score the selected application AND
  // refresh the summary, then reload so the new score shows on the card. Scoring
  // is best-effort — a scoring hiccup shouldn't block the summary.
  const regenerateAssessment = async () => {
    const app = applications[0] ?? null
    setGenerating(true); setGenError('')
    try {
      if (app?.job_id) {
        try { await fetch(`/api/applications/${app.id}/score`, { method: 'POST' }) } catch { /* best-effort */ }
        await reload()   // surface the fresh score right away, before the summary
      }
      await runSummary()
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      if (mountedRef.current) setGenerating(false)
    }
  }

  // The scored application in view — its score sits beside the candidate summary
  // in one "AI Assessment" card.
  const scoredApp = applications.find(a => a.ai_score !== null && a.ai_scored_at) ?? null
  const rec = scoredApp?.ai_recommendation ? REC_CONFIG[scoredApp.ai_recommendation] : null

  // Selected application's screening answers (for the Form Answers card, item 1).
  const primaryApp = applications[0] ?? null
  const answers = primaryApp?.screening_answers ?? []

  // Shared inner content for the AI Assessment card.
  const scoreContent = scoredApp ? (
    <div className="space-y-3">
      <div className="flex items-start gap-4">
        <ScoreRing score={scoredApp.ai_score!} />
        <div className="min-w-0 flex-1">
          {rec && (
            <span className={`mb-3 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${rec.bg} ${rec.color}`}>
              {rec.label}
            </span>
          )}
          {scoredApp.ai_criterion_scores && scoredApp.ai_criterion_scores.length > 0 && (
            <div className="space-y-1.5">
              {scoredApp.ai_criterion_scores.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <p className="w-28 shrink-0 truncate text-[10px] font-medium text-slate-700">{c.name}</p>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200/70">
                    <div className="h-full rounded-full bg-slate-600" style={{ width: `${(c.rating / 4) * 100}%` }} />
                  </div>
                  <span className="w-8 text-right text-[10px] font-medium text-slate-500">{c.rating}/4</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {scoredApp.ai_strengths?.length > 0 && (
          <div>
            <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
              <TrendingUp className="h-2.5 w-2.5" /> Strengths
            </p>
            <ul className="space-y-0.5">
              {scoredApp.ai_strengths.slice(0, 3).map((s, i) => (
                <li key={i} className="text-[10px] leading-relaxed text-slate-700">• {s}</li>
              ))}
            </ul>
          </div>
        )}
        {scoredApp.ai_gaps?.length > 0 && (
          <div>
            <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold text-amber-700">
              <TrendingDown className="h-2.5 w-2.5" /> Gaps
            </p>
            <ul className="space-y-0.5">
              {scoredApp.ai_gaps.slice(0, 3).map((g, i) => (
                <li key={i} className="text-[10px] leading-relaxed text-slate-700">• {g}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  ) : (
    <div className="flex h-full flex-col items-center justify-center py-8 text-center">
      <TrendingUp className="mb-2 h-7 w-7 text-slate-200" />
      <p className="text-sm text-slate-400">Not scored for this job yet</p>
      <p className="mt-1 text-xs text-slate-300">Scoring runs automatically when a candidate applies.</p>
    </div>
  )

  const summaryContent = (
    <>
      {genError && <p className="text-sm text-red-600">{genError}</p>}
      {summary ? (
        <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{summary}</p>
      ) : generating ? (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…
        </div>
      ) : (
        <p className="text-sm italic text-slate-400">Click &quot;Regenerate&quot; to build the AI assessment for this candidate.</p>
      )}
    </>
  )

  // Score sits in a light neutral panel on the left; summary on the right.
  const tintedScore = (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">{scoreContent}</div>
  )
  const summaryHeader = (
    <div className="mb-3 flex items-center gap-2 border-b border-slate-200 pb-1.5">
      <Wand2 className="h-4 w-4 text-emerald-600" />
      <span className="text-sm font-bold text-slate-800">Summary</span>
    </div>
  )

  const assessmentBody = (
    <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
      {tintedScore}
      <div className="p-1">{summaryHeader}{summaryContent}</div>
    </div>
  )

  return (
    <>
    <div className="space-y-4 p-5">

      {/* ── AI Assessment — score + summary in one card ─────────────────────── */}
      <Panel
        icon={TrendingUp}
        title="AI Assessment"
        meta={scoredApp?.ai_scored_at
          ? `· Scored ${new Date(scoredApp.ai_scored_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
          : undefined}
        action={
          <button
            onClick={regenerateAssessment}
            disabled={generating}
            className="flex items-center gap-1.5 rounded-xl bg-[#221b14] px-3.5 py-1.5 text-xs font-semibold text-[#f6efe3] hover:bg-[#34291e] disabled:opacity-60 transition-colors"
          >
            {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : summary ? <RefreshCw className="h-3 w-3" /> : <Wand2 className="h-3 w-3" />}
            {generating ? 'Scoring &amp; summarizing…' : summary ? 'Regenerate' : 'Generate Assessment'}
          </button>
        }
      >
        {assessmentBody}
      </Panel>

      {/* ── Application Answers — the candidate's form responses (item 1) ────── */}
      {answers.length > 0 && (
        <Panel
          icon={ClipboardList}
          title="Application Answers"
          meta={primaryApp?.hiring_requests?.position_title ? `· ${primaryApp.hiring_requests.position_title}` : undefined}
        >
          <div className="divide-y divide-slate-100 px-5">
            {answers.map((a, i) => (
              <div key={a.field_id || i} className="py-3 first:pt-4 last:pb-4">
                {/* Question is the prominent label; answer follows, lighter. */}
                <p className="text-sm font-semibold leading-snug text-slate-800">{a.label}</p>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-600">{fmtAnswer(a.value)}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}

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
            <a href={`/api/candidates/${candidate.id}/resume?download=1`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-800">
              <ExternalLink className="h-3 w-3" /> Download
            </a>
          </div>
        ) : undefined}
      >
        <div className="p-2">
          {!candidate.resume_url ? (
            <div className="flex flex-col items-center py-10 text-center">
              <FileText className="mb-2 h-8 w-8 text-slate-200" />
              <p className="text-sm text-slate-400">No resume uploaded</p>
            </div>
          ) : resumeIsPreviewable(candidate.resume_url) ? (
            <iframe
              src={`/api/candidates/${candidate.id}/resume`}
              className="h-[500px] w-full rounded-xl border border-slate-100"
              title="Resume"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <FileText className="h-8 w-8 text-slate-300" />
              <p className="text-sm text-slate-500">This CV is a Word document, which can&apos;t be previewed in the browser.</p>
              <a
                href={`/api/candidates/${candidate.id}/resume?download=1`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Download CV
              </a>
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
