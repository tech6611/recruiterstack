'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Archive, Pencil, X, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ApprovalProgress } from '@/components/approvals/ApprovalProgress'
import { AuditLogTab } from '@/components/approvals/AuditLogTab'
import { cn } from '@/lib/utils'
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

const STATUS_BADGE: Record<Opening['status'], string> = {
  draft:            'bg-slate-100 text-slate-700',
  pending_approval: 'bg-amber-100 text-amber-800',
  approved:         'bg-emerald-100 text-emerald-800',
  open:             'bg-blue-100 text-blue-800',
  filled:           'bg-violet-100 text-violet-800',
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
  const [tab, setTab] = useState<'overview' | 'audit'>('overview')

  const canEdit   = opening.status === 'draft'
  const canSubmit = opening.status === 'draft' && (opening.justification?.trim().length ?? 0) >= 50
  const canCancel = opening.status === 'pending_approval' && opening.approval_id != null

  const userById = useMemo(() => new Map(users.map(u => [u.id, u])), [users])
  const deptById = useMemo(() => new Map(departments.map(d => [d.id, d])), [departments])
  const locById  = useMemo(() => new Map(locations.map(l => [l.id, l])), [locations])
  const bandById = useMemo(() => new Map(compBands.map(b => [b.id, b])), [compBands])

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
        hiring_manager_id: form.hiring_manager_id || null,
        recruiter_id:      form.recruiter_id || null,
        justification:     form.justification.trim() || null,
      }),
    })
    setSaving(false)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(body.error ?? 'Save failed')
      return
    }
    toast.success('Saved')
    setEditing(false)
    router.refresh()
  }

  async function archive() {
    if (!confirm('Archive this opening? Status will change to archived.')) return
    setArchiving(true)
    const res = await fetch(`/api/openings/${opening.id}`, { method: 'DELETE' })
    setArchiving(false)
    if (!res.ok) {
      toast.error('Archive failed')
      return
    }
    toast.success('Opening archived')
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
  }

  async function cancelApproval() {
    if (!opening.approval_id) return
    if (!confirm('Cancel this approval? The opening will return to draft.')) return
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

  const hm        = opening.hiring_manager_id ? userById.get(opening.hiring_manager_id) : null
  const recruiter = opening.recruiter_id      ? userById.get(opening.recruiter_id)      : null
  const dept      = opening.department_id     ? deptById.get(opening.department_id)     : null
  const loc       = opening.location_id       ? locById.get(opening.location_id)        : null
  const band      = opening.comp_band_id      ? bandById.get(opening.comp_band_id)      : null

  return (
    <>
      <Link href="/openings" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to openings
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900 truncate">{opening.title}</h1>
            <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize', STATUS_BADGE[opening.status])}>
              {opening.status.replace('_', ' ')}
            </span>
            {opening.out_of_band && (
              <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Out of band</span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">Created {new Date(opening.created_at).toLocaleDateString()}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
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
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
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

      {tab === 'audit' && <AuditLogTab targetType="opening" targetId={opening.id} />}

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
                  <DetailRow label="Hiring manager">{hm?.full_name ?? hm?.email ?? '—'}</DetailRow>
                  <DetailRow label="Recruiter">{recruiter?.full_name ?? recruiter?.email ?? '—'}</DetailRow>
                </dl>
              ) : (
                <EditForm
                  form={form} setForm={setForm}
                  departments={departments} locations={locations} compBands={compBands} users={users}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Justification</CardTitle></CardHeader>
            <CardContent>
              {!editing ? (
                <p className="text-sm text-slate-700 whitespace-pre-line">{opening.justification ?? <span className="text-slate-400">—</span>}</p>
              ) : (
                <Textarea
                  className="min-h-[120px]"
                  value={form.justification}
                  onChange={e => setForm(f => ({ ...f, justification: e.target.value }))}
                />
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

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-slate-800 mt-0.5">{children}</dd>
    </div>
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
    recruiter_id:      o.recruiter_id      ?? '',
    justification:     o.justification     ?? '',
  }
}

function EditForm({ form, setForm, departments, locations, compBands, users }: EditFormProps) {
  return (
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
          <Label>Location</Label>
          <Select value={form.location_id} onChange={e => setForm(f => ({ ...f, location_id: e.target.value }))}>
            <option value="">—</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Employment type</Label>
        <Select value={form.employment_type} onChange={e => setForm(f => ({ ...f, employment_type: e.target.value as EmploymentType }))}>
          <option value="full_time">Full-time</option>
          <option value="part_time">Part-time</option>
          <option value="contract">Contract</option>
          <option value="intern">Intern</option>
          <option value="temp">Temporary</option>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Hiring manager</Label>
          <Select value={form.hiring_manager_id} onChange={e => setForm(f => ({ ...f, hiring_manager_id: e.target.value }))}>
            <option value="">—</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>)}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Recruiter</Label>
          <Select value={form.recruiter_id} onChange={e => setForm(f => ({ ...f, recruiter_id: e.target.value }))}>
            <option value="">—</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>)}
          </Select>
        </div>
      </div>
      <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <Label>Comp band</Label>
        <Select value={form.comp_band_id} onChange={e => {
          const band = compBands.find(b => b.id === e.target.value)
          if (band) {
            setForm(f => ({
              ...f,
              comp_band_id: band.id,
              comp_min: String(band.min_salary),
              comp_max: String(band.max_salary),
              comp_currency: band.currency,
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
            <Label className="text-xs">Min</Label>
            <Input type="number" value={form.comp_min} onChange={e => setForm(f => ({ ...f, comp_min: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Max</Label>
            <Input type="number" value={form.comp_max} onChange={e => setForm(f => ({ ...f, comp_max: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Currency</Label>
            <Input value={form.comp_currency} maxLength={3} onChange={e => setForm(f => ({ ...f, comp_currency: e.target.value.toUpperCase().slice(0, 3) }))} />
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Target start</Label>
        <Input type="date" value={form.target_start_date} onChange={e => setForm(f => ({ ...f, target_start_date: e.target.value }))} />
      </div>
    </div>
  )
}
