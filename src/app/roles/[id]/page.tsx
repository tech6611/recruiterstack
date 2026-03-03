'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Pencil, Trash2, Sparkles, MapPin, Briefcase, DollarSign, Loader2, Copy, Check } from 'lucide-react'
import { SlideOver } from '@/components/ui/SlideOver'
import { RoleForm } from '@/components/roles/RoleForm'
import { MatchCard } from '@/components/matching/MatchCard'
import { StatusBadge } from '@/components/ui/Badge'
import { useSettings } from '@/lib/hooks/useSettings'
import type { Role, MatchWithRelations } from '@/lib/types/database'

export default function RoleDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { settings } = useSettings()

  const [role, setRole] = useState<Role | null>(null)
  const [matches, setMatches] = useState<MatchWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [matching, setMatching] = useState(false)
  const [matchMsg, setMatchMsg] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Email draft state
  const [emailSlideOpen, setEmailSlideOpen] = useState(false)
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [emailCandidate, setEmailCandidate] = useState<string>('')
  const [copiedSubject, setCopiedSubject] = useState(false)
  const [copiedBody, setCopiedBody] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [roleRes, matchRes] = await Promise.all([
      fetch(`/api/roles/${id}`),
      fetch(`/api/matches?role_id=${id}`),
    ])
    if (roleRes.ok) {
      const json = await roleRes.json()
      setRole(json.data)
    }
    if (matchRes.ok) {
      const json = await matchRes.json()
      setMatches(json.data ?? [])
    }
    setLoading(false)
  }, [id])

  useEffect(() => { fetchData() }, [fetchData])

  const runMatching = async () => {
    setMatching(true)
    setMatchMsg(null)
    const res = await fetch('/api/matches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_id: id }),
    })
    const json = await res.json()
    if (res.ok) {
      setMatchMsg(`Scored ${json.count} candidate${json.count !== 1 ? 's' : ''}${json.failed > 0 ? ` (${json.failed} failed)` : ''}.`)
      await fetchData()
    } else {
      setMatchMsg(json.error ?? 'Matching failed.')
    }
    setMatching(false)
  }

  const handleDraftEmail = async (match: MatchWithRelations) => {
    setEmailSubject('')
    setEmailBody('')
    setEmailCandidate(match.candidates.name)
    setEmailSlideOpen(true)
    setEmailLoading(true)

    const res = await fetch('/api/email/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candidate_id: match.candidate_id,
        role_id: match.role_id,
        company_name: settings.company_name || undefined,
        recruiter_name: settings.recruiter_name || undefined,
        recruiter_title: settings.recruiter_title || undefined,
        recruiter_email: settings.recruiter_email || undefined,
      }),
    })
    const json = await res.json()
    setEmailLoading(false)

    if (res.ok) {
      setEmailSubject(json.subject ?? '')
      setEmailBody(json.body ?? '')
    } else {
      setEmailBody(json.error ?? 'Failed to generate email.')
    }
  }

  const copyText = (text: string, type: 'subject' | 'body') => {
    navigator.clipboard.writeText(text)
    if (type === 'subject') {
      setCopiedSubject(true)
      setTimeout(() => setCopiedSubject(false), 2000)
    } else {
      setCopiedBody(true)
      setTimeout(() => setCopiedBody(false), 2000)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Delete "${role?.job_title}"? This cannot be undone.`)) return
    setDeleting(true)
    const res = await fetch(`/api/roles/${id}`, { method: 'DELETE' })
    if (res.ok) {
      router.push('/roles')
    } else {
      alert('Failed to delete role.')
      setDeleting(false)
    }
  }

  const formatSalary = (min: number | null, max: number | null) => {
    if (!min && !max) return null
    const fmt = (n: number) => n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`
    if (min && max) return `${fmt(min)} – ${fmt(max)}`
    if (min) return `From ${fmt(min)}`
    return `Up to ${fmt(max!)}`
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Loading…</div>
  }
  if (!role) {
    return <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Role not found.</div>
  }

  const salary = formatSalary(role.salary_min, role.salary_max)

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

      {/* Role card */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900">{role.job_title}</h1>
              <StatusBadge status={role.status} variant="role" />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500 mt-2">
              {role.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />{role.location}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Briefcase className="h-3.5 w-3.5" />{role.min_experience}+ yrs experience
              </span>
              {salary && (
                <span className="flex items-center gap-1">
                  <DollarSign className="h-3.5 w-3.5" />{salary}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setEditOpen(true)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors" title="Edit">
              <Pencil className="h-4 w-4" />
            </button>
            <button onClick={handleDelete} disabled={deleting} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors" title="Delete">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {role.required_skills.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Required Skills</p>
            <div className="flex flex-wrap gap-1.5">
              {role.required_skills.map(skill => (
                <span key={skill} className="inline-block rounded-md bg-blue-50 px-2.5 py-0.5 text-xs text-blue-700 font-medium">
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* AI Match section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">
            AI Candidate Matches
            {matches.length > 0 && <span className="ml-2 text-sm font-normal text-slate-400">{matches.length} scored</span>}
          </h2>
          <button
            onClick={runMatching}
            disabled={matching}
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60 transition-colors shadow-sm"
          >
            {matching ? <><Loader2 className="h-4 w-4 animate-spin" />Running…</> : <><Sparkles className="h-4 w-4" />Run AI Match</>}
          </button>
        </div>

        {matchMsg && (
          <div className="rounded-xl bg-violet-50 border border-violet-200 px-4 py-2.5 text-sm text-violet-700">
            {matchMsg}
          </div>
        )}

        {matches.length === 0 && !matching ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center">
            <Sparkles className="h-8 w-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400">
              Click <span className="font-semibold">Run AI Match</span> to score all candidates against this role.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {matches.map(match => (
              <MatchCard key={match.id} match={match} showCandidate onDraftEmail={handleDraftEmail} />
            ))}
          </div>
        )}
      </div>

      {/* Edit slide-over */}
      <SlideOver open={editOpen} onClose={() => setEditOpen(false)} title="Edit Role">
        <RoleForm role={role} onSuccess={() => { setEditOpen(false); fetchData() }} />
      </SlideOver>

      {/* Email draft slide-over */}
      <SlideOver
        open={emailSlideOpen}
        onClose={() => setEmailSlideOpen(false)}
        title={`Outreach Email — ${emailCandidate}`}
      >
        {emailLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
            <Loader2 className="h-7 w-7 animate-spin text-blue-400" />
            <p className="text-sm">Drafting personalized email…</p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Subject */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Subject</label>
                <button
                  onClick={() => copyText(emailSubject, 'subject')}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 transition-colors"
                >
                  {copiedSubject ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedSubject ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 font-medium">
                {emailSubject}
              </div>
            </div>

            {/* Body */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Body</label>
                <button
                  onClick={() => copyText(emailBody, 'body')}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 transition-colors"
                >
                  {copiedBody ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedBody ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                {emailBody}
              </div>
            </div>

            <p className="text-xs text-slate-400 text-center">
              Review and edit before sending — AI-generated drafts may need personalisation.
            </p>
          </div>
        )}
      </SlideOver>
    </div>
  )
}
