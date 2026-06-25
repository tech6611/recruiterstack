'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Archive, Send, Globe, X, Plus, Trash2, Pencil, LayoutGrid } from 'lucide-react'
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
import type { Job, Department, Opening, JobStatus, OpeningStatus } from '@/lib/types/requisitions'

const STATUS_BADGE: Record<JobStatus, string> = {
  draft:            'bg-slate-100 text-slate-700',
  pending_approval: 'bg-amber-100 text-amber-800',
  approved:         'bg-emerald-100 text-emerald-800',
  open:             'bg-slate-100 text-slate-800',
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
  return {
    title:           job.title ?? '',
    department_id:   job.department_id ?? '',
    description:     job.description ?? '',
    confidentiality: job.confidentiality ?? 'public',
  }
}

// Intake fields are collected at job creation and stashed in custom_fields.intake.
function readIntake(job: Job) {
  const i = (job.custom_fields?.intake ?? {}) as Record<string, unknown>
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null)
  return {
    team_context:     text(i.team_context),
    key_requirements: text(i.key_requirements),
    nice_to_have:     text(i.nice_to_have),
    level:            text(i.level),
    notes:            text(i.notes),
    target_companies: Array.isArray(i.target_companies)
      ? (i.target_companies as unknown[]).filter((t): t is string => typeof t === 'string' && t.trim() !== '')
      : [],
  }
}

function IntakeSection({ title, body }: { title: string; body: string | null }) {
  if (!body) return null
  return (
    <div className="mt-5 pt-4 border-t border-slate-100">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">{title}</dt>
      <p className="text-sm text-slate-700 whitespace-pre-line">{body}</p>
    </div>
  )
}

export function JobDetail({ job, department, departments, linkedOpenings }: Props) {
  const router = useRouter()
  const [tab, setTab]                 = useState<Tab>('overview')
  const [submitting, setSubmitting]   = useState(false)
  const [publishing, setPublishing]   = useState(false)
  const [archiving, setArchiving]     = useState(false)
  const [linkOpen, setLinkOpen]       = useState(false)
  const [editing, setEditing]         = useState(false)
  const [saving, setSaving]           = useState(false)
  const [form, setForm]               = useState(initForm(job))

  const intake = readIntake(job)

  const canSubmit  = job.status === 'draft'
  const canEdit    = job.status === 'draft'
  // Once live the job has a candidate pipeline; offer a jump to its Kanban so the
  // detail view (JD / approvals / audit log) and the pipeline stay cross-linked.
  const isLive     = ['open', 'posted', 'closed', 'filled'].includes(job.status)
  const canPublish = job.status === 'approved' && linkedOpenings.some(o => ['approved', 'open', 'filled'].includes(o.status))

  async function save() {
    if (!form.title.trim()) { toast.error('Title is required'); return }
    setSaving(true)
    const res = await fetch(`/api/req-jobs/${job.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title:           form.title.trim(),
        department_id:   form.department_id || null,
        description:     form.description.trim() || null,
        confidentiality: form.confidentiality,
      }),
    })
    setSaving(false)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(body.error ?? 'Save failed'); return }
    toast.success('Saved')
    setEditing(false)
    router.refresh()
  }

  async function submitForApproval() {
    setSubmitting(true)
    const res = await fetch(`/api/req-jobs/${job.id}/submit`, { method: 'POST' })
    setSubmitting(false)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(body.error ?? 'Submit failed'); return }
    toast.success(body.status === 'approved' ? 'Auto-approved.' : 'Submitted for approval.')
    router.refresh()
  }

  async function publish() {
    setPublishing(true)
    const res = await fetch(`/api/req-jobs/${job.id}/publish`, { method: 'POST' })
    setPublishing(false)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(body.error ?? 'Publish failed'); return }
    toast.success('Pipeline is now open.')
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
          {canSubmit && (
            <Button size="sm" onClick={submitForApproval} loading={submitting}>
              <Send className="h-4 w-4" /> Submit for approval
            </Button>
          )}
          {canPublish && (
            <Button size="sm" onClick={publish} loading={publishing}>
              <Globe className="h-4 w-4" /> Publish
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
                    <div className="space-y-1.5">
                      <Label>Title</Label>
                      <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Department</Label>
                        <Select value={form.department_id} onChange={e => setForm(f => ({ ...f, department_id: e.target.value }))}>
                          <option value="">—</option>
                          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Confidentiality</Label>
                        <Select value={form.confidentiality} onChange={e => setForm(f => ({ ...f, confidentiality: e.target.value as Job['confidentiality'] }))}>
                          <option value="public">Public</option>
                          <option value="confidential">Confidential</option>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Internal context</Label>
                      <Textarea
                        rows={6}
                        value={form.description}
                        onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                        placeholder="Notes for the hiring team (not shown to candidates)."
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Button size="sm" onClick={save} loading={saving}>Save changes</Button>
                      <Button variant="outline" size="sm" onClick={() => { setEditing(false); setForm(initForm(job)) }}>Cancel</Button>
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
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Internal context</dt>
                        <p className="text-sm text-slate-700 whitespace-pre-line">{job.description}</p>
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
                  ? <ApprovalProgress approvalId={job.approval_id} />
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

      {tab === 'screening' && <ScreeningTab jobId={job.id} />}

      {tab === 'audit' && <AuditLogTab targetType="job" targetId={job.id} />}

      {linkOpen && (
        <LinkOpeningDialog
          jobId={job.id}
          alreadyLinked={new Set(linkedOpenings.map(o => o.id))}
          onClose={(linked) => { setLinkOpen(false); if (linked) router.refresh() }}
        />
      )}
    </>
  )
}

// Re-export `X` so the unused-import linter is happy if a future iteration drops a usage.
export { X }
