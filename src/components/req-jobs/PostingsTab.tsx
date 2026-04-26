'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, X, Globe, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { JobPosting, PostingChannel, JobStatus } from '@/lib/types/requisitions'

interface Props {
  jobId:     string
  jobStatus: JobStatus
}

const CHANNELS: PostingChannel[] = ['careers_page', 'linkedin', 'indeed', 'glassdoor', 'custom']

export function PostingsTab({ jobId, jobStatus }: Props) {
  const [items, setItems]   = useState<JobPosting[]>([])
  const [loaded, setLoaded] = useState(false)
  const [open,  setOpen]    = useState<{ mode: 'add' } | { mode: 'edit'; row: JobPosting } | null>(null)

  async function refresh() {
    const res = await fetch(`/api/req-jobs/${jobId}/postings`)
    const body = await res.json()
    setItems(body.data ?? [])
    setLoaded(true)
  }
  useEffect(() => { refresh() }, [jobId])

  async function publish(id: string) {
    const res = await fetch(`/api/postings/${id}/publish`, { method: 'POST' })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Publish failed')
      return
    }
    toast.success('Posting is live')
    refresh()
  }
  async function unpublish(id: string) {
    const res = await fetch(`/api/postings/${id}/unpublish`, { method: 'POST' })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Unpublish failed')
      return
    }
    toast.success('Posting taken down')
    refresh()
  }
  async function remove(id: string) {
    if (!confirm('Delete this posting?')) return
    const res = await fetch(`/api/postings/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      toast.error('Delete failed')
      return
    }
    toast.success('Deleted')
    refresh()
  }

  const canPublish = jobStatus === 'open'

  return (
    <Card>
      <CardContent>
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Postings</h3>
            <p className="text-xs text-slate-500">Public ads. Postings can only go live once the job is open.</p>
          </div>
          <Button size="sm" onClick={() => setOpen({ mode: 'add' })}><Plus className="h-4 w-4" /> New posting</Button>
        </div>

        {!loaded ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">No postings yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map(p => (
              <div key={p.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <button onClick={() => setOpen({ mode: 'edit', row: p })} className="text-sm font-semibold text-slate-900 hover:text-emerald-700 text-left">
                    {p.title}
                  </button>
                  <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                    <span className="capitalize">{p.channel.replace('_', ' ')}</span>
                    {p.is_live && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">Live</span>}
                    {p.location_text && <span>· {p.location_text}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {p.is_live ? (
                    <Button size="sm" variant="outline" onClick={() => unpublish(p.id)}>
                      <EyeOff className="h-4 w-4" /> Unpublish
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => publish(p.id)} disabled={!canPublish} title={!canPublish ? 'Job must be open before publishing' : undefined}>
                      <Globe className="h-4 w-4" /> Publish
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => remove(p.id)} aria-label="Delete">
                    <Trash2 className="h-4 w-4 text-slate-400" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        {!canPublish && items.some(p => !p.is_live) && (
          <p className={cn('text-[11px] text-amber-700 mt-3')}>
            Publish the job first (job status must be &lsquo;open&rsquo;) before postings can go live.
          </p>
        )}
        {open && <PostingDialog jobId={jobId} mode={open.mode} row={open.mode === 'edit' ? open.row : undefined} onClose={() => { setOpen(null); refresh() }} />}
      </CardContent>
    </Card>
  )
}

function PostingDialog({ jobId, mode, row, onClose }: {
  jobId:   string
  mode:    'add' | 'edit'
  row?:    JobPosting
  onClose: () => void
}) {
  const [form, setForm] = useState({
    title:        row?.title ?? '',
    description:  row?.description ?? '',
    location_text: row?.location_text ?? '',
    channel:      (row?.channel ?? 'careers_page') as PostingChannel,
  })
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    if (!form.title.trim()) { toast.error('Title is required'); return }
    setSubmitting(true)
    const url    = mode === 'add' ? `/api/req-jobs/${jobId}/postings` : `/api/postings/${row?.id}`
    const method = mode === 'add' ? 'POST' : 'PATCH'
    const res = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title:        form.title.trim(),
        description:  form.description.trim() || null,
        location_text: form.location_text.trim() || null,
        channel:      form.channel,
      }),
    })
    setSubmitting(false)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(body.error ?? 'Save failed'); return }
    toast.success(mode === 'add' ? 'Posting created' : 'Saved')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-900">{mode === 'add' ? 'New posting' : 'Edit posting'}</h3>
          <button type="button" onClick={onClose}><X className="h-4 w-4 text-slate-500" /></button>
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Senior Backend Engineer" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Channel</Label>
            <Select value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value as PostingChannel })}>
              {CHANNELS.map(c => <option key={c} value={c} className="capitalize">{c.replace('_', ' ')}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Location text</Label>
            <Input value={form.location_text} onChange={e => setForm({ ...form, location_text: e.target.value })} placeholder="San Francisco, CA or Remote (US)" />
          </div>
          <div className="space-y-1.5">
            <Label>Public JD</Label>
            <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="min-h-[150px]" />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={submitting}>{mode === 'add' ? 'Create' : 'Save'}</Button>
        </div>
      </div>
    </div>
  )
}
