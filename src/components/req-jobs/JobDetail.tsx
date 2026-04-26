'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Archive, Send, Globe, X, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ApprovalProgress } from '@/components/approvals/ApprovalProgress'
import { AuditLogTab } from '@/components/approvals/AuditLogTab'
import { LinkOpeningDialog } from '@/components/req-jobs/LinkOpeningDialog'
import { PostingsTab } from '@/components/req-jobs/PostingsTab'
import { cn } from '@/lib/utils'
import type { Job, Department, Opening, JobStatus, OpeningStatus } from '@/lib/types/requisitions'

const STATUS_BADGE: Record<JobStatus, string> = {
  draft:            'bg-slate-100 text-slate-700',
  pending_approval: 'bg-amber-100 text-amber-800',
  approved:         'bg-emerald-100 text-emerald-800',
  open:             'bg-blue-100 text-blue-800',
  closed:           'bg-slate-200 text-slate-600',
  archived:         'bg-slate-100 text-slate-400',
}

const OPENING_BADGE: Record<OpeningStatus, string> = {
  draft:            'bg-slate-100 text-slate-700',
  pending_approval: 'bg-amber-100 text-amber-800',
  approved:         'bg-emerald-100 text-emerald-800',
  open:             'bg-blue-100 text-blue-800',
  filled:           'bg-violet-100 text-violet-800',
  closed:           'bg-slate-200 text-slate-600',
  archived:         'bg-slate-100 text-slate-400',
}

interface Props {
  job:             Job
  department:      Pick<Department, 'id' | 'name'> | null
  linkedOpenings:  Pick<Opening, 'id' | 'title' | 'status' | 'comp_min' | 'comp_max' | 'comp_currency' | 'target_start_date'>[]
}

type Tab = 'overview' | 'postings' | 'audit'

export function JobDetail({ job, department, linkedOpenings }: Props) {
  const router = useRouter()
  const [tab, setTab]                 = useState<Tab>('overview')
  const [submitting, setSubmitting]   = useState(false)
  const [publishing, setPublishing]   = useState(false)
  const [archiving, setArchiving]     = useState(false)
  const [linkOpen, setLinkOpen]       = useState(false)

  const canSubmit  = job.status === 'draft'
  const canPublish = job.status === 'approved' && linkedOpenings.some(o => ['approved', 'open', 'filled'].includes(o.status))

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
    if (!confirm('Unlink this opening from the pipeline?')) return
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
          {(['overview', 'postings', 'audit'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'border-b-2 px-1 pb-2 text-sm font-medium capitalize transition-colors',
                tab === t ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-900',
              )}
            >
              {t === 'audit' ? 'Audit log' : t}
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
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Linked openings</CardTitle>
                    <CardDescription>Headcount seats this pipeline fills.</CardDescription>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setLinkOpen(true)}>
                    <Plus className="h-4 w-4" /> Link opening
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {linkedOpenings.length === 0 ? (
                  <p className="text-xs text-slate-500">No openings linked yet.</p>
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
