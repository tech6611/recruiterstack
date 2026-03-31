'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  X,
  ExternalLink,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  Clock,
  Star,
  ArrowRight,
  Loader2,
  User,
  Linkedin,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CandidateDetail {
  id: string
  name: string
  email: string | null
  phone: string | null
  location: string | null
  current_title: string | null
  experience_years: number | null
  skills: string[] | null
  linkedin_url: string | null
  status: string
  ai_summary: string | null
  ai_summary_generated_at: string | null
}

interface ApplicationBrief {
  id: string
  status: string
  stage_name: string | null
  job_title: string | null
  department: string | null
  ai_score: number | null
  ai_recommendation: string | null
  applied_at: string | null
}

interface DrawerData {
  candidate: CandidateDetail
  applications: ApplicationBrief[]
}

interface CandidateDrawerProps {
  candidateId: string | null
  onClose: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7)  return `${days}d ago`
  const wks = Math.floor(days / 7)
  return wks < 52 ? `${wks}w ago` : `${Math.floor(wks / 52)}y ago`
}

const STATUS_STYLES: Record<string, string> = {
  active:       'bg-emerald-100 text-emerald-700',
  hired:        'bg-green-100 text-green-700',
  rejected:     'bg-red-100 text-red-700',
  withdrawn:    'bg-slate-100 text-slate-600',
  interviewing: 'bg-amber-100 text-amber-700',
  offer_extended: 'bg-violet-100 text-violet-700',
  inactive:     'bg-slate-100 text-slate-500',
}

const RECO_STYLES: Record<string, { label: string; cls: string }> = {
  strong_yes: { label: 'Strong Yes', cls: 'bg-emerald-100 text-emerald-700' },
  yes:        { label: 'Yes',        cls: 'bg-green-100 text-green-700' },
  maybe:      { label: 'Maybe',      cls: 'bg-amber-100 text-amber-700' },
  no:         { label: 'No',         cls: 'bg-red-100 text-red-700' },
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CandidateDrawer({ candidateId, onClose }: CandidateDrawerProps) {
  const [data, setData]       = useState<DrawerData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const fetchCandidate = useCallback(async (id: string) => {
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const [candRes, appsRes] = await Promise.all([
        fetch(`/api/candidates/${id}`),
        fetch(`/api/applications?candidate_id=${id}`),
      ])
      if (!candRes.ok) throw new Error('Failed to load candidate')
      const candJson = await candRes.json()
      const appsJson = appsRes.ok ? await appsRes.json() : { data: [] }

      const candidate = candJson.data ?? candJson
      const apps = (appsJson.data ?? []).map((a: Record<string, unknown>) => ({
        id: a.id,
        status: a.status,
        stage_name: (a.pipeline_stages as Record<string, unknown> | null)?.name ?? (a.stage_name as string | null) ?? null,
        job_title: (a.hiring_requests as Record<string, unknown> | null)?.position_title ?? (a.hiring_request as Record<string, unknown> | null)?.position_title ?? (a.job_title as string | null) ?? null,
        department: (a.hiring_requests as Record<string, unknown> | null)?.department ?? (a.hiring_request as Record<string, unknown> | null)?.department ?? null,
        ai_score: a.ai_score ?? null,
        ai_recommendation: a.ai_recommendation ?? null,
        applied_at: a.applied_at ?? a.created_at ?? null,
      }))

      setData({ candidate, applications: apps })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (candidateId) fetchCandidate(candidateId)
  }, [candidateId, fetchCandidate])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  if (!candidateId) return null

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">Quick View</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          )}

          {error && (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-red-500">{error}</p>
              <button onClick={() => fetchCandidate(candidateId)} className="mt-2 text-xs text-blue-500 hover:underline">
                Retry
              </button>
            </div>
          )}

          {data && (
            <div>
              {/* Profile header */}
              <div className="px-5 py-4 border-b border-slate-100">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-600">
                    {data.candidate.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900 truncate">{data.candidate.name}</h3>
                    {data.candidate.current_title && (
                      <p className="text-xs text-slate-500 truncate">{data.candidate.current_title}</p>
                    )}
                    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[data.candidate.status] ?? 'bg-slate-100 text-slate-600'}`}>
                      {data.candidate.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>

                {/* Contact info */}
                <div className="mt-3 space-y-1.5">
                  {data.candidate.email && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Mail className="h-3 w-3 text-slate-400" />
                      <span className="truncate">{data.candidate.email}</span>
                    </div>
                  )}
                  {data.candidate.phone && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Phone className="h-3 w-3 text-slate-400" />
                      <span>{data.candidate.phone}</span>
                    </div>
                  )}
                  {data.candidate.location && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <MapPin className="h-3 w-3 text-slate-400" />
                      <span>{data.candidate.location}</span>
                    </div>
                  )}
                  {data.candidate.experience_years !== null && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Briefcase className="h-3 w-3 text-slate-400" />
                      <span>{data.candidate.experience_years} years experience</span>
                    </div>
                  )}
                  {data.candidate.linkedin_url && (
                    <a
                      href={data.candidate.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-xs text-blue-500 hover:underline"
                    >
                      <Linkedin className="h-3 w-3" />
                      <span>LinkedIn Profile</span>
                    </a>
                  )}
                </div>
              </div>

              {/* Skills */}
              {data.candidate.skills && data.candidate.skills.length > 0 && (
                <div className="px-5 py-3 border-b border-slate-100">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Skills</p>
                  <div className="flex flex-wrap gap-1.5">
                    {data.candidate.skills.slice(0, 8).map(skill => (
                      <span key={skill} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                        {skill}
                      </span>
                    ))}
                    {data.candidate.skills.length > 8 && (
                      <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[10px] text-slate-400">
                        +{data.candidate.skills.length - 8} more
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* AI Summary */}
              {data.candidate.ai_summary && (
                <div className="px-5 py-3 border-b border-slate-100">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">AI Summary</p>
                  <p className="text-xs text-slate-600 leading-relaxed line-clamp-4">
                    {data.candidate.ai_summary}
                  </p>
                </div>
              )}

              {/* Applications */}
              <div className="px-5 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Applications ({data.applications.length})
                </p>
                {data.applications.length === 0 ? (
                  <p className="text-xs text-slate-400">No applications yet.</p>
                ) : (
                  <div className="space-y-2">
                    {data.applications.map(app => (
                      <div
                        key={app.id}
                        className="rounded-lg border border-slate-100 bg-slate-50 p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-slate-800 truncate">{app.job_title ?? 'Unknown role'}</p>
                            {app.department && (
                              <p className="text-[10px] text-slate-400">{app.department}</p>
                            )}
                          </div>
                          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[app.status] ?? 'bg-slate-100 text-slate-600'}`}>
                            {app.status}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-500">
                          {app.stage_name && (
                            <span className="flex items-center gap-1">
                              <ArrowRight className="h-2.5 w-2.5" />
                              {app.stage_name}
                            </span>
                          )}
                          {app.applied_at && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-2.5 w-2.5" />
                              {timeAgo(app.applied_at)}
                            </span>
                          )}
                        </div>
                        {(app.ai_score !== null || app.ai_recommendation) && (
                          <div className="mt-2 flex items-center gap-2">
                            {app.ai_score !== null && (
                              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                                app.ai_score >= 80 ? 'bg-emerald-100 text-emerald-700' :
                                app.ai_score >= 60 ? 'bg-amber-100 text-amber-700' :
                                'bg-slate-100 text-slate-600'
                              }`}>
                                <Star className="inline h-2.5 w-2.5 mr-0.5" />
                                {app.ai_score}/100
                              </span>
                            )}
                            {app.ai_recommendation && RECO_STYLES[app.ai_recommendation] && (
                              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${RECO_STYLES[app.ai_recommendation].cls}`}>
                                {RECO_STYLES[app.ai_recommendation].label}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer — View full profile */}
        {data && (
          <div className="border-t border-slate-200 px-5 py-3">
            <Link
              href={`/candidates/${candidateId}`}
              className="flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 transition-colors"
            >
              <User className="h-3.5 w-3.5" />
              View full profile
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
