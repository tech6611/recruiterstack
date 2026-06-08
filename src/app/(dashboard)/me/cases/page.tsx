'use client'

import Link from 'next/link'
import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useState } from 'react'
import { LifeBuoy, Plus, Sparkles } from 'lucide-react'
import { flags } from '@/lib/flags'
import { inputCls, labelCls } from '@/lib/ui/styles'
import type { HrCase, HrCaseCategory, HrCaseStatus } from '@/lib/types/database'

const CATEGORIES: { value: HrCaseCategory; label: string }[] = [
  { value: 'leave',      label: 'Leave / Time off' },
  { value: 'comp',       label: 'Compensation / Payroll' },
  { value: 'benefits',   label: 'Benefits' },
  { value: 'docs',       label: 'Documents' },
  { value: 'manager',    label: 'Manager / Team' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'other',      label: 'Something else' },
]

const STATUS_BADGE: Record<HrCaseStatus, string> = {
  open:         'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  in_progress:  'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  resolved:     'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  closed:       'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
}

export default function MyCasesPage() {
  const { orgId } = useAuth()
  const [cases, setCases] = useState<HrCase[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<HrCaseCategory>('other')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/me/cases')
    if (r.ok) setCases(((await r.json()).data ?? []) as HrCase[])
    setLoading(false)
  }, [])

  useEffect(() => { if (orgId) fetchAll() }, [fetchAll, orgId])

  async function submit() {
    if (!subject.trim() || !body.trim()) return
    setSubmitting(true); setError(null)
    const r = await fetch('/api/me/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, subject: subject.trim(), body: body.trim() }),
    })
    if (r.ok) {
      setOpen(false); setSubject(''); setBody(''); setCategory('other')
      await fetchAll()
    } else {
      const j = await r.json().catch(() => ({}))
      setError(j.error ?? 'Failed to submit')
    }
    setSubmitting(false)
  }

  if (!flags.hris) return <div className="p-8 text-sm text-slate-500">The HRIS module is not enabled.</div>

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50">
            <LifeBuoy className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Your HR cases</h1>
            <p className="text-sm text-slate-500">
              Ask HR anything. Our AI takes a first pass from your own data &mdash; you usually get
              an instant answer.
            </p>
          </div>
        </div>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            Ask HR
          </button>
        )}
      </div>

      {open && (
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50/40 p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">New case</h2>
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Category</label>
              <select className={inputCls} value={category} onChange={e => setCategory(e.target.value as HrCaseCategory)}>
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Subject</label>
              <input className={inputCls} value={subject} onChange={e => setSubject(e.target.value)} placeholder="How many vacation days do I have left?" />
            </div>
            <div>
              <label className={labelCls}>Details</label>
              <textarea className={`${inputCls} min-h-[100px]`} value={body} onChange={e => setBody(e.target.value)} placeholder="Add any helpful context." />
            </div>
            {error && <p className="text-xs text-rose-600">{error}</p>}
            <p className="flex items-center gap-1.5 text-xs text-emerald-700">
              <Sparkles className="h-3.5 w-3.5" />
              We&rsquo;ll try to answer instantly using your records. HR sees it if you need a human.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                disabled={submitting}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={!subject.trim() || !body.trim() || submitting}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {submitting ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">Loading…</td></tr>
            ) : cases.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                No cases yet. Hit &ldquo;Ask HR&rdquo; to start one.
              </td></tr>
            ) : cases.map(c => (
              <tr
                key={c.id}
                onClick={() => location.assign(`/me/cases/${c.id}`)}
                className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
              >
                <td className="px-4 py-3">
                  <Link href={`/me/cases/${c.id}`} className="font-medium text-slate-900 hover:text-emerald-700">
                    {c.subject}
                  </Link>
                </td>
                <td className="px-4 py-3 capitalize text-slate-600">{c.category}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[c.status]}`}>
                    {c.status.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">{new Date(c.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
