'use client'

import { useAuth } from '@clerk/nextjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileText, ExternalLink, Plus, Trash2 } from 'lucide-react'
import { flags } from '@/lib/flags'
import { inputCls, labelCls } from '@/lib/ui/styles'
import type { EmployeeStatus, HrDocument, HrDocumentCategory, HrDocumentVisibility } from '@/lib/types/database'

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

const CATEGORIES: HrDocumentCategory[] = [
  'offer_letter','id_proof','contract','certification','policy','payslip','tax_form','other',
]

type EmpInfo = { id: string; status: EmployeeStatus; person: { name: string; email: string } | null }

function expiryBadge(date: string | null): React.ReactNode {
  if (!date) return null
  const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000)
  if (days < 0)  return <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700 ring-1 ring-rose-200">Expired</span>
  if (days <= 30) return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700 ring-1 ring-amber-200">Expires in {days}d</span>
  return <span className="text-xs text-slate-400">Expires {date}</span>
}

export default function HrDocumentsAdminPage() {
  const { orgId } = useAuth()
  const [docs, setDocs] = useState<HrDocument[]>([])
  const [employees, setEmployees] = useState<Map<string, EmpInfo>>(new Map())
  const [loading, setLoading] = useState(true)
  const [empFilter, setEmpFilter] = useState<string>('all')           // 'all' | 'org' | <employee_id>
  const [catFilter, setCatFilter] = useState<HrDocumentCategory | 'all'>('all')

  // Upload form state.
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<'org' | string>('org')         // employee_id or 'org'
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [category, setCategory] = useState<HrDocumentCategory>('policy')
  const [visibility, setVisibility] = useState<HrDocumentVisibility>('employee')
  const [expiresAt, setExpiresAt] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (empFilter === 'org') params.set('employee_id', 'org')
    else if (empFilter !== 'all') params.set('employee_id', empFilter)
    if (catFilter !== 'all') params.set('category', catFilter)
    const [docRes, empRes] = await Promise.all([
      fetch(`/api/hris/documents${params.toString() ? `?${params}` : ''}`),
      fetch('/api/employees'),
    ])
    if (docRes.ok) setDocs(((await docRes.json()).data ?? []) as HrDocument[])
    if (empRes.ok) {
      const j = await empRes.json()
      const map = new Map<string, EmpInfo>()
      for (const e of (j.data ?? []) as EmpInfo[]) map.set(e.id, e)
      setEmployees(map)
    }
    setLoading(false)
  }, [empFilter, catFilter])

  useEffect(() => { if (orgId) fetchAll() }, [fetchAll, orgId])

  async function submit() {
    if (!title.trim() || !url.trim()) return
    setSubmitting(true); setError(null)
    const r = await fetch('/api/hris/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee_id: target === 'org' ? null : target,
        title: title.trim(),
        url: url.trim(),
        category,
        visibility,
        description: description.trim() || null,
        expires_at: expiresAt || null,
      }),
    })
    if (r.ok) {
      setOpen(false); setTitle(''); setUrl(''); setExpiresAt(''); setDescription('')
      setCategory('policy'); setVisibility('employee'); setTarget('org')
      await fetchAll()
    } else {
      const j = await r.json().catch(() => ({}))
      setError(j.error ?? 'Failed to save')
    }
    setSubmitting(false)
  }

  async function remove(id: string) {
    if (!confirm('Delete this document?')) return
    const r = await fetch(`/api/hris/documents/${id}`, { method: 'DELETE' })
    if (r.ok) await fetchAll()
  }

  const empOptions = useMemo(() => Array.from(employees.values())
    .filter(e => e.status !== 'terminated')
    .sort((a, b) => (a.person?.name ?? '').localeCompare(b.person?.name ?? '')), [employees])

  if (!flags.hris) return <div className="p-8 text-sm text-slate-500">The HRIS module is not enabled.</div>

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50">
            <FileText className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Documents</h1>
            <p className="text-sm text-slate-500">Per-employee files (offer letters, IDs, contracts) plus org-wide policies & handbooks.</p>
          </div>
        </div>
        {!open && (
          <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#221b14] px-3 py-2 text-sm font-semibold text-white hover:bg-[#33271b]">
            <Plus className="h-4 w-4" />
            Add document
          </button>
        )}
      </div>

      {open && (
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50/40 p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Add a document (link)</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className={labelCls}>For</label>
              <select className={inputCls} value={target} onChange={e => setTarget(e.target.value)}>
                <option value="org">Org-level (everyone)</option>
                {empOptions.map(e => (
                  <option key={e.id} value={e.id}>{e.person?.name ?? e.id}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Category</label>
              <select className={inputCls} value={category} onChange={e => setCategory(e.target.value as HrDocumentCategory)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Title</label>
              <input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} placeholder="Employment Agreement" />
            </div>
            <div>
              <label className={labelCls}>Visibility</label>
              <select className={inputCls} value={visibility} onChange={e => setVisibility(e.target.value as HrDocumentVisibility)}>
                <option value="employee">Employee can see</option>
                <option value="admin">HR-only</option>
              </select>
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
            <button onClick={submit} disabled={!title.trim() || !url.trim() || submitting} className="rounded-lg bg-[#221b14] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#33271b] disabled:opacity-50">
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-3">
        <select className={`${inputCls} max-w-xs`} value={empFilter} onChange={e => setEmpFilter(e.target.value)}>
          <option value="all">All documents</option>
          <option value="org">Org-level only</option>
          <optgroup label="Per employee">
            {empOptions.map(e => <option key={e.id} value={e.id}>{e.person?.name ?? e.id}</option>)}
          </optgroup>
        </select>
        <select className={`${inputCls} max-w-xs`} value={catFilter} onChange={e => setCatFilter(e.target.value as HrDocumentCategory | 'all')}>
          <option value="all">All categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Visibility</th>
              <th className="px-4 py-3">Expires</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">Loading…</td></tr>
            ) : docs.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">No documents.</td></tr>
            ) : docs.map(d => {
              const owner = d.employee_id ? (employees.get(d.employee_id)?.person?.name ?? 'Unknown') : 'Org-wide'
              return (
                <tr key={d.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{d.title}</div>
                    {d.description && <div className="text-xs text-slate-400">{d.description}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{owner}</td>
                  <td className="px-4 py-3 text-slate-600">{CATEGORY_LABEL[d.category]}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${d.visibility === 'admin' ? 'bg-slate-100 text-slate-600 ring-1 ring-slate-200' : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'}`}>
                      {d.visibility === 'admin' ? 'HR-only' : 'Visible'}
                    </span>
                  </td>
                  <td className="px-4 py-3">{expiryBadge(d.expires_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <a href={d.url} target="_blank" rel="noreferrer" className="mr-2 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                      Open <ExternalLink className="h-3 w-3" />
                    </a>
                    <button onClick={() => remove(d.id)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-rose-600 hover:bg-rose-50">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
