'use client'

import { useEffect, useState } from 'react'
import { X, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Opening } from '@/lib/types/requisitions'

interface Props {
  jobId:         string
  alreadyLinked: Set<string>
  onClose:       (linkedSomething: boolean) => void
}

type OpeningLite = Pick<Opening, 'id' | 'title' | 'status' | 'department_id' | 'location_id'>

export function LinkOpeningDialog({ jobId, alreadyLinked, onClose }: Props) {
  const [items, setItems]   = useState<OpeningLite[]>([])
  const [loaded, setLoaded] = useState(false)
  const [q,      setQ]      = useState('')
  const [linkingId, setLinkingId] = useState<string | null>(null)
  const [linkedAny, setLinkedAny] = useState(false)

  useEffect(() => {
    fetch('/api/openings?limit=200')
      .then(r => r.json())
      .then(({ data }) => { setItems((data ?? []) as OpeningLite[]); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [])

  const candidates = items.filter(o =>
    !alreadyLinked.has(o.id) &&
    (o.status === 'draft' || o.status === 'pending_approval' || o.status === 'approved' || o.status === 'open')
    && (!q || o.title.toLowerCase().includes(q.trim().toLowerCase())),
  )

  async function link(opening: OpeningLite) {
    setLinkingId(opening.id)
    const res = await fetch(`/api/req-jobs/${jobId}/link-opening`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opening_id: opening.id }),
    })
    setLinkingId(null)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(body.error ?? 'Link failed'); return }
    toast.success('Linked')
    setLinkedAny(true)
    // Filter the linked one out of the candidates so the user can keep going.
    setItems(prev => prev.filter(o => o.id !== opening.id))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => onClose(linkedAny)}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-900">Link opening</h3>
          <button type="button" onClick={() => onClose(linkedAny)} aria-label="Close">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Search openings…" value={q} onChange={e => setQ(e.target.value)} className="pl-9" />
        </div>
        {!loaded ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : candidates.length === 0 ? (
          <p className="text-xs text-slate-500 py-4">No openings available to link.</p>
        ) : (
          <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200">
            {candidates.map(o => (
              <div key={o.id} className="flex items-center justify-between gap-3 px-3 py-2.5 border-b border-slate-100 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-900">{o.title}</div>
                  <div className={cn('text-[10px] uppercase font-semibold mt-0.5',
                    o.status === 'approved' ? 'text-emerald-700' : 'text-slate-500')}>
                    {o.status}
                  </div>
                </div>
                <Button size="sm" loading={linkingId === o.id} onClick={() => link(o)}>Link</Button>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <Button variant="outline" onClick={() => onClose(linkedAny)}>Done</Button>
        </div>
      </div>
    </div>
  )
}
