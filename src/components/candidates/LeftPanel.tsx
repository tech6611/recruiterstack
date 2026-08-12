'use client'

import React, { useState } from 'react'
import {
  Mail, Phone, MapPin, Briefcase, ExternalLink, FileText,
  Linkedin, Pencil, Check, X, ChevronDown,
} from 'lucide-react'
import type { Candidate, CandidateTag, Application, HiringRequest } from '@/lib/types/database'
import TagInput from './TagInput'
import { avatarColor, initials } from '@/lib/ui/avatar'
import { useCandidateProfile } from './CandidateProfileContext'

// ── Helpers ───────────────────────────────────────────────────────────────────

const STAGE_COLOR_MAP: Record<string, string> = {
  slate:   'bg-slate-100 text-slate-700',
  blue:    'bg-slate-50 text-slate-700',
  violet:  'bg-slate-50 text-slate-700',
  amber:   'bg-amber-50 text-amber-700',
  emerald: 'bg-emerald-50 text-emerald-700',
  green:   'bg-emerald-50 text-emerald-700',
  red:     'bg-red-50 text-red-700',
  pink:    'bg-slate-50 text-slate-700',
}

// Collapse a long skills list to this many chips until expanded.
const SKILL_LIMIT = 6

type ApplicationWithJobInfo = Application & {
  pipeline_stages: { name: string; color: string } | null
  hiring_requests: Pick<HiringRequest, 'id' | 'position_title' | 'department' | 'ticket_number'> | null
}

interface LeftPanelProps {
  candidate: Candidate
  tags: CandidateTag[]
  applications: ApplicationWithJobInfo[]
}

export default React.memo(function LeftPanel({
  candidate,
  tags,
  applications,
}: LeftPanelProps) {
  const { addTag: onTagAdded, removeTag: onTagRemoved, setCandidate, openEmailDraft, activeApps: ctxActiveApps, selectedAppId, setSelectedAppId } = useCandidateProfile()
  const onLinkedinSaved = (url: string | null) => setCandidate(prev => prev ? { ...prev, linkedin_url: url } : prev)
  const onDraftEmail = () => openEmailDraft(ctxActiveApps[0]?.id ?? null)
  const [editLinkedin, setEditLinkedin] = useState(false)
  const [linkedinInput, setLinkedinInput] = useState('')
  const [skillsExpanded, setSkillsExpanded] = useState(false)

  const saveLinkedin = async () => {
    const val = linkedinInput.trim()
    const normalized = val && !val.startsWith('http') ? `https://${val}` : val || null
    await fetch(`/api/candidates/${candidate.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkedin_url: normalized }),
    })
    setEditLinkedin(false)
    onLinkedinSaved(normalized)
  }

  return (
    <div className="w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-white flex flex-col">
      <div className="p-5 space-y-5">
        {/* Avatar + name */}
        <div className="flex flex-col items-center text-center">
          <div className={`h-16 w-16 rounded-full flex items-center justify-center text-xl font-bold mb-3 ${avatarColor(candidate.name)}`}>
            {initials(candidate.name)}
          </div>
          <h1 className="text-lg font-bold text-slate-900">{candidate.name}</h1>
          {candidate.current_title && (
            <p className="text-sm text-slate-500 mt-0.5">{candidate.current_title}</p>
          )}
        </div>

        {/* Tags */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Tags</p>
          <TagInput
            candidateId={candidate.id}
            tags={tags}
            onTagAdded={onTagAdded}
            onTagRemoved={onTagRemoved}
          />
        </div>

        {/* Contact */}
        <div className="space-y-2.5 text-sm">
          <div className="flex items-center gap-2.5 group">
            <Mail className="h-4 w-4 shrink-0 text-slate-400" />
            <button
              onClick={onDraftEmail}
              className="flex-1 min-w-0 text-left text-emerald-600 hover:text-emerald-800 transition-colors truncate text-sm"
              title="Draft AI email to candidate"
            >
              {candidate.email}
            </button>
            <a
              href={`mailto:${candidate.email}`}
              title="Open in mail client"
              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-slate-600"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          {candidate.phone && (
            <div className="flex items-center gap-2.5 text-slate-600">
              <Phone className="h-4 w-4 shrink-0 text-slate-400" />
              <span>{candidate.phone}</span>
            </div>
          )}
          {candidate.location && (
            <div className="flex items-center gap-2.5 text-slate-600">
              <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
              <span>{candidate.location}</span>
            </div>
          )}
          {candidate.experience_years > 0 && (
            <div className="flex items-center gap-2.5 text-slate-600">
              <Briefcase className="h-4 w-4 shrink-0 text-slate-400" />
              <span>{candidate.experience_years} yrs experience</span>
            </div>
          )}
          {candidate.resume_url && (
            <a
              href={`/api/candidates/${candidate.id}/resume`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 text-slate-600 hover:text-emerald-700 transition-colors"
            >
              <FileText className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="flex items-center gap-1">Resume <ExternalLink className="h-3 w-3" /></span>
            </a>
          )}

          {/* LinkedIn */}
          <div className="flex items-start gap-2.5">
            <Linkedin className="h-4 w-4 shrink-0 text-slate-400 mt-0.5" />
            {editLinkedin ? (
              <div className="flex items-center gap-1 flex-1 min-w-0">
                <input
                  autoFocus
                  value={linkedinInput}
                  onChange={e => setLinkedinInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') saveLinkedin()
                    if (e.key === 'Escape') setEditLinkedin(false)
                  }}
                  placeholder="linkedin.com/in/…"
                  className="flex-1 min-w-0 rounded-lg border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs focus:outline-none focus:border-emerald-400"
                />
                <button onClick={saveLinkedin} aria-label="Save" className="text-emerald-600 hover:text-emerald-800 shrink-0">
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => setEditLinkedin(false)} aria-label="Cancel" className="text-slate-400 hover:text-slate-600 shrink-0">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : candidate.linkedin_url ? (
              <div className="flex items-center gap-1 flex-1 min-w-0 group">
                <a
                  href={candidate.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-emerald-600 hover:text-emerald-800 truncate flex-1"
                >
                  LinkedIn ↗
                </a>
                <button
                  onClick={() => { setLinkedinInput(candidate.linkedin_url ?? ''); setEditLinkedin(true) }}
                  aria-label="Edit LinkedIn URL"
                  className="p-0.5 text-slate-300 hover:text-slate-600 transition-colors shrink-0 opacity-0 group-hover:opacity-100"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setLinkedinInput(''); setEditLinkedin(true) }}
                className="text-xs text-slate-400 hover:text-emerald-600 transition-colors"
              >
                Add LinkedIn…
              </button>
            )}
          </div>
        </div>

        {/* Skills — read-only; a long list folds down to a handful */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Skills</p>
            {candidate.skills.length > SKILL_LIMIT && (
              <button
                onClick={() => setSkillsExpanded(v => !v)}
                aria-label={skillsExpanded ? 'Collapse skills' : 'Show all skills'}
                aria-expanded={skillsExpanded}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${skillsExpanded ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(skillsExpanded ? candidate.skills : candidate.skills.slice(0, SKILL_LIMIT)).map(skill => (
              <span
                key={skill}
                className="rounded-lg bg-white border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600"
              >
                {skill}
              </span>
            ))}
            {!skillsExpanded && candidate.skills.length > SKILL_LIMIT && (
              <button
                onClick={() => setSkillsExpanded(true)}
                className="rounded-lg bg-slate-100 border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-200 transition-colors"
              >
                +{candidate.skills.length - SKILL_LIMIT} more
              </button>
            )}
            {candidate.skills.length === 0 && (
              <p className="text-xs text-slate-400">No skills listed</p>
            )}
          </div>
        </div>

        {/* Considered for */}
        {applications.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-2">
              Considered For{applications.length > 1 ? ' · tap to switch' : ''}
            </p>
            <div className="space-y-2">
              {applications.map(app => {
                const stageStyle = STAGE_COLOR_MAP[app.pipeline_stages?.color ?? 'slate'] ?? STAGE_COLOR_MAP.slate
                const isSel = app.id === selectedAppId
                return (
                  <div
                    key={app.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSel}
                    onClick={() => setSelectedAppId(app.id)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedAppId(app.id) } }}
                    className={`cursor-pointer rounded-xl border p-3 transition-colors ${
                      isSel ? 'border-emerald-400 ring-1 ring-emerald-100 bg-emerald-50/40'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate">
                          {app.hiring_requests?.position_title ?? 'Unknown Role'}
                        </p>
                        {app.hiring_requests?.department && (
                          <p className="text-[10px] text-slate-400 mt-0.5">{app.hiring_requests.department}</p>
                        )}
                      </div>
                      <a
                        href={`/jobs/${app.hiring_request_id ?? app.job_id}`}
                        onClick={e => e.stopPropagation()}
                        className="text-[10px] text-emerald-600 hover:text-emerald-800 shrink-0"
                      >
                        View →
                      </a>
                    </div>
                    <div className="mt-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${stageStyle}`}>
                        {app.pipeline_stages?.name ?? 'Unstaged'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
})
