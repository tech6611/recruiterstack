'use client'

import { useEffect, useState } from 'react'
import { UsersRound, Plus, Trash2, X, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

interface GroupRow {
  id:           string
  name:         string
  description:  string | null
  is_active:    boolean
  member_count: number
}

interface MemberLite {
  id: string
  users: { id: string; email: string; full_name: string | null } | null
}

export function GroupsCard() {
  const [items, setItems]   = useState<GroupRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [open,   setOpen]   = useState<{ mode: 'add' } | { mode: 'edit'; row: GroupRow } | null>(null)

  async function refresh() {
    const res = await fetch('/api/admin/approval-groups')
    const body = await res.json()
    setItems(body.data ?? [])
    setLoaded(true)
  }
  useEffect(() => { refresh() }, [])

  async function archive(id: string) {
    if (!confirm('Archive this group?')) return
    const res = await fetch(`/api/admin/approval-groups/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Archive failed')
      return
    }
    toast.success('Archived')
    refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UsersRound className="h-4 w-4 text-indigo-600" /> Approval groups
        </CardTitle>
        <CardDescription>Reusable sets of approvers. Use them as the &ldquo;group&rdquo; approver type in chain steps.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex justify-end mb-3">
          <Button size="sm" onClick={() => setOpen({ mode: 'add' })}><Plus className="h-4 w-4" /> Add</Button>
        </div>
        {!loaded ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-slate-500">No groups yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map(g => (
              <div key={g.id} className={cn('flex items-center justify-between gap-3 py-2.5', !g.is_active && 'opacity-50')}>
                <div className="min-w-0 flex-1">
                  <button onClick={() => setOpen({ mode: 'edit', row: g })} className="text-sm font-medium text-slate-900 hover:text-emerald-700 text-left">
                    {g.name}
                  </button>
                  <span className="ml-2 text-xs text-slate-500">{g.member_count} member{g.member_count === 1 ? '' : 's'}</span>
                  {g.description && <span className="ml-2 text-xs text-slate-400">· {g.description}</span>}
                  {!g.is_active && <span className="ml-2 text-[10px] uppercase font-semibold text-slate-400">archived</span>}
                </div>
                {g.is_active && (
                  <Button variant="ghost" size="sm" onClick={() => archive(g.id)}><Trash2 className="h-4 w-4 text-slate-400" /></Button>
                )}
              </div>
            ))}
          </div>
        )}
        {open && <GroupDialog mode={open.mode} row={open.mode === 'edit' ? open.row : undefined} onClose={() => { setOpen(null); refresh() }} />}
      </CardContent>
    </Card>
  )
}

function GroupDialog({ mode, row, onClose }: { mode: 'add' | 'edit'; row?: GroupRow; onClose: () => void }) {
  const [name, setName] = useState(row?.name ?? '')
  const [desc, setDesc] = useState(row?.description ?? '')
  const [active, setActive] = useState(row?.is_active ?? true)
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set())
  const [team, setTeam] = useState<MemberLite[]>([])
  const [loaded, setLoaded] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch('/api/team').then(r => r.json()).then(({ data }) => setTeam(data ?? []))
    if (mode === 'edit' && row) {
      fetch(`/api/admin/approval-groups/${row.id}`)
        .then(r => r.json())
        .then(({ data }) => {
          const ids = new Set<string>((data?.members ?? []).map((m: { user_id: string }) => m.user_id))
          setMemberIds(ids)
          setLoaded(true)
        })
    } else {
      setLoaded(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggle(userId: string) {
    setMemberIds(prev => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  async function submit() {
    if (!name.trim()) { toast.error('Name is required'); return }
    setSubmitting(true)

    // 1) Create or update the group
    const url    = mode === 'add' ? '/api/admin/approval-groups' : `/api/admin/approval-groups/${row?.id}`
    const method = mode === 'add' ? 'POST' : 'PATCH'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), description: desc.trim() || null, is_active: active }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { setSubmitting(false); toast.error(body.error ?? 'Save failed'); return }

    const groupId = mode === 'add' ? body.data.id : row?.id

    // 2) Replace members
    const memRes = await fetch(`/api/admin/approval-groups/${groupId}/members`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_ids: Array.from(memberIds) }),
    })
    setSubmitting(false)
    if (!memRes.ok) {
      const err = await memRes.json().catch(() => ({}))
      toast.error(err.error ?? 'Members update failed')
      return
    }
    toast.success(mode === 'add' ? 'Group created' : 'Saved')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-900">{mode === 'add' ? 'New approval group' : 'Edit approval group'}</h3>
          <button type="button" onClick={onClose}><X className="h-4 w-4 text-slate-500" /></button>
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="VPs / Finance Reviewers" autoFocus /></div>
          <div className="space-y-1.5"><Label>Description (optional)</Label><Textarea value={desc} onChange={e => setDesc(e.target.value)} className="min-h-[60px]" /></div>
          <div className="space-y-1.5">
            <Label>Members</Label>
            {!loaded ? (
              <p className="text-xs text-slate-400">Loading…</p>
            ) : (
              <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200">
                {team.map(m => {
                  const u = m.users
                  if (!u) return null
                  const checked = memberIds.has(u.id)
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggle(u.id)}
                      className={cn('w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-50', checked && 'bg-emerald-50')}
                    >
                      <span className={cn('flex h-4 w-4 items-center justify-center rounded border', checked ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300')}>
                        {checked && <Check className="h-3 w-3" />}
                      </span>
                      <div className="flex-1">
                        <div className="text-sm text-slate-900">{u.full_name ?? u.email}</div>
                        <div className="text-xs text-slate-500">{u.email}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          {mode === 'edit' && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Active
            </label>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={submitting}>{mode === 'add' ? 'Create' : 'Save'}</Button>
        </div>
      </div>
    </div>
  )
}
