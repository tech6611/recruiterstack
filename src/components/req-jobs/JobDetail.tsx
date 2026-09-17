'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Archive, ArchiveRestore, Send, Globe, Ban, X, Plus, Trash2, Pencil, LayoutGrid, LayoutTemplate, PauseCircle, PlayCircle, Copy, AlertTriangle, CheckCircle2, CircleSlash } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ApprovalProgress } from '@/components/approvals/ApprovalProgress'
import { AuditLogTab } from '@/components/approvals/AuditLogTab'
import { LinkOpeningDialog } from '@/components/req-jobs/LinkOpeningDialog'
import { CloseJobDialog } from '@/components/req-jobs/CloseJobDialog'
import { SaveAsTemplateDialog } from '@/components/req-jobs/SaveAsTemplateDialog'
import { PostingsTab } from '@/components/req-jobs/PostingsTab'
import { ScreeningTab } from '@/components/req-jobs/ScreeningTab'
import { ScoringTab } from '@/components/req-jobs/ScoringTab'
import { IcpEditor } from '@/components/req-jobs/IcpEditor'
import { SourcingTab } from '@/components/req-jobs/SourcingTab'
import { JobPostReview } from '@/components/req-jobs/JobPostReview'
import { ScoringRubricSummary } from '@/components/req-jobs/ScoringRubricSummary'
import { InterviewPlanTab } from '@/components/req-jobs/InterviewPlanTab'
import { readScoringCriteria } from '@/lib/scoring'
import { summarizeSeats, JOB_CLOSE_REASONS, type JobCloseReason } from '@/lib/openings/seat-math'
import { JobTeamRoster } from '@/components/req-jobs/JobTeamRoster'
import { cn } from '@/lib/utils'
import { RichText } from '@/components/RichText'
import { RichTextEditor, isHtmlEmpty } from '@/components/RichTextEditor'
import type { Job, Department, Opening, JobStatus, OpeningStatus, Location as LocationRow } from '@/lib/types/requisitions'

/** Human-readable requisition number prefix (org setting `opening_number_prefix`; "REQ" until it's surfaced). */
const OPENING_NUMBER_PREFIX = 'REQ'

/** "USD 120,000–150,000" for a comp range; null when either end is missing. */
function formatComp(c: { comp_min?: number | null; comp_max?: number | null; comp_currency?: string | null }): string | null {
  if (c.comp_min === null || c.comp_min === undefined || c.comp_max === null || c.comp_max === undefined) return null
  return `${c.comp_currency ?? ''} ${Number(c.comp_min).toLocaleString()}–${Number(c.comp_max).toLocaleString()}`.trim()
}

const STATUS_BADGE: Record<JobStatus, string> = {
  draft:            'bg-slate-100 text-slate-700',
  pending_approval: 'bg-amber-100 text-amber-800',
  approved:         'bg-emerald-100 text-emerald-800',
  open:             'bg-slate-100 text-slate-800',
  paused:           'bg-sky-100 text-sky-800',
  withdrawn:        'bg-rose-100 text-rose-800',
  closed:           'bg-slate-200 text-slate-600',
  archived:         'bg-slate-100 text-slate-400',
}

const OPENING_BADGE: Record<OpeningStatus, string> = {
  draft:            'bg-slate-100 text-slate-700',
  pending_approval: 'bg-amber-100 text-amber-800',
  approved:         'bg-emerald-100 text-emerald-800',
  open:             'bg-amber-100 text-amber-800',    // seat is live: a published job is filling it
  filled:           'bg-emerald-100 text-emerald-800', // seat taken by a hire
  closed:           'bg-slate-200 text-slate-600',
  archived:         'bg-slate-100 text-slate-400',
}

// Job close reasons are stored as codes; show the human label in the header.
const JOB_CLOSE_REASON_LABEL: Record<string, string> = Object.fromEntries(
  JOB_CLOSE_REASONS.map(r => [r.value, r.label]),
)

interface Props {
  job:             Job
  department:      Pick<Department, 'id' | 'name'> | null
  departments:     Pick<Department, 'id' | 'name'>[]
  /** Org locations — powers the Location picker and resolves job.location_id to a name. */
  locations?:      Pick<LocationRow, 'id' | 'name'>[]
  linkedOpenings:  Pick<Opening, 'id' | 'title' | 'status' | 'comp_min' | 'comp_max' | 'comp_currency' | 'target_start_date' | 'number'>[]
}

type Tab = 'overview' | 'postings' | 'screening' | 'scoring' | 'source' | 'plan' | 'audit'

const TAB_LABELS: Record<Tab, string> = {
  overview:  'Overview',
  postings:  'Postings',
  screening: 'Application form',
  scoring:   'Scoring',
  source:    'Source',
  plan:      'Interview plan',
  audit:     'Audit log',
}

function initForm(job: Job) {
  const intake = readIntake(job)
  return {
    title:             job.title ?? '',
    department_id:     job.department_id ?? '',
    description:       descriptionToEditorHtml(job.description),
    confidentiality:   job.confidentiality ?? 'public',
    // Job-level location + comp (migration 143). Inherited from the requisition
    // at creation; editable at any status — they're not approval-locked identity.
    location_id:       job.location_id ?? '',
    comp_min:          job.comp_min !== null && job.comp_min !== undefined ? String(job.comp_min) : '',
    comp_max:          job.comp_max !== null && job.comp_max !== undefined ? String(job.comp_max) : '',
    comp_currency:     job.comp_currency ?? '',
    // Full JD / intake fields — rich HTML so bullets & formatting survive.
    level:             intake.level ?? '',
    employment_type:   intake.employment_type ?? '',
    location:          intake.location ?? '',
    work_model:        intake.work_model ?? '',
    show_salary:       intake.show_salary,
    team_context:      intake.team_context ?? '',
    key_requirements:  intake.key_requirements ?? '',
    nice_to_have:      intake.nice_to_have ?? '',
    notes:             intake.notes ?? '',
    target_start_date: intake.target_start_date ?? '',
  }
}

// Employment-type choices mirror the intake form so the edit dropdown offers the
// same options.
const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship', 'Temporary']

// Levels mirror the New Job create form (jobs/page.tsx) so the edit dropdown
// offers the same choices.
const LEVEL_OPTIONS = ['Intern', 'Junior', 'Mid-level', 'Senior', 'Lead', 'Staff', 'Principal', 'Director', 'VP']

// Work arrangement choices mirror the intake form.
const WORK_MODELS = [
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite', label: 'On-site' },
] as const
const WORK_MODEL_LABEL: Record<string, string> = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' }

// Intake fields are collected at job creation and stashed in custom_fields.intake.
function readIntake(job: Job) {
  const i = (job.custom_fields?.intake ?? {}) as Record<string, unknown>
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null)
  return {
    team_context:      text(i.team_context),
    key_requirements:  text(i.key_requirements),
    nice_to_have:      text(i.nice_to_have),
    level:             text(i.level),
    employment_type:   text(i.employment_type),
    location:          text(i.location),
    // remote_ok is a genuine tri-state: true / false / not-answered (null).
    remote_ok:         typeof i.remote_ok === 'boolean' ? i.remote_ok : null,
    // work_model is the newer tri-state; fall back to the legacy remote_ok boolean.
    work_model:        (i.work_model === 'remote' || i.work_model === 'hybrid' || i.work_model === 'onsite')
                         ? i.work_model
                         : typeof i.remote_ok === 'boolean' ? (i.remote_ok ? 'remote' : 'onsite') : '',
    // Whether to show the requisition salary range on the public application
    // page. Default ON (undefined → true); recruiters flip it off per role.
    show_salary:       typeof i.show_salary === 'boolean' ? i.show_salary : true,
    notes:             text(i.notes),
    target_start_date: text(i.target_start_date),
    hm_name:           text(i.hm_name),
    hm_email:          text(i.hm_email),
    hm_slack:          text(i.hm_slack),
    target_companies: Array.isArray(i.target_companies)
      ? (i.target_companies as unknown[]).filter((t): t is string => typeof t === 'string' && t.trim() !== '')
      : [],
  }
}

// Legacy job descriptions were stored as plain text (newlines, no markup). The
// rich editor treats its seed value as HTML, so feeding raw plain text would
// collapse the line breaks. Detect plain text and convert blank-line-separated
// blocks into <p> paragraphs (single newlines → <br>) so existing JDs load with
// their structure intact. Anything that already contains HTML is passed through.
const HTML_TAG = /<\/?[a-z][\s\S]*>/i
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function descriptionToEditorHtml(value: string | null | undefined): string {
  if (!value) return ''
  if (HTML_TAG.test(value)) return value
  return value
    .split(/\n{2,}/)
    .map(block => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

function IntakeSection({ title, body }: { title: string; body: string | null }) {
  if (!body) return null
  return (
    <div className="mt-5 pt-4 border-t border-slate-100">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">{title}</dt>
      <RichText html={body} />
    </div>
  )
}

export function JobDetail({ job: initialJob, department, departments, locations = [], linkedOpenings }: Props) {
  const router = useRouter()
  // The job lives in local state so status-driven UI (the title badge and the
  // action buttons) can update live without a full page refresh. The server prop
  // only seeds the initial value; after mount, `refreshJob()` is the source of
  // truth. We don't lean on router.refresh() alone because the server read can lag
  // a just-committed status change (e.g. an approval that just landed).
  const [job, setJob]                 = useState<Job>(initialJob)
  const [tab, setTab]                 = useState<Tab>('overview')
  const [hmKey, setHmKey]             = useState(0)  // bump to re-fetch the team roster (HM / requisition changes)
  const [submitting, setSubmitting]   = useState(false)
  const [publishing, setPublishing]   = useState(false)
  const [pausing, setPausing]         = useState(false)
  const [resuming, setResuming]       = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const [cloning, setCloning]         = useState(false)
  const [archiving, setArchiving]     = useState(false)
  const [restoring, setRestoring]     = useState(false)
  // Close-job dialog: null = hidden, otherwise the reason to pre-select.
  const [closeReason, setCloseReason] = useState<JobCloseReason | null>(null)
  const [linkOpen, setLinkOpen]       = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [editing, setEditing]         = useState(false)
  const [saving, setSaving]           = useState(false)
  const [form, setForm]               = useState(initForm(job))
  // Soft pre-publish nudge: flags setup a recruiter usually wants decided before a
  // job goes live (screening questions, a scoring rubric) — guides them there
  // without blocking. Null = nothing missing / not shown.
  const [nudge, setNudge] = useState<{ screening: boolean; rubric: boolean } | null>(null)
  // Job-actions dropdown (Edit / Pause / Withdraw / New version / Archive …),
  // opened by the pencil button next to the status tag.
  const [showActions, setShowActions] = useState(false)

  const intake = readIntake(job)
  // Location: the job's own location_id (migration 143) resolved to a name, falling
  // back to the free-text intake location for jobs created before the column existed.
  const jobLocationName = (job.location_id && locations.find(l => l.id === job.location_id)?.name) || intake.location || null
  // Compensation: the job's own range; flagged "from requisition" when it still
  // matches the first linked requisition's range (i.e. inherited, not overridden).
  const jobComp   = formatComp(job)
  const firstReq  = linkedOpenings[0]
  const compFromReq = !!jobComp && !!firstReq && formatComp(firstReq) === jobComp
  // Headcount seats this job fills — one per linked requisition (archived ones
  // don't count). Drives the "n/m seats filled" chip and the all-filled nudge.
  const seats = summarizeSeats(linkedOpenings.map(o => o.status))
  // Closed jobs carry when/why they ended; the columns are newer than the Job
  // type so read them loosely.
  const closedInfo = job as { closed_at?: string | null; close_reason?: string | null }

  // Re-read the job from the server and update local state. Called after any action
  // that changes status (approve, submit, publish, withdraw) so the badge + buttons
  // reflect reality immediately, and on window focus to catch changes made elsewhere
  // (e.g. another approver acting) — the same "fetch fresh on view" model the audit
  // log already uses.
  const refreshJob = useCallback(async () => {
    try {
      const res = await fetch(`/api/req-jobs/${initialJob.id}`)
      if (!res.ok) return
      const { data } = await res.json()
      if (data) setJob(data as Job)
    } catch { /* keep last-known status on a transient failure */ }
  }, [initialJob.id])

  useEffect(() => {
    const onFocus = () => { refreshJob() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refreshJob])

  const canSubmit  = job.status === 'draft'
  // Editing is available while the job is active. In Draft everything is editable;
  // once it leaves Draft the *identity* fields (title/department/confidentiality,
  // plus hiring manager & location) lock, but the JD body and the requirements /
  // nice-to-have / level content stay editable so recruiters can keep refining.
  // (Phase 2 will lock the approved substance on open/paused jobs.) Withdrawn is
  // terminal/dead — no longer editable.
  const canEdit       = ['draft', 'approved', 'open', 'paused'].includes(job.status)
  const lockIdentity  = job.status !== 'draft'
  // Once live the job has a candidate pipeline; offer a jump to its Kanban so the
  // detail view (JD / approvals / audit log) and the pipeline stay cross-linked.
  const isLive     = ['open', 'paused', 'withdrawn', 'posted', 'closed', 'filled'].includes(job.status)
  // First publish only ('approved'). A frozen live job comes back via Resume, not
  // Publish; a withdrawn job is terminal and cannot be re-published.
  const canPublish = job.status === 'approved' &&
    linkedOpenings.some(o => ['approved', 'open', 'filled'].includes(o.status))
  const canPause    = job.status === 'open'    // reversible freeze
  const canResume   = job.status === 'paused'  // un-freeze, same link
  const canWithdraw = job.status === 'open' || job.status === 'paused'  // terminal kill
  // Normal end-of-life: seats filled, budget pulled, etc. Postings come down
  // and the public link stops; candidates stay in the pipeline.
  const canClose    = ['open', 'paused', 'approved'].includes(job.status)
  // An archived job can come back (a formerly open one returns paused).
  const canRestore  = job.status === 'archived'
  // Every seat is taken but the job is still live — nudge to close it.
  const allSeatsFilled =
    (job.status === 'open' || job.status === 'paused') && seats.total > 0 && seats.remaining === 0
  // Post-approval states carry a signed-off baseline: wording edits to the JD /
  // requirements re-trigger approval (formatting is free). Surfaced as a banner.
  const lockedSubstance = ['approved', 'open', 'paused'].includes(job.status)
  // Materially different role → spin off a fresh draft rather than rewrite this one.
  const canNewVersion = ['approved', 'open', 'paused', 'withdrawn'].includes(job.status)
  // Snapshot a settled job (past approval) into a reusable job template.
  const canSaveTemplate = ['approved', 'open', 'paused', 'closed'].includes(job.status)

  async function save() {
    if (!form.title.trim()) { toast.error('Title is required'); return }
    setSaving(true)
    // custom_fields merges SHALLOW at the top level, so the whole `intake` bag is
    // replaced — spread the existing intake first to keep target_companies / hiring
    // manager (and anything else) intact, then override just the editable fields.
    // Editor fields store rich HTML; empty editors collapse to '' (not "<p></p>").
    const existingIntake = (job.custom_fields?.intake ?? {}) as Record<string, unknown>
    const payload: Record<string, unknown> = {
      // JD body is editable at any status (server allows it). Stored as rich HTML.
      description: isHtmlEmpty(form.description) ? null : form.description,
      custom_fields: {
        intake: {
          ...existingIntake,
          level:             form.level.trim(),
          employment_type:   form.employment_type.trim(),
          location:          form.location.trim(),
          // Store the tri-state work model and keep the legacy boolean in sync.
          work_model:        form.work_model || null,
          remote_ok:         form.work_model ? form.work_model === 'remote' : null,
          show_salary:       form.show_salary,
          team_context:      isHtmlEmpty(form.team_context)     ? '' : form.team_context,
          key_requirements:  isHtmlEmpty(form.key_requirements) ? '' : form.key_requirements,
          nice_to_have:      isHtmlEmpty(form.nice_to_have)     ? '' : form.nice_to_have,
          notes:             form.notes.trim(),
          target_start_date: form.target_start_date.trim(),
        },
      },
    }
    // Location + comp are NOT identity fields — the server accepts them at any status.
    payload.location_id   = form.location_id || null
    payload.comp_min      = form.comp_min !== '' ? Number(form.comp_min) : null
    payload.comp_max      = form.comp_max !== '' ? Number(form.comp_max) : null
    payload.comp_currency = form.comp_currency.trim() ? form.comp_currency.trim().toUpperCase() : null
    // Identity fields are only sent while the job is still a Draft; once approved
    // the server rejects them (409) so we don't even include them.
    if (!lockIdentity) {
      payload.title           = form.title.trim()
      payload.department_id   = form.department_id || null
      payload.confidentiality = form.confidentiality
    }
    const res = await fetch(`/api/req-jobs/${job.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(body.error ?? 'Save failed'); return }
    // The server reports whether this edit changed the approved substance and
    // had to re-run approval. Reflect that back so the user isn't surprised that
    // a "save" quietly pulled the live job off the market.
    const r = body.reapproval
    const fields = (r?.changed_fields ?? []).join(', ')
    if (r?.reapproval && r.auto_approved) {
      toast.success(`Saved. Changes to ${fields} were re-approved automatically.`)
    } else if (r?.reapproval) {
      toast.warning(`Saved & sent for re-approval — ${fields} differ from what was approved. The job is paused from new applications until your approver signs off.`)
    } else if (r?.reapproval_skipped) {
      toast.warning(`Saved. ${fields} changed, but no approval chain is configured — applied without re-approval.`)
    } else {
      toast.success('Saved')
    }
    setEditing(false)
    refreshJob()
    router.refresh()
  }

  async function newVersion() {
    // A job — including a new version — can only exist against an approved
    // requisition. Reuse the requisition this job is already linked to (it has
    // passed approval). If somehow none has, there's nothing approved to clone
    // into, so we stop with a clear message rather than create an orphan.
    const approvedOpening = linkedOpenings.find(o => ['approved', 'open', 'filled'].includes(o.status))
    if (!approvedOpening) {
      toast.error('A new version needs an approved requisition to clone into, but this job has none linked. Link an approved requisition first.')
      return
    }
    if (!confirm(
      'Create a new draft version of this job?\n\nIt copies the JD and intake content into a fresh draft you can change freely, then re-submit for approval. It stays linked to the same approved requisition. The current job is left exactly as it is.'
    )) return
    setCloning(true)
    const res = await fetch(`/api/req-jobs/${job.id}/clone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opening_id: approvedOpening.id }),
    })
    setCloning(false)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(body.error ?? 'Could not create new version'); return }
    toast.success('New draft version created.')
    router.push(`/req-jobs/${body.data.id}`)
  }

  async function submitForApproval() {
    setSubmitting(true)
    const res = await fetch(`/api/req-jobs/${job.id}/submit`, { method: 'POST' })
    setSubmitting(false)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(body.error ?? 'Submit failed'); return }
    toast.success(body.status === 'approved' ? 'Auto-approved.' : 'Submitted for approval.')
    refreshJob()
    router.refresh()
  }

  // Publish gate: nudge if the job is missing setup a recruiter usually wants
  // before go-live — screening questions and/or a scoring rubric. Non-blocking;
  // a failed check never stops publishing.
  async function publish() {
    setPublishing(true)
    let noScreening = false
    try {
      const r = await fetch(`/api/jobs/${job.id}/screening`)
      const j = await r.json()
      noScreening = (j.data?.fields ?? []).length === 0
    } catch { /* check failed — treat as present, don't block */ }
    const noRubric = readScoringCriteria(job.custom_fields).length === 0
    setPublishing(false)
    if (noScreening || noRubric) {
      setNudge({ screening: noScreening, rubric: noRubric })
      return
    }
    doPublish()
  }

  async function doPublish() {
    setNudge(null)
    setPublishing(true)
    const res = await fetch(`/api/req-jobs/${job.id}/publish`, { method: 'POST' })
    setPublishing(false)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(body.error ?? 'Publish failed'); return }
    toast.success('Pipeline is now open.')
    refreshJob()
    router.refresh()
  }

  async function pause() {
    setPausing(true)
    const res = await fetch(`/api/req-jobs/${job.id}/pause`, { method: 'POST' })
    setPausing(false)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(body.error ?? 'Pause failed'); return }
    toast.success('Job paused. The application link is frozen — resume any time.')
    refreshJob()
    router.refresh()
  }

  async function resume() {
    setResuming(true)
    const res = await fetch(`/api/req-jobs/${job.id}/resume`, { method: 'POST' })
    setResuming(false)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(body.error ?? 'Resume failed'); return }
    toast.success('Job resumed. The original application link is live again.')
    refreshJob()
    router.refresh()
  }

  async function withdraw() {
    if (!confirm(
      'Withdraw this job for good?\n\nThis permanently kills the public application link — it cannot be revived. ' +
      'To only temporarily stop applications, use Pause instead.'
    )) return
    setWithdrawing(true)
    const res = await fetch(`/api/req-jobs/${job.id}/withdraw`, { method: 'POST' })
    setWithdrawing(false)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(body.error ?? 'Withdraw failed'); return }
    toast.success('Job withdrawn. The application link is permanently closed.')
    refreshJob()
    router.refresh()
  }

  async function archive() {
    if (!confirm('Archive this pipeline?')) return
    setArchiving(true)
    const res = await fetch(`/api/req-jobs/${job.id}`, { method: 'DELETE' })
    setArchiving(false)
    if (!res.ok) { toast.error('Archive failed'); return }
    toast.success('Archived')
    router.push('/jobs')
  }

  async function restore() {
    setRestoring(true)
    const res = await fetch(`/api/req-jobs/${job.id}/unarchive`, { method: 'POST' })
    setRestoring(false)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(body.error ?? 'Restore failed'); return }
    toast.success(
      body.status === 'paused'
        ? 'Job restored. It comes back paused — resume it when you are ready to take applications again.'
        : 'Job restored.',
    )
    refreshJob()
    router.refresh()
  }

  async function unlinkOpening(openingId: string) {
    if (!confirm('Unlink this requisition from the pipeline?')) return
    const res = await fetch(`/api/req-jobs/${job.id}/unlink-opening`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opening_id: openingId }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast.error(body.error ?? 'Unlink failed')
      return
    }
    toast.success('Unlinked')
    setHmKey(k => k + 1)
    router.refresh()
  }

  const hasActions =
    (canEdit && !editing) || canSubmit || canPublish || canPause || canResume ||
    canWithdraw || canClose || canRestore || (canNewVersion && !editing) || job.status !== 'archived'
  // End-of-life actions (Close / Withdraw / Archive) sit below a divider; the
  // irreversible ones (Withdraw / Archive) render red, Close does not — closing
  // is the normal way a job ends.
  const actionItem = (
    Icon: typeof Pencil, label: string, onClick: () => void,
    loading = false, destructive = false,
  ) => {
    const red = destructive
    return (
      <button
        key={label}
        onClick={() => { setShowActions(false); onClick() }}
        disabled={loading}
        className={cn(
          'flex w-full items-center gap-2.5 px-3 py-2.5 text-sm transition-colors disabled:opacity-50',
          red ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-50',
        )}
      >
        <Icon className={cn('h-4 w-4', red ? 'text-red-400' : 'text-slate-400')} />
        {label}
      </button>
    )
  }

  // Circular pencil trigger (matches the sidebar's fold button).
  const actionsTrigger =
    'flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm hover:border-emerald-500 hover:text-emerald-600 transition-colors'

  return (
    <>
      <Link href="/jobs" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to jobs
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900 truncate">{job.title}</h1>
            <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize', STATUS_BADGE[job.status])}>
              {job.status.replace('_', ' ')}
            </span>
            {seats.total > 0 && (
              <span
                className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-500"
                title="Headcount seats from the linked requisitions"
              >
                {seats.filled}/{seats.total} seats filled
              </span>
            )}

            {/* Pencil → job-actions dropdown, sitting right next to the status tag. */}
            {hasActions && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowActions(s => !s)}
                  aria-label="Job actions"
                  aria-haspopup="menu"
                  aria-expanded={showActions}
                  className={actionsTrigger}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                {showActions && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowActions(false)} />
                    <div className="absolute left-0 top-full mt-1 z-50 w-52 rounded-2xl border border-slate-200 bg-white py-1 shadow-xl">
                      <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Manage job</p>
                      {canEdit && !editing && actionItem(Pencil, 'Edit', () => { setForm(initForm(job)); setEditing(true); setTab('overview') })}
                      {canSubmit && actionItem(Send, 'Submit for approval', submitForApproval, submitting)}
                      {canPublish && actionItem(Globe, 'Publish', publish, publishing)}
                      {canPause && actionItem(PauseCircle, 'Pause', pause, pausing)}
                      {canResume && actionItem(PlayCircle, 'Resume', resume, resuming)}
                      {canNewVersion && !editing && actionItem(Copy, 'New version', newVersion, cloning)}
                      {canSaveTemplate && actionItem(LayoutTemplate, 'Save as template…', () => setTemplateOpen(true))}
                      {canRestore && actionItem(ArchiveRestore, 'Restore', restore, restoring)}
                      {(canClose || canWithdraw || job.status !== 'archived') && <div className="my-1 border-t border-slate-100" />}
                      {canClose && actionItem(CircleSlash, 'Close', () => setCloseReason(allSeatsFilled ? 'filled' : 'other'))}
                      {canWithdraw && actionItem(Ban, 'Withdraw', withdraw, withdrawing, true)}
                      {job.status !== 'archived' && actionItem(Archive, 'Archive', archive, archiving, true)}
                    </div>
                  </>
                )}
              </div>
            )}

            {job.confidentiality === 'confidential' && (
              <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Confidential</span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Created {new Date(job.created_at).toLocaleDateString()}
            {job.status === 'closed' && (closedInfo.closed_at || closedInfo.close_reason) && (
              <>
                {' · Closed'}
                {closedInfo.closed_at ? ` ${new Date(closedInfo.closed_at).toLocaleDateString()}` : ''}
                {closedInfo.close_reason ? ` — ${JOB_CLOSE_REASON_LABEL[closedInfo.close_reason] ?? closedInfo.close_reason}` : ''}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* View pipeline stays as a standalone button; all other job actions
              now live in the pencil dropdown next to the status tag above. */}
          {isLive && (
            <Link href={`/jobs/${job.id}`}>
              <Button variant="outline" size="sm">
                <LayoutGrid className="h-4 w-4" /> View pipeline
              </Button>
            </Link>
          )}
          {editing && (
            <>
              <Button size="sm" onClick={save} loading={saving}>Save changes</Button>
              <Button variant="outline" size="sm" onClick={() => { setEditing(false); setForm(initForm(job)) }}>
                <X className="h-4 w-4" /> Discard
              </Button>
            </>
          )}
        </div>
      </div>

      {/* D2: every job must trace back to an approved requisition. Older jobs
          created before that rule (or that lost their link) have none — flag
          them so the gap is visible and can be fixed by linking one below. */}
      {linkedOpenings.length === 0 && (
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
          <div>
            <span className="font-medium">No requisition linked.</span>{' '}
            Every job should be backed by an approved requisition. This one isn&apos;t — link an approved
            requisition in the <span className="font-medium">Requisitions</span> section below.
          </div>
        </div>
      )}

      {/* Every headcount seat is taken but the job is still live — offer to
          close it (pre-selecting "All seats filled" as the reason). */}
      {allSeatsFilled && (
        <div className="mb-5 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <div className="flex-1">
            <span className="font-medium">All {seats.total} {seats.total === 1 ? 'seat is' : 'seats are'} filled.</span>{' '}
            Close this job?
          </div>
          <Button size="sm" variant="outline" onClick={() => setCloseReason('filled')}>
            Close job
          </Button>
        </div>
      )}

      {editing && lockedSubstance && (
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
          <div>
            <span className="font-medium">This job is already approved.</span>{' '}
            Re-formatting (bold, lists, etc.) is fine, but changing the <span className="font-medium">wording</span> of the
            description, key requirements or nice-to-haves will send it back for re-approval — and pause new applications
            until your approver signs off. For a materially different role, use <span className="font-medium">New version</span> instead.
          </div>
        </div>
      )}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Job sections live in a left-hand menu (Ashby-style) so every option
            has a full-width label that's easy to scan. On < lg screens it
            collapses to a horizontal, scrollable row so nothing is hidden. */}
        <nav
          aria-label="Job sections"
          className="flex gap-1 overflow-x-auto border-b border-slate-200 pb-2 lg:w-56 lg:shrink-0 lg:flex-col lg:overflow-visible lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4"
        >
          <p className="hidden px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 lg:block">
            Manage this job
          </p>
          {(['overview', 'postings', 'screening', 'scoring', 'source', 'plan', 'audit'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              aria-current={tab === t ? 'page' : undefined}
              className={cn(
                'whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors',
                tab === t
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              )}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1">

      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader><CardTitle>Overview</CardTitle></CardHeader>
              <CardContent>
                {editing ? (
                  <div className="space-y-4">
                    {lockIdentity && (
                      <p className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-500">
                        Title, department, confidentiality, hiring manager &amp; location are locked once a
                        requisition is approved. You can still update the job description and requirements below.
                      </p>
                    )}

                    {/* ── Identity (locked after approval) ─────────────────── */}
                    <div className="space-y-1.5">
                      <Label>Title</Label>
                      {lockIdentity
                        ? <p className="text-sm text-slate-800">{job.title}</p>
                        : <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Department</Label>
                        {lockIdentity
                          ? <p className="text-sm text-slate-800">{department?.name ?? '—'}</p>
                          : (
                            <Select value={form.department_id} onChange={e => setForm(f => ({ ...f, department_id: e.target.value }))}>
                              <option value="">—</option>
                              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </Select>
                          )}
                      </div>
                      <div className="space-y-1.5">
                        <Label>Confidentiality</Label>
                        {lockIdentity
                          ? <p className="text-sm text-slate-800 capitalize">{job.confidentiality}</p>
                          : (
                            <Select value={form.confidentiality} onChange={e => setForm(f => ({ ...f, confidentiality: e.target.value as Job['confidentiality'] }))}>
                              <option value="public">Public</option>
                              <option value="confidential">Confidential</option>
                            </Select>
                          )}
                      </div>
                    </div>
                    {(intake.hm_name || intake.hm_email) && (
                      <div className="space-y-1.5">
                        <Label>Hiring manager</Label>
                        <p className="text-sm text-slate-800">
                          {intake.hm_name ?? '—'}{intake.hm_email ? ` · ${intake.hm_email}` : ''}
                        </p>
                      </div>
                    )}

                    {/* ── Level + job details (editable; not approval-locked) ─ */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Level</Label>
                        <Select value={form.level} onChange={e => setForm(f => ({ ...f, level: e.target.value }))}>
                          <option value="">—</option>
                          {LEVEL_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Employment type</Label>
                        <Select value={form.employment_type} onChange={e => setForm(f => ({ ...f, employment_type: e.target.value }))}>
                          <option value="">—</option>
                          {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Location</Label>
                        {locations.length > 0 ? (
                          <Select value={form.location_id} onChange={e => setForm(f => ({ ...f, location_id: e.target.value }))}>
                            <option value="">{form.location ? `— (${form.location})` : '—'}</option>
                            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                          </Select>
                        ) : (
                          <Input value={form.location}
                            onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                            placeholder="Bengaluru, India" />
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label>Work model</Label>
                        <Select value={form.work_model} onChange={e => setForm(f => ({ ...f, work_model: e.target.value }))}>
                          <option value="">—</option>
                          {WORK_MODELS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Compensation</Label>
                      <div className="grid grid-cols-3 gap-3">
                        <Input type="number" min={0} placeholder="Min" value={form.comp_min}
                          onChange={e => setForm(f => ({ ...f, comp_min: e.target.value }))} />
                        <Input type="number" min={0} placeholder="Max" value={form.comp_max}
                          onChange={e => setForm(f => ({ ...f, comp_max: e.target.value }))} />
                        <Input placeholder="USD" maxLength={3} value={form.comp_currency}
                          onChange={e => setForm(f => ({ ...f, comp_currency: e.target.value.toUpperCase().slice(0, 3) }))} />
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Inherited from the linked requisition{firstReq && formatComp(firstReq) ? ` (${formatComp(firstReq)})` : ''}; override here for this job only.
                      </p>
                    </div>
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input type="checkbox" checked={!!form.show_salary}
                        onChange={e => setForm(f => ({ ...f, show_salary: e.target.checked }))}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600" />
                      <span className="text-sm text-slate-700">
                        Show salary range on the public application page
                        <span className="block text-xs text-slate-400">
                          Uses the linked requisition&apos;s pay range. Hidden automatically if no range is set.
                        </span>
                      </span>
                    </label>
                    <p className="-mt-1 text-xs text-slate-400">
                      Employment type, location, work model &amp; salary show as chips on your public careers page.
                      Editing them does not require re-approval.
                    </p>

                    {/* ── JD body + requirements (editable any status) ─────── */}
                    <div className="space-y-1.5">
                      <Label>Job description</Label>
                      <RichTextEditor value={form.description} minHeight={160}
                        onChange={v => setForm(f => ({ ...f, description: v }))}
                        placeholder="The main job description shown to candidates." />
                    </div>
                    <div className="space-y-1.5">
                      <Label>What they&apos;ll do</Label>
                      <RichTextEditor value={form.team_context} minHeight={110}
                        onChange={v => setForm(f => ({ ...f, team_context: v }))}
                        placeholder="They'll own the checkout flow, work with design, lead 2 junior engineers…" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Key requirements</Label>
                      <RichTextEditor value={form.key_requirements} minHeight={110}
                        onChange={v => setForm(f => ({ ...f, key_requirements: v }))}
                        placeholder="5+ years React, Node.js, shipped production apps…" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Nice to have</Label>
                      <RichTextEditor value={form.nice_to_have} minHeight={84}
                        onChange={v => setForm(f => ({ ...f, nice_to_have: v }))}
                        placeholder="Next.js, fintech background, startup experience…" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Target start date</Label>
                        <Input value={form.target_start_date}
                          onChange={e => setForm(f => ({ ...f, target_start_date: e.target.value }))}
                          placeholder="ASAP, Q2 2025, June…" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Notes</Label>
                      <Textarea rows={3} value={form.notes}
                        onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                        placeholder="Anything else the hiring team should know." />
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <Button size="sm" onClick={save} loading={saving}>Save changes</Button>
                      <Button variant="outline" size="sm" onClick={() => { setEditing(false); setForm(initForm(job)) }}>Discard</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Department</dt>
                        <dd className="text-slate-800 mt-0.5">{department?.name ?? '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Confidentiality</dt>
                        <dd className="text-slate-800 mt-0.5 capitalize">{job.confidentiality}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Location</dt>
                        <dd className="text-slate-800 mt-0.5">{jobLocationName ?? '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Compensation</dt>
                        <dd className="text-slate-800 mt-0.5">
                          {jobComp ?? '—'}
                          {compFromReq && <span className="ml-2 text-xs text-slate-400">from requisition</span>}
                        </dd>
                      </div>
                      {intake.employment_type && (
                        <div>
                          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Employment type</dt>
                          <dd className="text-slate-800 mt-0.5">{intake.employment_type}</dd>
                        </div>
                      )}
                      {intake.work_model && (
                        <div>
                          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Work model</dt>
                          <dd className="text-slate-800 mt-0.5">{WORK_MODEL_LABEL[intake.work_model] ?? intake.work_model}</dd>
                        </div>
                      )}
                    </dl>
                    {job.description && (
                      <div className="mt-5 pt-4 border-t border-slate-100">
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Job description</dt>
                        <RichText html={job.description} />
                      </div>
                    )}
                    {job.description && <JobPostReview jobId={job.id} />}
                    {intake.level && (
                      <div className="mt-5 pt-4 border-t border-slate-100">
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Level</dt>
                        <p className="text-sm text-slate-700 capitalize">{intake.level}</p>
                      </div>
                    )}
                    <IntakeSection title="What they'll do" body={intake.team_context} />
                    <IntakeSection title="Key requirements" body={intake.key_requirements} />
                    <IntakeSection title="Nice to have" body={intake.nice_to_have} />
                    {intake.target_companies.length > 0 && (
                      <div className="mt-5 pt-4 border-t border-slate-100">
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Target companies</dt>
                        <div className="flex flex-wrap gap-1.5">
                          {intake.target_companies.map(c => (
                            <span key={c} className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700">{c}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    <IntakeSection title="Notes" body={intake.notes} />
                  </>
                )}
              </CardContent>
            </Card>

          </div>

          <div className="space-y-4">
            <JobTeamRoster jobId={job.id} hmRefreshKey={hmKey} />

            {/* Linked requisitions — moved from the main column into the sidebar. */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm">Linked requisitions</CardTitle>
                    <CardDescription>Headcount seats this pipeline fills.</CardDescription>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setLinkOpen(true)}>
                    <Plus className="h-4 w-4" /> Link
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {linkedOpenings.length === 0 ? (
                  <p className="text-xs text-slate-500">No requisitions linked yet.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {linkedOpenings.map(o => (
                      <div key={o.id} className="flex items-center justify-between py-2.5">
                        <div className="min-w-0 flex-1">
                          <Link href={`/openings/${o.id}`} className="text-sm font-medium text-slate-900 hover:text-emerald-700">
                            {typeof o.number === 'number' && (
                              <span className="mr-1.5 font-mono text-xs font-normal text-slate-400 tabular-nums">{OPENING_NUMBER_PREFIX}-{o.number}</span>
                            )}
                            {o.title}
                          </Link>
                          <div className="text-xs text-slate-500 mt-0.5">
                            <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize', OPENING_BADGE[o.status])}>
                              {o.status.replace('_', ' ')}
                            </span>
                            {o.comp_min && o.comp_max && (
                              <span className="ml-2">
                                {o.comp_currency} {Number(o.comp_min).toLocaleString()}–{Number(o.comp_max).toLocaleString()}
                              </span>
                            )}
                            {o.target_start_date && <span className="ml-2">· starts {o.target_start_date}</span>}
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => unlinkOpening(o.id)} aria-label="Unlink">
                          <Trash2 className="h-4 w-4 text-slate-400" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Scoring rubric summary (item 2). */}
            <ScoringRubricSummary
              criteria={readScoringCriteria(job.custom_fields)}
              onEdit={() => setTab('scoring')}
            />
            <Card>
              <CardHeader><CardTitle className="text-sm">Approval</CardTitle></CardHeader>
              <CardContent>
                {job.approval_id
                  ? <ApprovalProgress approvalId={job.approval_id} onDecided={refreshJob} />
                  : canSubmit
                    ? <p className="text-xs text-slate-400">Click &ldquo;Submit for approval&rdquo; when ready.</p>
                    : <p className="text-xs text-slate-400">Not submitted yet.</p>
                }
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {tab === 'postings' && (
        <PostingsTab jobId={job.id} jobStatus={job.status} />
      )}

      {tab === 'screening' && (
        <ScreeningTab
          jobId={job.id}
          jobInfo={{
            position_title:   job.title ?? '',
            department:       department?.name ?? null,
            location:         null,
            generated_jd:     job.description ?? null,
            responsibilities: intake.team_context,
            requirements:     intake.key_requirements,
            nice_to_have:     intake.nice_to_have,
          }}
        />
      )}

      {tab === 'scoring' && (
        <div className="space-y-4">
          <IcpEditor
            jobId={job.id}
            onApproved={c => setJob(j => ({ ...j, custom_fields: { ...j.custom_fields, scoring_criteria: c } }))}
          />
          <ScoringTab
            key={JSON.stringify(readScoringCriteria(job.custom_fields))}
            jobId={job.id}
            initialCriteria={readScoringCriteria(job.custom_fields)}
            onSaved={c => setJob(j => ({ ...j, custom_fields: { ...j.custom_fields, scoring_criteria: c } }))}
          />
        </div>
      )}

      {tab === 'source' && <SourcingTab jobId={job.id} />}

      {tab === 'plan' && <InterviewPlanTab jobId={job.id} />}

      {tab === 'audit' && <AuditLogTab targetType="job" targetId={job.id} />}

        </div>
      </div>

      {linkOpen && (
        <LinkOpeningDialog
          jobId={job.id}
          alreadyLinked={new Set(linkedOpenings.map(o => o.id))}
          onClose={(linked) => { setLinkOpen(false); if (linked) { setHmKey(k => k + 1); router.refresh() } }}
        />
      )}

      {templateOpen && (
        <SaveAsTemplateDialog
          jobId={job.id}
          initialName={job.title}
          onClose={() => setTemplateOpen(false)}
        />
      )}

      {closeReason && (
        <CloseJobDialog
          jobId={job.id}
          seatTotal={seats.total}
          initialReason={closeReason}
          onClose={(closed) => {
            setCloseReason(null)
            if (closed) { refreshJob(); router.refresh() }
          }}
        />
      )}

      {nudge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setNudge(null)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-base font-semibold text-slate-900">Publish before finishing setup?</h2>
            <p className="mt-2 text-sm text-slate-600">
              This job is about to go live, but a couple of things usually worth deciding first
              aren&apos;t set. You can add them now, or publish anyway and edit later.
            </p>
            <ul className="mt-3 space-y-2">
              {nudge.screening && (
                <li className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <span><span className="font-medium text-slate-800">No screening questions.</span> Candidates are only asked the built-in fields (name, email, phone, LinkedIn, résumé) — nothing role-specific.</span>
                </li>
              )}
              {nudge.rubric && (
                <li className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <span><span className="font-medium text-slate-800">No scoring rubric.</span> Candidates will be scored holistically, with no per-criterion breakdown against your priorities.</span>
                </li>
              )}
            </ul>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {nudge.screening && (
                <Button variant="outline" size="sm" onClick={() => { setNudge(null); setTab('screening') }}>
                  Add screening questions
                </Button>
              )}
              {nudge.rubric && (
                <Button variant="outline" size="sm" onClick={() => { setNudge(null); setTab('scoring') }}>
                  Set up scoring
                </Button>
              )}
              <Button size="sm" onClick={doPublish} loading={publishing}>
                Publish anyway
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// Re-export `X` so the unused-import linter is happy if a future iteration drops a usage.
export { X }
