'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, X, Globe, EyeOff, Link2, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { postingStatus, type PostingStatus } from '@/lib/postings/format'
import type { JobPosting, PostingChannel, JobStatus } from '@/lib/types/requisitions'

interface Props {
  jobId:     string
  jobStatus: JobStatus
}

const CHANNELS: PostingChannel[] = ['careers_page', 'linkedin', 'indeed', 'glassdoor', 'custom']

const STATUS_PILL: Record<PostingStatus, { label: string; className: string }> = {
  draft:    { label: 'Draft',    className: 'bg-slate-100 text-slate-600' },
  live:     { label: 'Live',     className: 'bg-emerald-100 text-emerald-800' },
  unlisted: { label: 'Unlisted', className: 'bg-amber-100 text-amber-800' },
}

interface LocationOption { id: string; name: string }

/** Public link for a live posting: /apply/p/<public_token>. Null before
 *  migration 143 (no token yet) or while the posting is a draft. */
function postingLink(p: JobPosting): string | null {
  if (!p.is_live || !p.public_token) return null
  if (typeof window === 'undefined') return `/apply/p/${p.public_token}`
  return `${window.location.origin}/apply/p/${p.public_token}`
}

export function PostingsTab({ jobId, jobStatus }: Props) {
  const [items, setItems]   = useState<JobPosting[]>([])
  const [loaded, setLoaded] = useState(false)
  const [open,  setOpen]    = useState<{ mode: 'add' } | { mode: 'edit'; row: JobPosting } | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

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
  async function copyLink(p: JobPosting) {
    const link = postingLink(p)
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(p.id)
      toast.success('Link copied')
      setTimeout(() => setCopied(c => (c === p.id ? null : c)), 2000)
    } catch {
      toast.error('Could not copy — select the link and copy it manually')
    }
  }

  const canPublish = jobStatus === 'open'

  return (
    <Card>
      <CardContent>
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Postings</h3>
            <p className="text-xs text-slate-500">
              Public ads — what candidates see. Listed postings appear on your careers page; unlisted ones work only via their direct link. Postings can only go live once the job is open.
            </p>
          </div>
          <Button size="sm" onClick={() => setOpen({ mode: 'add' })}><Plus className="h-4 w-4" /> New posting</Button>
        </div>

        {!loaded ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">No postings yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map(p => {
              const status = postingStatus(p)
              const pill = STATUS_PILL[status]
              const link = postingLink(p)
              return (
                <div key={p.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <button onClick={() => setOpen({ mode: 'edit', row: p })} className="text-sm font-semibold text-slate-900 hover:text-emerald-700 text-left">
                      {p.title}
                    </button>
                    <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-2">
                      <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold', pill.className)}>{pill.label}</span>
                      <span className="capitalize">{p.channel.replace('_', ' ')}</span>
                      {p.location_text && <span>· {p.location_text}</span>}
                      {p.show_compensation === false && <span>· comp hidden</span>}
                    </div>
                    {link && (
                      <div className="mt-1.5 flex items-center gap-1.5 min-w-0">
                        <Link2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <a href={link} target="_blank" rel="noreferrer" className="truncate text-xs text-emerald-700 hover:underline">{link}</a>
                        <button
                          type="button"
                          onClick={() => copyLink(p)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50 shrink-0"
                          aria-label="Copy posting link"
                        >
                          {copied === p.id ? <><Check className="h-3 w-3 text-emerald-600" /> Copied</> : 'Copy'}
                        </button>
                      </div>
                    )}
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
              )
            })}
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

const SOCIAL_MAX = 300

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
    visibility:   (row?.visibility ?? 'listed') as 'listed' | 'unlisted',
    location_id:  row?.location_id ?? '',
    show_compensation: row?.show_compensation ?? true,
    comp_min:     row?.comp_min != null ? String(row.comp_min) : '',
    comp_max:     row?.comp_max != null ? String(row.comp_max) : '',
    comp_currency: row?.comp_currency ?? '',
    social_description: row?.social_description ?? '',
  })
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch('/api/locations')
      .then(r => (r.ok ? r.json() : { data: [] }))
      .then(b => setLocations((b.data ?? []).map((l: LocationOption) => ({ id: l.id, name: l.name }))))
      .catch(() => setLocations([]))
  }, [])

  function parseComp(v: string): number | null | undefined {
    const t = v.trim().replace(/,/g, '')
    if (!t) return null
    const n = Number(t)
    return Number.isFinite(n) && n >= 0 ? n : undefined
  }

  async function submit() {
    if (!form.title.trim()) { toast.error('Title is required'); return }
    const compMin = parseComp(form.comp_min)
    const compMax = parseComp(form.comp_max)
    if (compMin === undefined || compMax === undefined) { toast.error('Compensation must be a number'); return }
    if (compMin != null && compMax != null && compMin > compMax) { toast.error('Maximum pay must be at least the minimum'); return }
    const currency = form.comp_currency.trim().toUpperCase()
    if (currency && !/^[A-Z]{3}$/.test(currency)) { toast.error('Currency must be a 3-letter code, e.g. USD'); return }
    if (form.social_description.length > SOCIAL_MAX) { toast.error(`Social description must be ${SOCIAL_MAX} characters or fewer`); return }

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
        visibility:   form.visibility,
        location_id:  form.location_id || null,
        show_compensation: form.show_compensation,
        comp_min:     compMin,
        comp_max:     compMax,
        comp_currency: currency || null,
        social_description: form.social_description.trim() || null,
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
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-900">{mode === 'add' ? 'New posting' : 'Edit posting'}</h3>
          <button type="button" onClick={onClose}><X className="h-4 w-4 text-slate-500" /></button>
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Senior Backend Engineer" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Channel</Label>
              <Select value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value as PostingChannel })}>
                {CHANNELS.map(c => <option key={c} value={c} className="capitalize">{c.replace('_', ' ')}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Visibility</Label>
              <Select value={form.visibility} onChange={e => setForm({ ...form, visibility: e.target.value as 'listed' | 'unlisted' })}>
                <option value="listed">Listed on careers page</option>
                <option value="unlisted">Unlisted — link only</option>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Location</Label>
            <Select value={form.location_id} onChange={e => setForm({ ...form, location_id: e.target.value })}>
              <option value="">— Use the job&rsquo;s location / text below —</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
            <Input value={form.location_text} onChange={e => setForm({ ...form, location_text: e.target.value })} placeholder="Free-text fallback, e.g. San Francisco, CA or Remote (US)" />
            <p className="text-[11px] text-slate-500">Pick a saved location, or type one. Shown on the careers page and apply page.</p>
          </div>
          <div className="space-y-1.5 rounded-xl border border-slate-200 p-3">
            <label className="flex items-center gap-2 text-sm text-slate-800">
              <input
                type="checkbox"
                checked={form.show_compensation}
                onChange={e => setForm({ ...form, show_compensation: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              Show compensation
            </label>
            <div className={cn('grid grid-cols-3 gap-2', !form.show_compensation && 'opacity-50')}>
              <div className="space-y-1">
                <Label className="text-xs">Min</Label>
                <Input inputMode="numeric" value={form.comp_min} onChange={e => setForm({ ...form, comp_min: e.target.value })} placeholder="120000" disabled={!form.show_compensation} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Max</Label>
                <Input inputMode="numeric" value={form.comp_max} onChange={e => setForm({ ...form, comp_max: e.target.value })} placeholder="150000" disabled={!form.show_compensation} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Currency</Label>
                <Input value={form.comp_currency} onChange={e => setForm({ ...form, comp_currency: e.target.value.toUpperCase() })} placeholder="USD" maxLength={3} disabled={!form.show_compensation} />
              </div>
            </div>
            <p className="text-[11px] text-slate-500">Leave blank to show the job&rsquo;s own range. Untick to hide pay on this posting.</p>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Social description</Label>
              <span className={cn('text-[11px]', form.social_description.length > SOCIAL_MAX ? 'text-red-600' : 'text-slate-400')}>
                {form.social_description.length}/{SOCIAL_MAX}
              </span>
            </div>
            <Textarea
              value={form.social_description}
              onChange={e => setForm({ ...form, social_description: e.target.value })}
              className="min-h-[60px]"
              placeholder="One or two lines shown when the link is shared on LinkedIn, Slack, WhatsApp…"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Public JD</Label>
            <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="min-h-[150px]" placeholder="Leave blank to use the job's description." />
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
