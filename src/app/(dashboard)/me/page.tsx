'use client'

import Link from 'next/link'
import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useState } from 'react'
import { BadgeCheck, Calendar, Clock, DollarSign, Inbox, Network, UserCircle, Users } from 'lucide-react'
import { flags } from '@/lib/flags'
import type {
  CompensationRecord,
  EmployeeStatus,
  EmploymentEventType,
  TimeOffRequest,
} from '@/lib/types/database'

type MeEmployee = {
  id: string
  status: EmployeeStatus
  hired_at: string | null
  start_date: string | null
  joined_at: string | null
  manager_id: string | null
  person: { name: string; email: string } | null
  manager: { id: string; name: string | null; email: string | null } | null
} | null

type MeEvent = {
  id: string
  event_type: EmploymentEventType
  details: Record<string, unknown> | null
  occurred_at: string
}

type PendingDecision = {
  request: TimeOffRequest
  requester: { name: string | null; email: string | null } | null
  employee_id: string
}

const STATUS_LABEL: Record<EmployeeStatus, string> = {
  pending:    'Pre-hire',
  active:     'Active',
  terminated: 'Terminated',
}
const STATUS_BADGE: Record<EmployeeStatus, string> = {
  pending:    'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  active:     'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  terminated: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
}

function fmt(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function eventTitle(t: EmploymentEventType) {
  return ({
    hired: 'Hired (pre-hire)',
    joined: 'Joined the org',
    manager_changed: 'Manager changed',
    comp_changed: 'Compensation changed',
    terminated: 'Terminated',
    note: 'Note',
    time_off_requested: 'Time-off requested',
    time_off_approved: 'Time-off approved',
    time_off_rejected: 'Time-off rejected',
    time_off_cancelled: 'Time-off cancelled',
  } as Record<EmploymentEventType, string>)[t]
}

export default function MeOverviewPage() {
  const { orgId } = useAuth()
  const [employee, setEmployee] = useState<MeEmployee>(null)
  const [currentComp, setCurrentComp] = useState<CompensationRecord | null>(null)
  const [recentEvents, setRecentEvents] = useState<MeEvent[]>([])
  const [myTimeOff, setMyTimeOff] = useState<TimeOffRequest[]>([])
  const [pendingMine, setPendingMine] = useState<PendingDecision[]>([])
  const [reports, setReports] = useState<Array<{ id: string; person: { name: string; email: string } | null }>>([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [meRes, evRes, compRes, toRes, apRes] = await Promise.all([
      fetch('/api/me'),
      fetch('/api/me/timeline'),
      fetch('/api/me/compensation'),
      fetch('/api/me/time-off'),
      fetch('/api/me/approvals-pending'),
    ])
    let empId: string | null = null
    if (meRes.ok) {
      const j = await meRes.json()
      const emp = (j.data?.employee ?? null) as MeEmployee
      setEmployee(emp)
      empId = emp?.id ?? null
    }
    if (evRes.ok) {
      const j = await evRes.json()
      setRecentEvents(((j.data ?? []) as MeEvent[]).slice(0, 5))
    }
    if (compRes.ok) {
      const j = await compRes.json()
      setCurrentComp(j.data?.current ?? null)
    }
    if (toRes.ok) {
      const j = await toRes.json()
      setMyTimeOff(((j.data ?? []) as TimeOffRequest[]).slice(0, 5))
    }
    if (apRes.ok) {
      const j = await apRes.json()
      setPendingMine((j.data ?? []) as PendingDecision[])
    }
    // Manager-only: my direct reports.
    if (empId) {
      const r = await fetch(`/api/employees/${empId}/direct-reports`)
      if (r.ok) {
        const j = await r.json()
        setReports(j.data ?? [])
      }
    }
    setLoading(false)
  }, [])

  useEffect(() => { if (orgId) fetchAll() }, [fetchAll, orgId])

  if (!flags.hris) {
    return <div className="p-8 text-sm text-slate-500">The HRIS module is not enabled.</div>
  }
  if (loading) return <div className="p-8 text-sm text-slate-400">Loading…</div>

  // Not-in-HRIS state (e.g. admins/recruiters without an employee_profile).
  if (!employee) {
    return (
      <div className="p-8">
        <div className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-8 text-center">
          <UserCircle className="mx-auto h-10 w-10 text-slate-300" />
          <h1 className="mt-3 text-xl font-bold text-slate-900">You&rsquo;re not in the HRIS yet</h1>
          <p className="mt-2 text-sm text-slate-500">
            Your user account isn&rsquo;t linked to an employee record in this org. If you should have one,
            ask HR to add you.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <p className="text-sm text-slate-500">Hi {employee.person?.name?.split(' ')[0] ?? 'there'},</p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Your dashboard</h1>
      </div>

      {/* Top tiles */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Status</span>
            <BadgeCheck className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2">
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[employee.status]}`}>
              {STATUS_LABEL[employee.status]}
            </span>
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Joined</span>
            <Clock className="h-4 w-4 text-slate-400" />
          </div>
          <p className="mt-2 text-sm text-slate-800">{fmt(employee.joined_at) || fmt(employee.start_date)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Compensation</span>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 text-sm text-slate-800">
            {currentComp
              ? `${currentComp.currency} ${currentComp.base_salary.toLocaleString()} / ${currentComp.pay_frequency}`
              : '—'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Reports to</span>
            <Network className="h-4 w-4 text-slate-400" />
          </div>
          <p className="mt-2 truncate text-sm text-slate-800">
            {employee.manager ? (
              <Link href={`/hris/employees/${employee.manager.id}`} className="text-emerald-700 hover:underline">
                {employee.manager.name ?? employee.manager.email}
              </Link>
            ) : (
              <span className="text-slate-400">— (no manager)</span>
            )}
          </p>
        </div>
      </div>

      {/* Manager-only widgets */}
      {(pendingMine.length > 0 || reports.length > 0) && (
        <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {/* Pending approvals (manager only when there are any) */}
          {pendingMine.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-3 flex items-center gap-2">
                <Inbox className="h-4 w-4 text-amber-600" />
                <h2 className="text-sm font-semibold text-slate-900">Waiting on you ({pendingMine.length})</h2>
              </div>
              <ul className="space-y-1.5 text-sm">
                {pendingMine.slice(0, 5).map(p => (
                  <li key={p.request.id} className="flex items-center justify-between">
                    <span className="min-w-0 truncate text-slate-700">
                      {p.requester?.name ?? '—'} · {p.request.request_type} · {p.request.start_date === p.request.end_date ? p.request.start_date : `${p.request.start_date} → ${p.request.end_date}`}
                    </span>
                    <Link href="/me/approvals" className="ml-2 shrink-0 text-xs text-emerald-700 hover:underline">Review →</Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {reports.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-3 flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-600" />
                <h2 className="text-sm font-semibold text-slate-900">Your team ({reports.length})</h2>
              </div>
              <ul className="space-y-1.5 text-sm">
                {reports.slice(0, 6).map(r => (
                  <li key={r.id}>
                    <Link href={`/hris/employees/${r.id}`} className="text-slate-700 hover:text-emerald-700">
                      {r.person?.name ?? 'Unknown'}
                      <span className="ml-2 text-xs text-slate-400">{r.person?.email ?? ''}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Two-column: my recent timeline + my time-off */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Your recent activity</h2>
            <Link href="/me/timeline" className="text-xs text-emerald-700 hover:underline">View all →</Link>
          </div>
          {recentEvents.length === 0 ? (
            <p className="py-2 text-sm text-slate-400">No events yet.</p>
          ) : (
            <ol className="space-y-2 text-sm">
              {recentEvents.map(e => (
                <li key={e.id} className="flex items-baseline justify-between gap-3">
                  <span className="text-slate-700">{eventTitle(e.event_type)}</span>
                  <span className="shrink-0 text-xs text-slate-400">{fmt(e.occurred_at)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Your time off</h2>
            <Link href="/me/time-off" className="text-xs text-emerald-700 hover:underline">View all →</Link>
          </div>
          {myTimeOff.length === 0 ? (
            <p className="py-2 text-sm text-slate-400">No requests yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {myTimeOff.map(r => (
                <li key={r.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-slate-700 capitalize">
                    {r.request_type} · {r.start_date === r.end_date ? r.start_date : `${r.start_date} → ${r.end_date}`}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400 capitalize">{r.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Quick "request time off" CTA */}
      <div className="mt-6 flex items-center justify-end gap-3">
        <Link
          href="/me/time-off"
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          <Calendar className="h-4 w-4" />
          Request time off
        </Link>
      </div>
    </div>
  )
}
