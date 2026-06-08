'use client'

import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useState } from 'react'
import { FileText, ExternalLink, Plus, Building2, User } from 'lucide-react'
import { flags } from '@/lib/flags'
import { inputCls, labelCls } from '@/lib/ui/styles'
import type { HrDocument, HrDocumentCategory } from '@/lib/types/database'

// Employees can only self-upload these categories. HR uploads everything else.
type EmployeeUploadCategory = 'id_proof' | 'certification' | 'other'

const SELF_CATEGORIES: { value: EmployeeUploadCategory; label: string }[] = [
  { value: 'id_proof',      label: 'ID / passport / driver\'s licence' },
  { value: 'certification', label: 'Certification' },
  { value: 'other',         label: 'Other' },
]

const CATEGORY_LABEL: Record<HrDocumentCategory, string> = {
  offer_letter:  'Offer letter',
  id_proof:      'ID',
  contract:      'Contract',
  certification: 'Certification',
  policy:        'Policy',
  payslip:       'Payslip',
  tax_form:      'Tax form',
  other:         'Other',
}

function expiryBadge(date: string | null): React.ReactNode {
  if (!date) return null
  const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000)
  if (days < 0) {
    return <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700 ring-1 ring-rose-200">Expired</span>
  }
  if (days <= 30) {
    return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700 ring-1 ring-amber-200">Expires in {days}d</span>
  }
  return <span className="text-xs text-slate-400">Expires {date}</span>
}

function DocRow({ d }: { d: HrDocument }) {
  return (
    <li className="flex items-start gap-3 py-3">
      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-900">{d.title}</p>
        <p className="mt-0.5 text-xs text-slate-500">{CATEGORY_LABEL[d.category]}{d.description ? ` — ${d.description}` : ''}</p>
        {d.expires_at && <div className="mt-1.5">{expiryBadge(d.expires_at)}</div>}
      </div>
      <a
        href={d.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
      >
        Open <ExternalLink className="h-3 w-3" />
      </a>
    </li>
  )
}

export default function MyDocumentsPage() {
  const { orgId } = useAuth()
  const [mine, setMine] = useState<HrDocument[]>([])
  const [orgLevel, setOrgLevel] = useState<HrDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  const [category, setCategory] = useState<EmployeeUploadCategory>('id_proof')
  const [title, setTitle]       = useState('')
  const [url, setUrl]           = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/me/documents')
    if (r.ok) {
      const j = await r.json()
      setMine((j.data?.mine ?? []) as HrDocument[])
      setOrgLevel((j.data?.orgLevel ?? []) as HrDocument[])
    }
    setLoading(false)
  }, [])

  useEffect(() => { if (orgId) fetchAll() }, [fetchAll, orgId])

  async function submit() {
    if (!title.trim() || !url.trim()) return
    setSubmitting(true); setError(null)
    const r = await fetch('/api/me/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        category,
        url: url.trim(),
        description: description.trim() || null,
        expires_at: expiresAt || null,
      }),
    })
    if (r.ok) {
      setOpen(false); setTitle(''); setUrl(''); setExpiresAt(''); setDescription(''); setCategory('id_proof')
      await fetchAll()
    } else {
      const j = await r.json().catch(() => ({}))
      setError(j.error ?? 'Failed to upload')
    }
    setSubmitting(false)
  }

  if (!flags.hris) return <div className="p-8 text-sm text-slate-500">The HRIS module is not enabled.</div>

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50">
            <FileText className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Your documents</h1>
            <p className="text-sm text-slate-500">Documents on file plus org-wide policies & handbooks.</p>
          </div>
        </div>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            Add document
          </button>
        )}
      </div>

      {open && (
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50/40 p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Add a document (link)</h2>
          <p className="mb-3 text-xs text-slate-500">
            Paste a shareable link from Google Drive, Dropbox, Notion, etc. We store the metadata; the file stays where it is.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className={labelCls}>Category</label>
              <select className={inputCls} value={category} onChange={e => setCategory(e.target.value as EmployeeUploadCategory)}>
                {SELF_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Title</label>
              <input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} placeholder="My passport" />
            </div>
            <div>
              <label className={labelCls}>Expires (optional)</label>
              <input type="date" className={inputCls} value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
            </div>
            <div className="sm:col-span-4">
              <label className={labelCls}>Link (URL)</label>
              <input className={inputCls} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://drive.google.com/…" />
            </div>
            <div className="sm:col-span-4">
              <label className={labelCls}>Description (optional)</label>
              <input className={inputCls} value={description} onChange={e => setDescription(e.target.value)} />
            </div>
          </div>
          {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => setOpen(false)} disabled={submitting} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
            <button onClick={submit} disabled={!title.trim() || !url.trim() || submitting} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Personal docs */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center gap-2">
            <User className="h-4 w-4 text-emerald-600" />
            <h2 className="text-sm font-semibold text-slate-900">On file for you ({mine.length})</h2>
          </div>
          {loading ? <p className="py-2 text-sm text-slate-400">Loading…</p>
            : mine.length === 0 ? <p className="py-2 text-sm text-slate-400">No documents on file yet.</p>
            : <ul className="divide-y divide-slate-100">{mine.map(d => <DocRow key={d.id} d={d} />)}</ul>}
        </div>

        {/* Org docs */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-slate-900">Org-wide ({orgLevel.length})</h2>
          </div>
          {loading ? <p className="py-2 text-sm text-slate-400">Loading…</p>
            : orgLevel.length === 0 ? <p className="py-2 text-sm text-slate-400">No org documents shared yet.</p>
            : <ul className="divide-y divide-slate-100">{orgLevel.map(d => <DocRow key={d.id} d={d} />)}</ul>}
        </div>
      </div>
    </div>
  )
}
