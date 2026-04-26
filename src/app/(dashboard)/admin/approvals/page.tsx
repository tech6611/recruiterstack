'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface Chain {
  id:           string
  name:         string
  description:  string | null
  target_type:  'opening' | 'job' | 'offer'
  is_active:    boolean
  updated_at:   string
}

export default function ApprovalChainsListPage() {
  const [items, setItems]   = useState<Chain[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch('/api/admin/approval-chains')
      .then(r => r.json())
      .then(({ data }) => { setItems(data ?? []); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Approval chains</h1>
          <p className="text-sm text-slate-500 mt-1">Templates picked when a target is submitted for approval.</p>
        </div>
        <Link href="/admin/approvals/new">
          <Button><Plus className="h-4 w-4" /> New chain</Button>
        </Link>
      </div>

      {!loaded ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : items.length === 0 ? (
        <Card><CardContent><p className="py-8 text-center text-sm text-slate-500">No chains yet.</p></CardContent></Card>
      ) : (
        <div className="space-y-2">
          {items.map(c => (
            <Link key={c.id} href={`/admin/approvals/${c.id}`}>
              <Card className={cn('hover:shadow-md transition-shadow', !c.is_active && 'opacity-50')}>
                <CardContent>
                  <div className="flex items-center justify-between py-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900">{c.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5 capitalize">{c.target_type} · {c.description ?? 'no description'}</div>
                    </div>
                    <span className="text-[10px] uppercase font-semibold text-slate-400">
                      {c.is_active ? `Updated ${new Date(c.updated_at).toLocaleDateString()}` : 'Archived'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
