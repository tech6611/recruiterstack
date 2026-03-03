'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Plus, Loader2, Clock, Mail, CheckCircle, FileText, Send } from 'lucide-react'
import type { HiringRequest, HiringRequestStatus } from '@/lib/types/database'

const STATUS_CONFIG: Record<HiringRequestStatus, { label: string; color: string; icon: React.ReactNode }> = {
  intake_pending:   { label: 'Awaiting HM',        color: 'bg-amber-50 text-amber-700 border-amber-200',   icon: <Clock className="h-3 w-3" /> },
  intake_submitted: { label: 'Intake Received',    color: 'bg-blue-50 text-blue-700 border-blue-200',      icon: <FileText className="h-3 w-3" /> },
  jd_generated:    { label: 'JD Generated',        color: 'bg-violet-50 text-violet-700 border-violet-200', icon: <FileText className="h-3 w-3" /> },
  jd_sent:         { label: 'JD Sent for Review',  color: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: <Mail className="h-3 w-3" /> },
  jd_approved:     { label: 'JD Ready — Review',   color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle className="h-3 w-3" /> },
  posted:          { label: 'Posted',              color: 'bg-slate-50 text-slate-600 border-slate-200',   icon: <Send className="h-3 w-3" /> },
}

export default function HiringRequestsPage() {
  const [requests, setRequests] = useState<HiringRequest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/hiring-requests')
      .then(r => r.json())
      .then(d => { setRequests(d.data ?? []); setLoading(false) })
  }, [])

  return (
    <div className="p-8 max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Hiring Requests</h1>
          <p className="text-sm text-slate-500 mt-1">From intake to approved JD — all in one place</p>
        </div>
        <Link
          href="/hiring-requests/new"
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" />
          New Request
        </Link>
      </div>

      {/* Flow diagram */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-center gap-0 overflow-x-auto text-xs">
        {[
          { label: 'Recruiter creates', sub: 'request' },
          { label: 'HM gets', sub: 'intake link' },
          { label: 'HM fills details', sub: '& writes JD' },
          { label: 'Ticket submitted', sub: 'recruiter notified' },
          { label: 'Ready', sub: 'to post' },
        ].map((step, i) => (
          <div key={i} className="flex items-center shrink-0">
            <div className="text-center px-3 py-1">
              <div className="font-semibold text-slate-700">{step.label}</div>
              <div className="text-slate-400">{step.sub}</div>
            </div>
            {i < 4 && <div className="text-slate-300 font-light text-base px-1">→</div>}
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
        </div>
      ) : requests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-16 text-center">
          <FileText className="h-10 w-10 text-slate-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">No hiring requests yet</p>
          <p className="text-xs text-slate-400 mt-1 mb-4">Create one to kick off the JD generation flow</p>
          <Link
            href="/hiring-requests/new"
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            New Request
          </Link>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Position</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Hiring Manager</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Created</th>
              </tr>
            </thead>
            <tbody>
              {requests.map(r => {
                const s = STATUS_CONFIG[r.status]
                return (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-sm text-slate-900">{r.position_title}</p>
                      {r.department && <p className="text-xs text-slate-400 mt-0.5">{r.department}</p>}
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm text-slate-700">{r.hiring_manager_name}</p>
                      <p className="text-xs text-slate-400">{r.hiring_manager_email}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${s.color}`}>
                        {s.icon}{s.label}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-400">
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
