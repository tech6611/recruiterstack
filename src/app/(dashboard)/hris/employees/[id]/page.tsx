'use client'

import Link from 'next/link'
import { useAuth } from '@clerk/nextjs'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import {
  ArrowLeft,
  BadgeCheck,
  Briefcase,
  Calendar,
  Check,
  DollarSign,
  GitBranch,
  LogOut,
  StickyNote,
  X,
} from 'lucide-react'
import { flags } from '@/lib/flags'
import { inputCls, labelCls } from '@/lib/ui/styles'
import type {
  CompensationRecord,
  EmployeeStatus,
  EmploymentEventType,
  OnboardingPlan,
  OnboardingTemplate,
  TimeOffRequest,
  TimeOffRequestType,
  TimeOffStatus,
} from '@/lib/types/database'

type EmployeeDetail = {
  id: string
  status: EmployeeStatus
  hired_at: string | null
  start_date: string | null
  joined_at: string | null
  terminated_at: string | null
  manager_id: string | null
  person: { name: string; email: string } | null
  manager: { id: string; name: string | null; email: string | null } | null
}

type EmployeeEvent = {
  id: string
  event_type: EmploymentEventType
  details: Record<string, unknown> | null
  occurred_at: string
  recorded_by: string | null
}

type DirectReport = {
  id: string
  status: EmployeeStatus
  person: { name: string; email: string } | null
}

const REPORT_STATUS_DOT: Record<EmployeeStatus, string> = {
  pending:    'bg-amber-400',
  active:     'bg-emerald-500',
  terminated: 'bg-slate-300',
}

const STATUS_BADGE: Record<EmployeeStatus, string> = {
  pending:    'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  active:     'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  terminated: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
}

const STATUS_LABEL: Record<EmployeeStatus, string> = {
  pending:    'Pre-hire',
  active:     'Active',
  terminated: 'Terminated',
}

const EVENT_META: Record<EmploymentEventType, { icon: typeof BadgeCheck; tone: string; ring: string; title: string }> = {
  hired:               { icon: Briefcase,  tone: 'text-amber-600',   ring: 'ring-amber-200',   title: 'Hired (pre-hire)' },
  joined:              { icon: BadgeCheck, tone: 'text-emerald-600', ring: 'ring-emerald-200', title: 'Joined the org' },
  manager_changed:     { icon: GitBranch,  tone: 'text-blue-600',    ring: 'ring-blue-200',    title: 'Manager changed' },
  comp_changed:        { icon: DollarSign, tone: 'text-emerald-600', ring: 'ring-emerald-200', title: 'Compensation changed' },
  terminated:          { icon: LogOut,     tone: 'text-slate-500',   ring: 'ring-slate-200',   title: 'Terminated' },
  note:                { icon: StickyNote, tone: 'text-slate-600',   ring: 'ring-slate-200',   title: 'Note' },
  time_off_requested:  { icon: Calendar,   tone: 'text-blue-600',    ring: 'ring-blue-200',    title: 'Time-off requested' },
  time_off_approved:   { icon: Check,      tone: 'text-emerald-600', ring: 'ring-emerald-200', title: 'Time-off approved' },
  time_off_rejected:   { icon: X,          tone: 'text-rose-600',    ring: 'ring-rose-200',    title: 'Time-off rejected' },
  time_off_cancelled:  { icon: X,          tone: 'text-slate-500',   ring: 'ring-slate-200',   title: 'Time-off cancelled' },
}

const TIMEOFF_STATUS_BADGE: Record<TimeOffStatus, string> = {
  pending:    'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  approved:   'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  rejected:   'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
  cancelled:  'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
}

function fmtMoney(amount: number | null | undefined, currency: string | null | undefined): string {
  if (amount == null) return '—'
  return `${currency ?? ''} ${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`.trim()
}

function fmtDate(date: string | null): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function fmtDateTime(date: string): string {
  return new Date(date).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function eventDetail(e: EmployeeEvent): string | null {
  switch (e.event_type) {
    case 'joined': {
      const sd = e.details?.start_date as string | undefined
      return sd ? `Start date: ${sd}` : null
    }
    case 'note':
      return (e.details?.note as string) ?? null
    case 'manager_changed': {
      const from = e.details?.from_manager_id ? 'someone' : 'no manager'
      const to   = e.details?.to_manager_id   ? 'a new manager' : 'no manager'
      return `From ${from} to ${to}`
    }
    case 'comp_changed': {
      const from   = e.details?.from_salary as number | null | undefined
      const to     = e.details?.to_salary as number | undefined
      const cur    = (e.details?.currency as string | null) ?? null
      const freq   = (e.details?.pay_frequency as string | null) ?? null
      const reason = (e.details?.reason as string | null) ?? null
      const change = from != null
        ? `${fmtMoney(from, cur)} → ${fmtMoney(to, cur)}`
        : `Set to ${fmtMoney(to, cur)}`
      const suffix = [freq && `(${freq})`, reason].filter(Boolean).join(' · ')
      return suffix ? `${change} — ${suffix}` : change
    }
    case 'time_off_requested':
    case 'time_off_approved':
    case 'time_off_rejected':
    case 'time_off_cancelled': {
      const type = (e.details?.request_type as string) ?? 'time off'
      const start = (e.details?.start_date as string) ?? ''
      const end   = (e.details?.end_date as string) ?? ''
      const range = start === end ? start : `${start} → ${end}`
      const note  = (e.details?.decided_note as string | null) ?? null
      return `${type} · ${range}${note ? ` — ${note}` : ''}`
    }
    default:
      return null
  }
}

export default function EmployeeDetailPage() {
  const { id }    = useParams<{ id: string }>()
  const { orgId } = useAuth()
  const router    = useRouter()
  const [employee, setEmployee]       = useState<EmployeeDetail | null>(null)
  const [events, setEvents]           = useState<EmployeeEvent[]>([])
  const [currentComp, setCurrentComp] = useState<CompensationRecord | null>(null)
  const [reports, setReports]         = useState<DirectReport[]>([])
  const [timeOff, setTimeOff]         = useState<TimeOffRequest[]>([])
  const [loading, setLoading]         = useState(true)
  const [busy, setBusy]               = useState(false)
  const [notFound, setNotFound]       = useState(false)

  // Inline "request time off" form state.
  const [showTimeOffForm, setShowTimeOffForm] = useState(false)
  const [toType, setToType]           = useState<TimeOffRequestType>('vacation')
  const [toStart, setToStart]         = useState('')
  const [toEnd, setToEnd]             = useState('')
  const [toReason, setToReason]       = useState('')
  const [submittingTO, setSubmittingTO] = useState(false)

  // Onboarding state.
  const [activePlan, setActivePlan]   = useState<OnboardingPlan | null>(null)
  const [showOnboardingForm, setShowOnboardingForm] = useState(false)
  const [templates, setTemplates]     = useState<OnboardingTemplate[]>([])
  const [obTemplateId, setObTemplateId] = useState<string>('')
  const [obStartDate, setObStartDate] = useState<string>('')
  const [submittingOB, setSubmittingOB] = useState(false)

  const fetchAll = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setNotFound(false)
    const [empRes, evRes, compRes, reportsRes, timeOffRes] = await Promise.all([
      fetch(`/api/employees/${id}`),
      fetch(`/api/employees/${id}/events`),
      fetch(`/api/employees/${id}/compensation`),
      fetch(`/api/employees/${id}/direct-reports`),
      fetch(`/api/employees/${id}/time-off`),
    ])
    if (empRes.status === 404) {
      setNotFound(true)
      setLoading(false)
      return
    }
    if (empRes.ok) {
      const j = await empRes.json()
      setEmployee(j.data as EmployeeDetail)
    }
    if (evRes.ok) {
      const j = await evRes.json()
      setEvents((j.data ?? []) as EmployeeEvent[])
    }
    if (compRes.ok) {
      const j = await compRes.json()
      setCurrentComp((j.data?.current ?? null) as CompensationRecord | null)
    }
    if (reportsRes.ok) {
      const j = await reportsRes.json()
      setReports((j.data ?? []) as DirectReport[])
    }
    if (timeOffRes.ok) {
      const j = await timeOffRes.json()
      setTimeOff((j.data ?? []) as TimeOffRequest[])
    }
    // Active onboarding plan for this employee (admin-only endpoint; will 200 here).
    const obPlanRes = await fetch('/api/hris/onboarding/plans?status=in_progress')
    if (obPlanRes.ok) {
      const j = await obPlanRes.json()
      const list = (j.data ?? []) as Array<OnboardingPlan & { employee_id: string }>
      setActivePlan(list.find(p => p.employee_id === id) ?? null)
    }
    setLoading(false)
  }, [id])

  useEffect(() => {
    if (orgId) fetchAll()
  }, [fetchAll, orgId])

  async function transition(action: 'join' | 'terminate') {
    setBusy(true)
    const res = await fetch(`/api/employees/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    if (res.ok) await fetchAll()
    setBusy(false)
  }

  async function submitTimeOff() {
    if (!toStart || !toEnd) return
    setSubmittingTO(true)
    const res = await fetch(`/api/employees/${id}/time-off`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        request_type: toType,
        start_date: toStart,
        end_date: toEnd,
        reason: toReason || null,
      }),
    })
    if (res.ok) {
      setShowTimeOffForm(false)
      setToType('vacation'); setToStart(''); setToEnd(''); setToReason('')
      await fetchAll()
    }
    setSubmittingTO(false)
  }

  async function decideTimeOff(requestId: string, action: 'approve' | 'reject' | 'cancel') {
    const res = await fetch(`/api/time-off/${requestId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    if (res.ok) await fetchAll()
  }

  async function openOnboardingForm() {
    if (templates.length === 0) {
      const res = await fetch('/api/hris/onboarding/templates')
      if (res.ok) {
        const j = await res.json()
        const list = (j.data ?? []) as OnboardingTemplate[]
        setTemplates(list)
        const def = list.find(t => t.is_default) ?? list[0]
        if (def) setObTemplateId(def.id)
      }
    }
    setShowOnboardingForm(true)
  }

  async function startOnboarding() {
    if (!obTemplateId) return
    setSubmittingOB(true)
    const res = await fetch(`/api/employees/${id}/onboarding`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_id: obTemplateId, start_date: obStartDate || null }),
    })
    if (res.ok) {
      setShowOnboardingForm(false)
      setObStartDate('')
      await fetchAll()
    }
    setSubmittingOB(false)
  }

  if (!flags.hris) {
    return <div className="p-8 text-sm text-slate-500">The HRIS module is not enabled.</div>
  }

  return (
    <div className="p-8">
      <button
        onClick={() => router.push('/hris/employees')}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" /> All employees
      </button>

      {loading ? (
        <div className="text-sm text-slate-400">Loading…</div>
      ) : notFound || !employee ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
          Employee not found.
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  {employee.person?.name ?? 'Unknown'}
                </h1>
                <p className="mt-1 text-sm text-slate-500">{employee.person?.email ?? '—'}</p>
                <div className="mt-3 flex items-center gap-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[employee.status]}`}>
                    {STATUS_LABEL[employee.status]}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                {employee.status === 'pending' && (
                  <button
                    onClick={() => transition('join')}
                    disabled={busy}
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {busy ? 'Saving…' : 'Mark joined'}
                  </button>
                )}
                {(employee.status === 'pending' || employee.status === 'active') && (
                  <button
                    onClick={() => transition('terminate')}
                    disabled={busy}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
                  >
                    Terminate
                  </button>
                )}
              </div>
            </div>

            {/* Key facts */}
            <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-slate-100 pt-4 text-sm sm:grid-cols-3 lg:grid-cols-5">
              <div>
                <p className="text-xs font-semibold text-slate-400">Hired</p>
                <p className="mt-0.5 text-slate-800">{fmtDate(employee.hired_at)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400">Start date</p>
                <p className="mt-0.5 text-slate-800">{fmtDate(employee.start_date)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400">Joined</p>
                <p className="mt-0.5 text-slate-800">{fmtDate(employee.joined_at)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400">Reports to</p>
                <p className="mt-0.5 text-slate-800">
                  {employee.manager ? (
                    <Link href={`/hris/employees/${employee.manager.id}`} className="text-emerald-700 hover:underline">
                      {employee.manager.name ?? employee.manager.email ?? employee.manager.id}
                    </Link>
                  ) : (
                    <span className="text-slate-400">— (no manager set)</span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400">Compensation</p>
                {currentComp ? (
                  <p className="mt-0.5 text-slate-800">
                    {fmtMoney(currentComp.base_salary, currentComp.currency)}{' '}
                    <span className="text-xs text-slate-400">/ {currentComp.pay_frequency}</span>
                  </p>
                ) : (
                  <p className="mt-0.5 text-slate-400">— (none set)</p>
                )}
              </div>
            </div>
          </div>

          {/* Direct reports */}
          {reports.length > 0 && (
            <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="mb-1 text-lg font-semibold text-slate-900">Direct reports</h2>
              <p className="mb-4 text-xs text-slate-500">
                {reports.length} {reports.length === 1 ? 'person reports' : 'people report'} to {employee.person?.name ?? 'this employee'}.
              </p>
              <ul className="divide-y divide-slate-100">
                {reports.map(r => (
                  <li key={r.id}>
                    <Link
                      href={`/hris/employees/${r.id}`}
                      className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-slate-50"
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${REPORT_STATUS_DOT[r.status]}`} />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium text-slate-800">{r.person?.name ?? 'Unknown'}</span>
                        <span className="ml-2 text-xs text-slate-400">{r.person?.email ?? ''}</span>
                      </span>
                      <span className="shrink-0 text-xs text-slate-400">{STATUS_LABEL[r.status]}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Onboarding */}
          <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Onboarding</h2>
                <p className="text-xs text-slate-500">
                  {activePlan
                    ? <>Active plan: <span className="font-medium text-slate-700">{activePlan.template_name}</span> · started {activePlan.start_date}</>
                    : 'No active onboarding plan.'}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {activePlan ? (
                  <Link
                    href={`/hris/onboarding`}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    View all plans
                  </Link>
                ) : !showOnboardingForm ? (
                  <button
                    onClick={openOnboardingForm}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    Start onboarding
                  </button>
                ) : null}
              </div>
            </div>

            {showOnboardingForm && !activePlan && (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Template</label>
                    <select
                      className={inputCls}
                      value={obTemplateId}
                      onChange={e => setObTemplateId(e.target.value)}
                    >
                      <option value="" disabled>Pick a template…</option>
                      {templates.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.name}{t.is_default ? ' (default)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Start date (optional)</label>
                    <input type="date" className={inputCls} value={obStartDate} onChange={e => setObStartDate(e.target.value)} />
                  </div>
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    onClick={() => setShowOnboardingForm(false)}
                    disabled={submittingOB}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={startOnboarding}
                    disabled={!obTemplateId || submittingOB}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {submittingOB ? 'Starting…' : 'Start plan'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Time off */}
          <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Time off</h2>
                <p className="text-xs text-slate-500">
                  Requests auto-route to the manager set in the HRIS reporting structure.
                </p>
              </div>
              {!showTimeOffForm && (
                <button
                  onClick={() => setShowTimeOffForm(true)}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
                >
                  Request time off
                </button>
              )}
            </div>

            {showTimeOffForm && (
              <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <label className={labelCls}>Type</label>
                    <select className={inputCls} value={toType} onChange={e => setToType(e.target.value as TimeOffRequestType)}>
                      <option value="vacation">Vacation</option>
                      <option value="sick">Sick</option>
                      <option value="personal">Personal</option>
                      <option value="unpaid">Unpaid</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Start</label>
                    <input type="date" className={inputCls} value={toStart} onChange={e => setToStart(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>End</label>
                    <input type="date" className={inputCls} value={toEnd} onChange={e => setToEnd(e.target.value)} />
                  </div>
                  <div className="sm:col-span-1">
                    <label className={labelCls}>Reason (optional)</label>
                    <input className={inputCls} value={toReason} onChange={e => setToReason(e.target.value)} placeholder="Anniversary" />
                  </div>
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    onClick={() => setShowTimeOffForm(false)}
                    disabled={submittingTO}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitTimeOff}
                    disabled={!toStart || !toEnd || submittingTO}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {submittingTO ? 'Submitting…' : 'Submit request'}
                  </button>
                </div>
              </div>
            )}

            {timeOff.length === 0 ? (
              <p className="py-2 text-sm text-slate-400">No time-off requests yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {timeOff.map(r => (
                  <li key={r.id} className="flex items-center gap-3 px-2 py-2 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-slate-800 capitalize">{r.request_type}</span>
                      <span className="ml-2 text-slate-500">
                        {r.start_date === r.end_date ? r.start_date : `${r.start_date} → ${r.end_date}`}
                      </span>
                      {r.reason && <span className="ml-2 text-xs text-slate-400">— {r.reason}</span>}
                    </span>
                    <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${TIMEOFF_STATUS_BADGE[r.status]}`}>
                      {r.status}
                    </span>
                    {r.status === 'pending' && (
                      <span className="flex shrink-0 gap-1">
                        <button
                          onClick={() => decideTimeOff(r.id, 'approve')}
                          className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                        >Approve</button>
                        <button
                          onClick={() => decideTimeOff(r.id, 'reject')}
                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                        >Reject</button>
                        <button
                          onClick={() => decideTimeOff(r.id, 'cancel')}
                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                        >Cancel</button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Timeline */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-1 text-lg font-semibold text-slate-900">Timeline</h2>
            <p className="mb-6 text-xs text-slate-500">
              Every employment transition, auto-logged on the same identity. {events.length} event{events.length === 1 ? '' : 's'}.
            </p>

            {events.length === 0 ? (
              <div className="py-6 text-center text-sm text-slate-400">No events yet.</div>
            ) : (
              <ol className="relative space-y-5 border-l border-slate-200 pl-6">
                {events.map(e => {
                  const meta = EVENT_META[e.event_type]
                  const Icon = meta.icon
                  const detail = eventDetail(e)
                  return (
                    <li key={e.id} className="relative">
                      <span className={`absolute -left-[33px] flex h-6 w-6 items-center justify-center rounded-full bg-white ring-2 ${meta.ring}`}>
                        <Icon className={`h-3.5 w-3.5 ${meta.tone}`} />
                      </span>
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-sm font-medium text-slate-900">{meta.title}</p>
                        <p className="shrink-0 text-xs text-slate-400">{fmtDateTime(e.occurred_at)}</p>
                      </div>
                      {detail && <p className="mt-1 text-sm text-slate-600">{detail}</p>}
                      {e.recorded_by && e.recorded_by !== 'system' && (
                        <p className="mt-1 text-xs text-slate-400">by {e.recorded_by}</p>
                      )}
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
        </>
      )}
    </div>
  )
}
