'use client'

import { useEffect, useState } from 'react'
import { Users, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { OrgRole } from '@/lib/types/requisitions'
import type { InviteRow } from '@/lib/validations/onboarding-invites'

interface MemberRow {
  id:          string
  user_id:     string
  role:        OrgRole
  is_active:   boolean
  onboarded_at: string | null
  users: {
    id:         string
    email:      string
    full_name:  string | null
    first_name: string | null
    last_name:  string | null
    avatar_url: string | null
  } | null
}

const MAX_INVITES = 10
const ROLE_LABELS: Record<OrgRole, string> = {
  admin:          'Admin',
  recruiter:      'Recruiter',
  hiring_manager: 'Hiring manager',
  interviewer:    'Interviewer',
}

export function TeamCard() {
  const [members, setMembers] = useState<MemberRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)

  async function refresh() {
    const res = await fetch('/api/team')
    const body = await res.json().catch(() => ({}))
    setMembers((body.data ?? []) as MemberRow[])
    setLoaded(true)
  }

  useEffect(() => { refresh() }, [])

  async function changeRole(id: string, role: OrgRole) {
    const res = await fetch(`/api/team/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Failed to change role')
      return
    }
    toast.success('Role updated')
    refresh()
  }

  async function toggleActive(id: string, nextActive: boolean) {
    const res = await fetch(`/api/team/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: nextActive }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Failed to update member')
      return
    }
    toast.success(nextActive ? 'Reactivated' : 'Deactivated')
    refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-4 w-4 text-sky-600" /> Team
        </CardTitle>
        <CardDescription>Manage roles and invite teammates. You can&rsquo;t demote the last admin.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex justify-end mb-3">
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <Plus className="h-4 w-4" /> Invite
          </Button>
        </div>

        {!loaded ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : members.length === 0 ? (
          <p className="text-xs text-slate-500">No members yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {members.map(m => {
              const displayName = m.users?.full_name || m.users?.email || 'Unknown user'
              return (
                <div key={m.id} className={cn('flex items-center justify-between gap-3 py-3', !m.is_active && 'opacity-50')}>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{displayName}</div>
                    <div className="text-xs text-slate-500 truncate">{m.users?.email}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Select
                      value={m.role}
                      onChange={e => changeRole(m.id, e.target.value as OrgRole)}
                      className="w-36"
                      disabled={!m.is_active}
                    >
                      {(Object.keys(ROLE_LABELS) as OrgRole[]).map(r => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </Select>
                    {m.is_active ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleActive(m.id, false)}
                        title="Deactivate member"
                      >
                        Deactivate
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => toggleActive(m.id, true)}>
                        Reactivate
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {inviteOpen && <InviteDialog onClose={() => { setInviteOpen(false); refresh() }} />}
      </CardContent>
    </Card>
  )
}

function InviteDialog({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<InviteRow[]>([{ email: '', role: 'recruiter' }])
  const [submitting, setSubmitting] = useState(false)

  function update(i: number, patch: Partial<InviteRow>) {
    setRows(prev => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  }
  function add()  { if (rows.length < MAX_INVITES) setRows(prev => [...prev, { email: '', role: 'recruiter' }]) }
  function drop(i: number) { setRows(prev => prev.filter((_, j) => j !== i)) }

  async function submit() {
    const invites = rows.filter(r => r.email.trim())
    if (invites.length === 0) return
    setSubmitting(true)
    const res = await fetch('/api/team/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invites }),
    })
    setSubmitting(false)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(body.error ?? 'Failed to send invites')
      return
    }
    const failed = ((body.results ?? []) as Array<{ ok: boolean }>).filter(r => !r.ok)
    if (failed.length) toast.warning(`${failed.length} invite(s) failed.`)
    else toast.success(`Sent ${invites.length} invite${invites.length === 1 ? '' : 's'}`)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-900">Invite teammates</h3>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4 text-slate-500 hover:text-slate-900" />
          </button>
        </div>
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                type="email"
                placeholder="teammate@acme.com"
                value={row.email}
                onChange={e => update(i, { email: e.target.value })}
                className="flex-1"
              />
              <Select value={row.role} onChange={e => update(i, { role: e.target.value as InviteRow['role'] })} className="w-40">
                <option value="recruiter">Recruiter</option>
                <option value="hiring_manager">Hiring manager</option>
                <option value="interviewer">Interviewer</option>
                <option value="admin">Admin</option>
              </Select>
              <button type="button" onClick={() => drop(i)} disabled={rows.length === 1} className="text-slate-400 hover:text-slate-900 disabled:opacity-30" aria-label="Remove">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-between items-center">
          <Button variant="outline" size="sm" onClick={add} disabled={rows.length >= MAX_INVITES}>
            <Plus className="h-4 w-4" /> Add
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={submit} loading={submitting}>Send</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
