'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Archive, Pencil, X, Send, FileText, ShieldAlert, Undo2, History } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { CharCounter } from '@/components/ui/char-counter'
import { ApprovalProgress } from '@/components/approvals/ApprovalProgress'
import { AuditLogTab } from '@/components/approvals/AuditLogTab'
import { cn } from '@/lib/utils'
import { openingFieldLabel } from '@/lib/openings/reapproval'
import type { OpeningChangeRequest } from '@/lib/openings/change-requests'
import type {
  Opening,
  Department,
  Location as LocationRow,
  CompensationBand,
  User,
  EmploymentType,
} from '@/lib/types/requisitions'

interface Props {
  opening:     Opening
  departments: Pick<Department, 'id' | 'name'>[]
  locations:   Pick<LocationRow, 'id' | 'name'>[]
  compBands:   CompensationBand[]
  users:       Pick<User, 'id' | 'full_name' | 'email'>[]
}

// Shape of GET /api/openings/:id/changes
interface DiffRow { field: string; label: string; before: unknown; after: unknown }
type PendingChange = OpeningChangeRequest & { diff: DiffRow[] }
interface OpeningVersion {
  id:                string
  version_no:        number
  reason:            'approved' | 'edited' | 'change_applied' | string
  changed_fields:    string[] | null
  change_request_id: string | null
  created_by:        string | null
  created_at:        string
}
interface ChangesState {
  gated_fields:   string[]
  pending_change: PendingChange | null
  versions:       OpeningVersion[]
}

const VERSION_REASON_LABEL: Record<string, string> = {
  approved:       'Approved',
  edited:         'Edited',
  change_applied: 'Change applied',
}

const STATUS_BADGE: Record<Opening['status'], string> = {
  draft:            'bg-slate-100 text-slate-700',
  pending_approval: 'bg-amber-100 text-amber-800',
  approved:         'bg-emerald-100 text-emerald-800',
  open:             'bg-slate-100 text-slate-800',
  filled:           'bg-slate-100 text-slate-800',
  closed:           'bg-slate-200 text-slate-600',
  archived:         'bg-slate-100 text-slate-400',
}

export function OpeningDetail({ opening, departments, locations, compBands, users }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [form, setForm]       = useState(initFormFromOpening(opening))
  const [saving, setSaving]   = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const [tab, setTab] = useState<'overview' | 'audit'>('overview')
  // Ashby model: which fields need re-approval, the change in flight (if any), version history.
  const [changes, setChanges] = useState<ChangesState>({ gated_fields: [], pending_change: null, versions: [] })

  // Approved/open requisitions are editable too: ordinary fields save at once,
  // gated ones go back through the approval chain (see /api/openings/:id PATCH).
  const isPostApproval = opening.status === 'approved' || opening.status === 'open'
  const canEdit   = opening.status === 'draft' || isPostApproval
  const canSubmit = opening.status === 'draft' && (opening.justification?.trim().length ?? 0) >= 50
  const canCancel = opening.status === 'pending_approval' && opening.approval_id != null
  // Approved requisition → next step is creating the job + writing its JD.
  const canCreateJob = opening.status === 'approved'

  const userById = useMemo(() => new Map(users.map(u => [u.id, u])), [users])
  const deptById = useMemo(() => new Map(departments.map(d => [d.id, d])), [departments])
  const locById  = useMemo(() => new Map(locations.map(l => [l.id, l])), [locations])
  const bandById = useMemo(() => new Map(compBands.map(b => [b.id, b])), [compBands])

  const loadChanges = useCallback(async () => {
    try {
      const res = await fetch(`/api/openings/${opening.id}/changes`)
      if (!res.ok) return
      const body = await res.json().catch(() => ({}))
      const d = body.data ?? {}
      setChanges({
        gated_fields:   Array.isArray(d.gated_fields) ? d.gated_fields : [],
        pending_change: d.pending_change ?? null,
        versions:       Array.isArray(d.versions) ? d.versions : [],
      })
    } catch { /* non-fatal: the page still works without gating hints */ }
  }, [opening.id])

  useEffect(() => { loadChanges() }, [loadChanges])

  const pending      = changes.pending_change
  const gatedSet     = useMemo(() => new Set(changes.gated_fields), [changes.gated_fields])
  const latestVersion = changes.versions.length > 0 ? Math.max(...changes.versions.map(v => v.version_no)) : null

  // Label for a field key — prefer the server-resolved label on the pending diff
  // (it knows custom-field labels), fall back to the built-in map.
  const labelFor = useCallback((field: string, diff?: DiffRow[]) =>
    diff?.find(d => d.field === field)?.label ?? openingFieldLabel(field), [])

  // Render a before/after value as a person would read it: ids → names,
  // numbers with separators, nulls as a dash.
  const formatValue = useCallback((field: string, v: unknown): string => {
    if (v === null || v === undefined || v === '') return '—'
    if (field === 'department_id')     return deptById.get(String(v))?.name ?? String(v)
    if (field === 'location_id')       return locById.get(String(v))?.name ?? String(v)
    if (field === 'comp_band_id')      return bandById.get(String(v))?.name ?? String(v)
    if (field === 'hiring_manager_id' || field === 'recruiter_id') {
      const u = userById.get(String(v))
      return u?.full_name ?? u?.email ?? String(v)
    }
    if (field === 'employment_type' && typeof v === 'string') return v.replace('_', ' ')
    if (typeof v === 'number') return v.toLocaleString()
    if ((field === 'comp_min' || field === 'comp_max') && typeof v === 'string' && !Number.isNaN(Number(v))) return Number(v).toLocaleString()
    if (typeof v === 'boolean') return v ? 'Yes' : 'No'
    if (Array.isArray(v)) return v.map(x => String(x)).join(', ') || '—'
    if (typeof v === 'object') return JSON.stringify(v)
    return String(v)
  }, [deptById, locById, bandById, userById])

  function startEditing() {
    // Re-seed from the latest server row so an applied change isn't overwritten by stale form state.
    setForm(initFormFromOpening(opening))
    setEditing(true)
  }

  async function save() {
    setSaving(true)
    const res = await fetch(`/api/openings/${opening.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title:             form.title.trim(),
        department_id:     form.department_id || null,
        location_id:       form.location_id   || null,
        employment_type:   form.employment_type,
        comp_band_id:      form.comp_band_id  || null,
        comp_min:          form.comp_min ? Number(form.comp_min) : null,
        comp_max:          form.comp_max ? Number(form.comp_max) : null,
        comp_currency:     form.comp_currency,
        target_start_date: form.target_start_date || null,
        hiring_manager_id:    form.hiring_manager_id || null,
        hiring_manager_name:  form.hiring_manager_name.trim() || null,
        hiring_manager_email: form.hiring_manager_email.trim() || null,
        recruiter_id:      form.recruiter_id || null,
        justification:     form.justification.trim() || null,
      }),
    })
    setSaving(false)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      // 409 → "already awaiting approval" carries its own message.
      toast.error(body.error ?? 'Save failed')
      return
    }

    if (isPostApproval) {
      const gated: string[]   = Array.isArray(body.gated_fields)   ? body.gated_fields   : []
      const applied: string[] = Array.isArray(body.applied_fields) ? body.applied_fields : []
      const newPending = (body.pending_change ?? null) as PendingChange | null
      if (newPending) {
        const labels = gated.map(f => labelFor(f, newPending.diff)).join(', ')
        toast.info(`Submitted for re-approval: ${labels}`, {
          description: applied.length > 0
            ? 'Your other edits were saved immediately.'
            : 'The requisition keeps its current values until the change is approved.',
        })
      } else if (gated.length > 0) {
        // Requester was the only approver → the engine auto-approved and applied it.
        toast.success(`Saved — ${gated.map(f => labelFor(f)).join(', ')} auto-approved`)
      } else {
        toast.success('Saved')
      }
    } else {
      toast.success('Saved')
    }
    setEditing(false)
    router.refresh()
    loadChanges()
  }

  async function withdrawChange() {
    if (!pending) return
    if (!confirm('Withdraw this change? The requisition keeps its currently approved values.')) return
    setWithdrawing(true)
    const res = await fetch(`/api/openings/${opening.id}/changes/${pending.id}/cancel`, { method: 'POST' })
    setWithdrawing(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast.error(body.error ?? 'Withdraw failed')
      return
    }
    toast.success('Change withdrawn')
    router.refresh()
    loadChanges()
  }

  async function archive() {
    if (!confirm('Archive this requisition? Status will change to archived.')) return
    setArchiving(true)
    const res = await fetch(`/api/openings/${opening.id}`, { method: 'DELETE' })
    setArchiving(false)
    if (!res.ok) {
      toast.error('Archive failed')
      return
    }
    toast.success('Requisition archived')
    router.push('/openings')
  }

  async function submitForApproval() {
    setSubmitting(true)
    const res = await fetch(`/api/openings/${opening.id}/submit`, { method: 'POST' })
    setSubmitting(false)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(body.error ?? 'Submit failed')
      return
    }
    toast.success(body.auto_approved ? 'Auto-approved (you were the only approver).' : 'Submitted for approval.')
    router.refresh()
    loadChanges()
  }

  async function cancelApproval() {
    if (!opening.approval_id) return
    if (!confirm('Cancel this approval? The requisition will return to draft.')) return
    setCancelling(true)
    const res = await fetch(`/api/approvals/${opening.approval_id}/cancel`, { method: 'POST' })
    setCancelling(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast.error(body.error ?? 'Cancel failed')
      return
    }
    toast.success('Approval cancelled')
    router.refresh()
  }

  // Hand off to the New Job drawer pre-filled from this requisition. The drawer
  // links this existing opening (via from_opening) instead of minting new seats.
  function createJob() {
    const params = new URLSearchParams({ new: '1', from_opening: opening.id, title: opening.title })
    if (dept?.name) params.set('department', dept.name)
    if (loc?.name)  params.set('location', loc.name)
    if (opening.employment_type) params.set('employment_type', opening.employment_type)
    if (opening.comp_min != null) params.set('comp_min', String(opening.comp_min))
    if (opening.comp_max != null) params.set('comp_max', String(opening.comp_max))
    if (opening.target_start_date) params.set('target_start_date', opening.target_start_date)
    // Prefer the free-typed HM contact (name + email) that flows to the job and
    // powers the calendar link; fall back to the approver user's name.
    const hmName = opening.hiring_manager_name ?? hm?.full_name ?? hm?.email
    if (hmName) params.set('hm_name', hmName)
    if (opening.hiring_manager_email) params.set('hm_email', opening.hiring_manager_email)
    router.push(`/jobs?${params.toString()}`)
  }

  const hm        = opening.hiring_manager_id ? userById.get(opening.hiring_manager_id) : null
  const recruiter = opening.recruiter_id      ? userById.get(opening.recruiter_id)      : null
  const dept      = opening.department_id     ? deptById.get(opening.department_id)     : null
  const loc       = opening.location_id       ? locById.get(opening.location_id)        : null
  const band      = opening.comp_band_id      ? bandById.get(opening.comp_band_id)      : null
  const requester = pending ? userById.get(pending.requested_by) : null

  return (
    <>
      <Link href="/openings" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to requisitions
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900 truncate">{opening.title}</h1>
            <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize', STATUS_BADGE[opening.status])}>
              {opening.status.replace('_', ' ')}
            </span>
            {latestVersion !== null && (
              <span
                className="inline-flex rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-400"
                title={`Version ${latestVersion} — see the Audit log tab for history`}
              >
                v{latestVersion}
              </span>
            )}
            {opening.out_of_band && (
              <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Out of band</span>
            )}
            {pending && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                <ShieldAlert className="h-3 w-3" /> Change awaiting approval
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">Created {new Date(opening.created_at).toLocaleDateString()}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canCreateJob && (
            <Button size="sm" onClick={createJob}>
              <FileText className="h-4 w-4" /> Create job &amp; write JD
            </Button>
          )}
          {canSubmit && (
            <Button size="sm" onClick={submitForApproval} loading={submitting}>
              <Send className="h-4 w-4" /> Submit for approval
            </Button>
          )}
          {canCancel && (
            <Button variant="outline" size="sm" onClick={cancelApproval} loading={cancelling}>
              Cancel approval
            </Button>
          )}
          {canEdit && !editing && (
            <Button variant="outline" size="sm" onClick={startEditing}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          )}
          {opening.status !== 'archived' && (
            <Button variant="ghost" size="sm" onClick={archive} loading={archiving}>
              <Archive className="h-4 w-4" /> Archive
            </Button>
          )}
        </div>
      </div>

      <div className="border-b border-slate-200 mb-4">
        <nav className="flex gap-4">
          {(['overview', 'audit'] as const).map(t => (
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

      {tab === 'audit' && (
        <div className="space-y-4">
          <AuditLogTab targetType="opening" targetId={opening.id} />
          <VersionsList versions={changes.versions} userById={userById} />
        </div>
      )}

      {tab === 'overview' && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader><CardTitle>Overview</CardTitle></CardHeader>
            <CardContent>
              {!editing ? (
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                  <DetailRow label="Department">{dept?.name ?? '—'}</DetailRow>
                  <DetailRow label="Location">{loc?.name ?? '—'}</DetailRow>
                  <DetailRow label="Employment type">{opening.employment_type.replace('_', ' ')}</DetailRow>
                  <DetailRow label="Target start">{opening.target_start_date ?? '—'}</DetailRow>
                  <DetailRow label="Comp">
                    {opening.comp_min !== null && opening.comp_max !== null
                      ? `${opening.comp_currency} ${Number(opening.comp_min).toLocaleString()}–${Number(opening.comp_max).toLocaleString()}`
                      : '—'}
                  </DetailRow>
                  <DetailRow label="Comp band">{band?.name ?? '—'}</DetailRow>
                  <DetailRow label="Hiring manager (approver)">{hm?.full_name ?? hm?.email ?? '—'}</DetailRow>
                  <DetailRow label="Recruiter">{recruiter?.full_name ?? recruiter?.email ?? '—'}</DetailRow>
                  <DetailRow label="HM name">{opening.hiring_manager_name ?? '—'}</DetailRow>
                  <DetailRow label="HM email">{opening.hiring_manager_email ?? '—'}</DetailRow>
                </dl>
              ) : (
                <>
                  {isPostApproval && (
                    <p className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
                      <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                      <span>
                        This requisition is {opening.status}. Fields marked <strong>Needs re-approval</strong> go back through the approval chain when changed; everything else saves immediately.
                        {pending && ' A change is already awaiting approval, so those fields are locked until it is decided or withdrawn.'}
                      </span>
                    </p>
                  )}
                  <EditForm
                    form={form} setForm={setForm}
                    departments={departments} locations={locations} compBands={compBands} users={users}
                    gatedFields={isPostApproval ? gatedSet : EMPTY_SET}
                    gatedLocked={isPostApproval && pending != null}
                  />
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Justification</CardTitle></CardHeader>
            <CardContent>
              {!editing ? (
                <p className="text-sm text-slate-700 whitespace-pre-line">{opening.justification ?? <span className="text-slate-400">—</span>}</p>
              ) : (
                <>
                  <Textarea
                    className="min-h-[120px]"
                    value={form.justification}
                    onChange={e => setForm(f => ({ ...f, justification: e.target.value }))}
                    maxLength={5000}
                  />
                  <CharCounter value={form.justification} max={5000} min={50} className="mt-1.5" />
                </>
              )}
            </CardContent>
          </Card>

          {editing && (
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setEditing(false); setForm(initFormFromOpening(opening)) }}>
                <X className="h-4 w-4" /> Cancel
              </Button>
              <Button onClick={save} loading={saving}>Save changes</Button>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {pending && (
            <Card className="border-amber-200">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <ShieldAlert className="h-4 w-4 text-amber-600" /> Change awaiting approval
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5 text-xs">
                  {pending.diff.map(d => (
                    <li key={d.field} className="flex flex-wrap items-baseline gap-x-1">
                      <span className="font-medium text-slate-700">{d.label}:</span>
                      <span className="text-slate-500 line-through decoration-slate-300">{formatValue(d.field, d.before)}</span>
                      <span className="text-slate-400">→</span>
                      <span className="font-medium text-slate-900">{formatValue(d.field, d.after)}</span>
                    </li>
                  ))}
                </ul>
                {pending.note && <p className="mt-2 text-xs italic text-slate-600">“{pending.note}”</p>}
                <p className="mt-2 text-[11px] text-slate-400">
                  Requested by {requester?.full_name ?? requester?.email ?? 'someone'} · {new Date(pending.created_at).toLocaleString()}
                </p>
                {pending.approval_id && (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <ApprovalProgress
                      approvalId={pending.approval_id}
                      onDecided={() => { loadChanges(); router.refresh() }}
                    />
                  </div>
                )}
                <Button
                  variant="outline" size="sm" className="mt-3 w-full"
                  onClick={withdrawChange} loading={withdrawing}
                >
                  <Undo2 className="h-3.5 w-3.5" /> Withdraw change
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-sm">Approval</CardTitle></CardHeader>
            <CardContent>
              {opening.approval_id
                ? <ApprovalProgress approvalId={opening.approval_id} />
                : canSubmit
                  ? <p className="text-xs text-slate-400">Click &ldquo;Submit for approval&rdquo; when ready.</p>
                  : <p className="text-xs text-slate-400">Add a justification (≥ 50 chars) to enable submit.</p>
              }
            </CardContent>
          </Card>
        </div>
      </div>
      )}
    </>
  )
}

const EMPTY_SET: ReadonlySet<string> = new Set()

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-slate-800 mt-0.5">{children}</dd>
    </div>
  )
}

// ── Version history (Audit log tab) ─────────────────────────

function VersionsList({ versions, userById }: {
  versions: OpeningVersion[]
  userById: Map<string, Pick<User, 'id' | 'full_name' | 'email'>>
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-1.5">
          <History className="h-4 w-4 text-slate-500" /> Versions
        </CardTitle>
      </CardHeader>
      <CardContent>
        {versions.length === 0 ? (
          <p className="text-xs text-slate-500 py-2 text-center">No versions yet — the first is written when the requisition is approved.</p>
        ) : (
          <ol className="divide-y divide-slate-100">
            {[...versions].sort((a, b) => b.version_no - a.version_no).map(v => {
              const who = v.created_by ? userById.get(v.created_by) : null
              const fields = (v.changed_fields ?? []).map(f => openingFieldLabel(f))
              return (
                <li key={v.id} className="flex items-start gap-3 py-2 text-sm">
                  <span className="mt-0.5 inline-flex shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                    v{v.version_no}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-slate-900">
                      <span className="font-medium">{VERSION_REASON_LABEL[v.reason] ?? v.reason}</span>
                      {who && <span className="text-slate-500"> · {who.full_name ?? who.email}</span>}
                    </div>
                    {fields.length > 0 && (
                      <div className="text-xs text-slate-500 mt-0.5">{fields.join(', ')}</div>
                    )}
                    <div className="text-[11px] text-slate-400 mt-0.5">{new Date(v.created_at).toLocaleString()}</div>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}

// ── Edit subform ────────────────────────────────────────────

interface EditFormProps {
  form:        EditFormState
  setForm:     React.Dispatch<React.SetStateAction<EditFormState>>
  departments: Pick<Department, 'id' | 'name'>[]
  locations:   Pick<LocationRow, 'id' | 'name'>[]
  compBands:   CompensationBand[]
  users:       Pick<User, 'id' | 'full_name' | 'email'>[]
  /** Field keys whose edits need re-approval (empty for drafts). */
  gatedFields: ReadonlySet<string>
  /** A change is already awaiting approval → gated fields are read-only. */
  gatedLocked: boolean
}

interface EditFormState {
  title:             string
  department_id:     string
  location_id:       string
  employment_type:   EmploymentType
  comp_band_id:      string
  comp_min:          string
  comp_max:          string
  comp_currency:     string
  target_start_date: string
  hiring_manager_id: string
  hiring_manager_name:  string
  hiring_manager_email: string
  recruiter_id:      string
  justification:     string
}

function initFormFromOpening(o: Opening): EditFormState {
  return {
    title:             o.title,
    department_id:     o.department_id ?? '',
    location_id:       o.location_id   ?? '',
    employment_type:   o.employment_type,
    comp_band_id:      o.comp_band_id  ?? '',
    comp_min:          o.comp_min !== null ? String(o.comp_min) : '',
    comp_max:          o.comp_max !== null ? String(o.comp_max) : '',
    comp_currency:     o.comp_currency,
    target_start_date: o.target_start_date ?? '',
    hiring_manager_id: o.hiring_manager_id ?? '',
    hiring_manager_name:  o.hiring_manager_name  ?? '',
    hiring_manager_email: o.hiring_manager_email ?? '',
    recruiter_id:      o.recruiter_id      ?? '',
    justification:     o.justification     ?? '',
  }
}

/** Small amber chip next to a gated field's label. */
function GateHint({ locked }: { locked: boolean }) {
  const text  = locked ? 'Awaiting approval' : 'Needs re-approval'
  const title = locked
    ? 'A change is already awaiting approval. Decide or withdraw it before editing this field.'
    : 'Changing this field sends the requisition back through its approval chain.'
  return (
    <span
      className="ml-1.5 inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-amber-800"
      title={title}
    >
      <ShieldAlert className="h-3 w-3" /> {text}
    </span>
  )
}

function EditForm({ form, setForm, departments, locations, compBands, users, gatedFields, gatedLocked }: EditFormProps) {
  const gated    = (k: string) => gatedFields.has(k)
  const locked   = (k: string) => gatedLocked && gatedFields.has(k)
  const hint     = (k: string) => (gated(k) ? <GateHint locked={gatedLocked} /> : null)
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Title{hint('title')}</Label>
        <Input value={form.title} disabled={locked('title')} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Department{hint('department_id')}</Label>
          <Select value={form.department_id} disabled={locked('department_id')} onChange={e => setForm(f => ({ ...f, department_id: e.target.value }))}>
            <option value="">—</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Location{hint('location_id')}</Label>
          <Select value={form.location_id} disabled={locked('location_id')} onChange={e => setForm(f => ({ ...f, location_id: e.target.value }))}>
            <option value="">—</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Employment type{hint('employment_type')}</Label>
        <Select value={form.employment_type} disabled={locked('employment_type')} onChange={e => setForm(f => ({ ...f, employment_type: e.target.value as EmploymentType }))}>
          <option value="full_time">Full-time</option>
          <option value="part_time">Part-time</option>
          <option value="contract">Contract</option>
          <option value="intern">Intern</option>
          <option value="temp">Temporary</option>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Hiring manager (approver){hint('hiring_manager_id')}</Label>
          <Select value={form.hiring_manager_id} disabled={locked('hiring_manager_id')} onChange={e => setForm(f => ({ ...f, hiring_manager_id: e.target.value }))}>
            <option value="">—</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>)}
          </Select>
          <p className="text-[11px] text-slate-400">Used for approval routing. Optional.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Recruiter{hint('recruiter_id')}</Label>
          <Select value={form.recruiter_id} disabled={locked('recruiter_id')} onChange={e => setForm(f => ({ ...f, recruiter_id: e.target.value }))}>
            <option value="">—</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>)}
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Hiring manager name</Label>
          <Input
            placeholder="Priya Sharma"
            value={form.hiring_manager_name}
            onChange={e => setForm(f => ({ ...f, hiring_manager_name: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Hiring manager email</Label>
          <Input
            type="email"
            placeholder="priya@company.com"
            value={form.hiring_manager_email}
            onChange={e => setForm(f => ({ ...f, hiring_manager_email: e.target.value }))}
          />
          <p className="text-[11px] text-slate-400">Flows to the job. Powers the calendar booking link in sequence emails.</p>
        </div>
      </div>
      <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <Label>Comp band{hint('comp_band_id')}</Label>
        <Select value={form.comp_band_id} disabled={locked('comp_band_id')} onChange={e => {
          const band = compBands.find(b => b.id === e.target.value)
          if (band) {
            setForm(f => ({
              ...f,
              comp_band_id: band.id,
              // Picking a band also fills the range — but never overwrite a locked comp field.
              comp_min:      locked('comp_min')      ? f.comp_min      : String(band.min_salary),
              comp_max:      locked('comp_max')      ? f.comp_max      : String(band.max_salary),
              comp_currency: locked('comp_currency') ? f.comp_currency : band.currency,
            }))
          } else {
            setForm(f => ({ ...f, comp_band_id: '' }))
          }
        }}>
          <option value="">—</option>
          {compBands.map(b => (
            <option key={b.id} value={b.id}>{b.name} · {b.currency} {Number(b.min_salary).toLocaleString()}–{Number(b.max_salary).toLocaleString()}</option>
          ))}
        </Select>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Min{hint('comp_min')}</Label>
            <Input type="number" value={form.comp_min} disabled={locked('comp_min')} onChange={e => setForm(f => ({ ...f, comp_min: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Max{hint('comp_max')}</Label>
            <Input type="number" value={form.comp_max} disabled={locked('comp_max')} onChange={e => setForm(f => ({ ...f, comp_max: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Currency{hint('comp_currency')}</Label>
            <Input value={form.comp_currency} maxLength={3} disabled={locked('comp_currency')} onChange={e => setForm(f => ({ ...f, comp_currency: e.target.value.toUpperCase().slice(0, 3) }))} />
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Target start{hint('target_start_date')}</Label>
        <Input type="date" value={form.target_start_date} disabled={locked('target_start_date')} onChange={e => setForm(f => ({ ...f, target_start_date: e.target.value }))} />
      </div>
    </div>
  )
}
