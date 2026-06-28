'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Archive, Send, Globe, Ban, X, Plus, Trash2, Pencil, LayoutGrid } from 'lucide-react'
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
import { PostingsTab } from '@/components/req-jobs/PostingsTab'
import { ScreeningTab } from '@/components/req-jobs/ScreeningTab'
import { cn } from '@/lib/utils'
import { RichText } from '@/components/RichText'
import { RichTextEditor, isHtmlEmpty } from '@/components/RichTextEditor'
import type { Job, Department, Opening, JobStatus, OpeningStatus } from '@/lib/types/requisitions'

const STATUS_BADGE: Record<JobStatus, string> = {
  draft:            'bg-slate-100 text-slate-700',
  pending_approval: 'bg-amber-100 text-amber-800',
  approved:         'bg-emerald-100 text-emerald-800',
  open:             'bg-slate-100 text-slate-800',
  withdrawn:        'bg-orange-100 text-orange-800',
  closed:           'bg-slate-200 text-slate-600',
  archived:         'bg-slate-100 text-slate-400',
}

const OPENING_BADGE: Record<OpeningStatus, string> = {
  draft:            'bg-slate-100 text-slate-700',
  pending_approval: 'bg-amber-100 text-amber-800',
  approved:         'bg-emerald-100 text-emerald-800',
  open:             'bg-slate-100 text-slate-800',
  filled:           'bg-slate-100 text-slate-800',
  closed:           'bg-slate-200 text-slate-600',
  archived:         'bg-slate-100 text-slate-400',
}

interface Props {
  job:             Job
  department:      Pick<Department, 'id' | 'name'> | null
  departments:     Pick<Department, 'id' | 'name'>[]
  linkedOpenings:  Pick<Opening, 'id' | 'title' | 'status' | 'comp_min' | 'comp_max' | 'comp_currency' | 'target_start_date'>[]
}

type Tab = 'overview' | 'postings' | 'screening' | 'audit'

const TAB_LABELS: Record<Tab, string> = {
  overview:  'Overview',
  postings:  'Postings',
  screening: 'Application form',
  audit:     'Audit log',
}

function initForm(job: Job) {
  const intake = readIntake(job)
  return {
    title:             job.title ?? '',
    department_id:     job.department_id ?? '',
    description:       descriptionToEditorHtml(job.description),
    confidentiality:   job.confidentiality ?? 'public',
    // Full JD / intake fields — rich HTML so bullets & formatting survive.
    level:             intake.level ?? '',
    team_context:      intake.team_context ?? '',
    key_requirements:  intake.key_requirements ?? '',
    nice_to_have:      intake.nice_to_have ?? '',
    notes:             intake.notes ?? '',
    target_start_date: intake.target_start_date ?? '',
  }
}

// Levels mirror the New Job create form (jobs/page.tsx) so the edit dropdown
// offers the same choices.
const LEVEL_OPTIONS = ['Intern', 'Junior', 'Mid-level', 'Senior', 'Lead', 'Staff', 'Principal', 'Director', 'VP']

// Intake fields are collected at job creation and stashed in custom_fields.intake.
function readIntake(job: Job) {
  const i = (job.custom_fields?.intake ?? {}) as Record<string, unknown>
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null)
  return {
    team_context:      text(i.team_context),
    key_requirements:  text(i.key_requirements),
    nice_to_have:      text(i.nice_to_have),
    level:             text(i.level),
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

export function JobDetail({ job: initialJob, department, departments, linkedOpenings }: Props) {
  const router = useRouter()
  // The job lives in local state so status-driven UI (the title badge and the
  // action buttons) can update live without a full page refresh. The server prop
  // only seeds the initial value; after mount, `refreshJob()` is the source of
  // truth. We don't lean on router.refresh() alone because the server read can lag
  // a just-committed status change (e.g. an approval that just landed).
  const [job, setJob]                 = useState<Job>(initialJob)
  const [tab, setTab]                 = useState<Tab>('overview')
  const [submitting, setSubmitting]   = useState(false)
  const [publishing, setPublishing]   = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const [archiving, setArchiving]     = useState(false)
  const [linkOpen, setLinkOpen]       = useState(false)
  const [editing, setEditing]         = useState(false)
  const [saving, setSaving]           = useState(false)
  const [form, setForm]               = useState(initForm(job))
  // Soft nudge shown when publishing a job whose application form has no custom
  // questions — guides toward adding screening questions without blocking.
  const [publishNudge, setPublishNudge] = useState(false)

  const intake = readIntake(job)

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
  const canEdit       = ['draft', 'approved', 'open', 'withdrawn'].includes(job.status)
  const lockIdentity  = job.status !== 'draft'
  // Once live the job has a candidate pipeline; offer a jump to its Kanban so the
  // detail view (JD / approvals / audit log) and the pipeline stay cross-linked.
  const isLive     = ['open', 'withdrawn', 'posted', 'closed', 'filled'].includes(job.status)
  // 'approved' = first publish; 'withdrawn' = re-publish a paused job.
  const canPublish = (job.status === 'approved' || job.status === 'withdrawn') &&
    linkedOpenings.some(o => ['approved', 'open', 'filled'].includes(o.status))
  const canWithdraw = job.status === 'open'

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
          team_context:      isHtmlEmpty(form.team_context)     ? '' : form.team_context,
          key_requirements:  isHtmlEmpty(form.key_requirements) ? '' : form.key_requirements,
          nice_to_have:      isHtmlEmpty(form.nice_to_have)     ? '' : form.nice_to_have,
          notes:             form.notes.trim(),
          target_start_date: form.target_start_date.trim(),
        },
      },
    }
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
    toast.success('Saved')
    setEditing(false)
    refreshJob()
    router.refresh()
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

  // Publish gate: if the job's application form has no custom questions, surface a
  // soft nudge first; otherwise publish straight away. A failed check never blocks
  // publishing — we just proceed.
  async function publish() {
    setPublishing(true)
    try {
      const r = await fetch(`/api/jobs/${job.id}/screening`)
      const j = await r.json()
      if ((j.data?.fields ?? []).length === 0) {
        setPublishing(false)
        setPublishNudge(true)
        return
      }
    } catch { /* check failed — fall through and publish */ }
    setPublishing(false)
    doPublish()
  }

  async function doPublish() {
    setPublishNudge(false)
    setPublishing(true)
    const res = await fetch(`/api/req-jobs/${job.id}/publish`, { method: 'POST' })
    setPublishing(false)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(body.error ?? 'Publish failed'); return }
    toast.success('Pipeline is now open.')
    refreshJob()
    router.refresh()
  }

  async function withdraw() {
    if (!confirm('Withdraw this job? All public application links will stop working until you re-publish.')) return
    setWithdrawing(true)
    const res = await fetch(`/api/req-jobs/${job.id}/withdraw`, { method: 'POST' })
    setWithdrawing(false)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(body.error ?? 'Withdraw failed'); return }
    toast.success('Job withdrawn. Application links are now closed.')
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
    router.push('/req-jobs')
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
    router.refresh()
  }

  return (
    <>
      <Link href="/req-jobs" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to pipelines
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900 truncate">{job.title}</h1>
            <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize', STATUS_BADGE[job.status])}>
              {job.status.replace('_', ' ')}
            </span>
            {job.confidentiality === 'confidential' && (
              <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Confidential</span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">Created {new Date(job.created_at).toLocaleDateString()}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isLive && (
            <Link href={`/jobs/${job.id}`}>
              <Button variant="outline" size="sm">
                <LayoutGrid className="h-4 w-4" /> View pipeline
              </Button>
            </Link>
          )}
          {canEdit && !editing && (
            <Button variant="outline" size="sm" onClick={() => { setForm(initForm(job)); setEditing(true); setTab('overview') }}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          )}
          {editing && (
            <>
              <Button size="sm" onClick={save} loading={saving}>Save changes</Button>
              <Button variant="outline" size="sm" onClick={() => { setEditing(false); setForm(initForm(job)) }}>
                <X className="h-4 w-4" /> Discard
              </Button>
            </>
          )}
          {canSubmit && (
            <Button size="sm" onClick={submitForApproval} loading={submitting}>
              <Send className="h-4 w-4" /> Submit for approval
            </Button>
          )}
          {canPublish && (
            <Button size="sm" onClick={publish} loading={publishing}>
              <Globe className="h-4 w-4" /> {job.status === 'withdrawn' ? 'Re-publish' : 'Publish'}
            </Button>
          )}
          {canWithdraw && (
            <Button variant="outline" size="sm" onClick={withdraw} loading={withdrawing}>
              <Ban className="h-4 w-4" /> Withdraw
            </Button>
          )}
          {job.status !== 'archived' && (
            <Button variant="ghost" size="sm" onClick={archive} loading={archiving}>
              <Archive className="h-4 w-4" /> Archive
            </Button>
          )}
        </div>
      </div>

      <div className="border-b border-slate-200 mb-4">
        <nav className="flex gap-4">
          {(['overview', 'postings', 'screening', 'audit'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'border-b-2 px-1 pb-2 text-sm font-medium transition-colors',
                tab === t ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-900',
              )}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </nav>
      </div>

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

                    {/* ── Level (editable) ─────────────────────────────────── */}
                    <div className="space-y-1.5">
                      <Label>Level</Label>
                      <Select value={form.level} onChange={e => setForm(f => ({ ...f, level: e.target.value }))}>
                        <option value="">—</option>
                        {LEVEL_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                      </Select>
                    </div>

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
                    </dl>
                    {job.description && (
                      <div className="mt-5 pt-4 border-t border-slate-100">
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Job description</dt>
                        <RichText html={job.description} />
                      </div>
                    )}
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

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Linked requisitions</CardTitle>
                    <CardDescription>Headcount seats this pipeline fills.</CardDescription>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setLinkOpen(true)}>
                    <Plus className="h-4 w-4" /> Link requisition
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
          </div>

          <div className="space-y-4">
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

      {tab === 'audit' && <AuditLogTab targetType="job" targetId={job.id} />}

      {linkOpen && (
        <LinkOpeningDialog
          jobId={job.id}
          alreadyLinked={new Set(linkedOpenings.map(o => o.id))}
          onClose={(linked) => { setLinkOpen(false); if (linked) router.refresh() }}
        />
      )}

      {publishNudge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setPublishNudge(false)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-base font-semibold text-slate-900">Publish with just the basics?</h2>
            <p className="mt-2 text-sm text-slate-600">
              This job&apos;s application form has no custom screening questions yet. Candidates will
              still be asked for the built-in fields (name, email, phone, LinkedIn, résumé, cover
              letter) — but you won&apos;t collect anything role-specific.
            </p>
            <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setPublishNudge(false); setTab('screening') }}>
                Add screening questions
              </Button>
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
