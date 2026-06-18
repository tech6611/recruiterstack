'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, ShieldCheck, Trash2, Pencil, X, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { CAPABILITIES, isCapability, type Capability } from '@/lib/permissions'

// ── API shapes (mirror src/modules/core/domain/roles.ts) ─────────────────────

interface RoleWithCapabilities {
  id: string
  name: string
  description: string | null
  is_system: boolean
  is_owner: boolean
  capabilities: string[]
}

interface MemberWithRoles {
  user_id: string
  name: string
  email: string | null
  org_role: string
  role_ids: string[]
  overrides: Array<{ capability: string; effect: string }>
}

// ── Capability grid model ─────────────────────────────────────────────────────
// CAPABILITIES are "<module>:<action>" strings. We pivot them into a grid:
// rows = modules (the prefix), columns = the fixed action set view/edit/approve.
// A cell only renders when that module actually declares that action.

const ACTIONS = ['view', 'edit', 'approve'] as const
type Action = (typeof ACTIONS)[number]

interface ModuleRow {
  module: string
  label: string
  caps: Partial<Record<Action, Capability>>
}

function buildGrid(): ModuleRow[] {
  const byModule = new Map<string, ModuleRow>()
  for (const cap of CAPABILITIES) {
    const [module, action] = cap.split(':') as [string, Action]
    let row = byModule.get(module)
    if (!row) {
      row = { module, label: prettyModule(module), caps: {} }
      byModule.set(module, row)
    }
    row.caps[action] = cap
  }
  return Array.from(byModule.values())
}

function prettyModule(module: string): string {
  return module
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

const GRID = buildGrid()

// ──────────────────────────────────────────────────────────────────────────────

export default function PermissionsPage() {
  const [roles, setRoles] = useState<RoleWithCapabilities[]>([])
  const [members, setMembers] = useState<MemberWithRoles[]>([])
  const [loaded, setLoaded] = useState(false)

  async function refresh() {
    const [r, m] = await Promise.all([
      fetch('/api/admin/roles').then(x => x.json()).catch(() => ({ data: [] })),
      fetch('/api/admin/members').then(x => x.json()).catch(() => ({ data: [] })),
    ])
    setRoles(r.data ?? [])
    setMembers(m.data ?? [])
    setLoaded(true)
  }

  useEffect(() => { refresh() }, [])

  const rolesById = useMemo(() => {
    const map = new Map<string, RoleWithCapabilities>()
    for (const role of roles) map.set(role.id, role)
    return map
  }, [roles])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-200">
          <ShieldCheck className="h-5 w-5 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Team &amp; Permissions</h1>
          <p className="text-sm text-slate-500 mt-0.5">Define roles, set what each can do, and assign them to members.</p>
        </div>
      </div>

      {!loaded ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : (
        <div className="space-y-10">
          <RolesSection roles={roles} onChanged={refresh} />
          <MembersSection members={members} roles={roles} rolesById={rolesById} onChanged={refresh} />
        </div>
      )}
    </div>
  )
}

// ── Roles section ─────────────────────────────────────────────────────────────

function RolesSection({
  roles,
  onChanged,
}: {
  roles: RoleWithCapabilities[]
  onChanged: () => void
}) {
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Roles</h2>
        {!creating && (
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Create role
          </Button>
        )}
      </div>

      {creating && (
        <Card className="mb-3 border-emerald-200">
          <CardContent>
            <RoleForm
              onCancel={() => setCreating(false)}
              onSaved={() => { setCreating(false); onChanged() }}
            />
          </CardContent>
        </Card>
      )}

      {roles.length === 0 ? (
        <Card><CardContent><p className="py-8 text-center text-sm text-slate-500">No roles yet.</p></CardContent></Card>
      ) : (
        <div className="space-y-2">
          {roles.map(role =>
            editingId === role.id ? (
              <Card key={role.id} className="border-emerald-200">
                <CardContent>
                  <RoleForm
                    role={role}
                    onCancel={() => setEditingId(null)}
                    onSaved={() => { setEditingId(null); onChanged() }}
                  />
                </CardContent>
              </Card>
            ) : (
              <RoleRow
                key={role.id}
                role={role}
                onEdit={() => setEditingId(role.id)}
                onChanged={onChanged}
              />
            ),
          )}
        </div>
      )}
    </section>
  )
}

function RoleRow({
  role,
  onEdit,
  onChanged,
}: {
  role: RoleWithCapabilities
  onEdit: () => void
  onChanged: () => void
}) {
  const [deleting, setDeleting] = useState(false)
  const readOnly = role.is_system

  async function del() {
    if (!confirm(`Delete role "${role.name}"? Members assigned to it will lose its capabilities.`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/roles/${role.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Could not delete role')
        return
      }
      toast.success('Role deleted')
      onChanged()
    } finally {
      setDeleting(false)
    }
  }

  const capCount = role.is_owner ? CAPABILITIES.length : role.capabilities.filter(isCapability).length

  return (
    <Card>
      <CardContent>
        <div className="flex items-center justify-between gap-3 py-1">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              {role.name}
              {role.is_owner && (
                <span className="text-[10px] uppercase font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                  Owner
                </span>
              )}
              {role.is_system && (
                <span className="text-[10px] uppercase font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">
                  System
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {role.description ?? 'No description'}
              {' · '}
              {role.is_owner ? 'All capabilities' : `${capCount} ${capCount === 1 ? 'capability' : 'capabilities'}`}
            </div>
          </div>
          {!readOnly ? (
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="ghost" onClick={onEdit}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
              <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={del} loading={deleting}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <span className="text-[10px] uppercase font-semibold text-slate-400">Read-only</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function RoleForm({
  role,
  onCancel,
  onSaved,
}: {
  role?: RoleWithCapabilities
  onCancel: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(role?.name ?? '')
  const [description, setDescription] = useState(role?.description ?? '')
  const [caps, setCaps] = useState<Set<string>>(() => new Set(role?.capabilities.filter(isCapability) ?? []))
  const [saving, setSaving] = useState(false)

  const isEdit = !!role

  function toggle(cap: Capability) {
    setCaps(prev => {
      const next = new Set(prev)
      if (next.has(cap)) next.delete(cap)
      else next.add(cap)
      return next
    })
  }

  function toggleColumn(action: Action) {
    const colCaps = GRID.map(r => r.caps[action]).filter((c): c is Capability => !!c)
    const allOn = colCaps.every(c => caps.has(c))
    setCaps(prev => {
      const next = new Set(prev)
      for (const c of colCaps) {
        if (allOn) next.delete(c)
        else next.add(c)
      }
      return next
    })
  }

  async function save() {
    if (!name.trim()) {
      toast.error('Role name is required')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        capabilities: Array.from(caps),
      }
      const res = await fetch(
        isEdit ? `/api/admin/roles/${role!.id}` : '/api/admin/roles',
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Could not save role')
        return
      }
      toast.success(isEdit ? 'Role updated' : 'Role created')
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Name</label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Recruiting Lead" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Description</label>
          <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional" />
        </div>
      </div>

      <CapabilityGrid caps={caps} onToggle={toggle} onToggleColumn={toggleColumn} />

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={save} loading={saving}>
          <Check className="h-4 w-4" /> {isEdit ? 'Save changes' : 'Create role'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
          <X className="h-4 w-4" /> Cancel
        </Button>
      </div>
    </div>
  )
}

function CapabilityGrid({
  caps,
  onToggle,
  onToggleColumn,
}: {
  caps: Set<string>
  onToggle: (cap: Capability) => void
  onToggleColumn: (action: Action) => void
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
              Module
            </th>
            {ACTIONS.map(action => (
              <th key={action} className="px-3 py-2 text-center w-24">
                <button
                  type="button"
                  onClick={() => onToggleColumn(action)}
                  className="text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-emerald-700 transition-colors"
                  title={`Toggle all ${action}`}
                >
                  {action}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {GRID.map(row => (
            <tr key={row.module} className="border-b border-slate-100 last:border-0">
              <td className="px-3 py-2 font-medium text-slate-700">{row.label}</td>
              {ACTIONS.map(action => {
                const cap = row.caps[action]
                if (!cap) {
                  return <td key={action} className="px-3 py-2 text-center text-slate-300">–</td>
                }
                const checked = caps.has(cap)
                return (
                  <td key={action} className="px-3 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => onToggle(cap)}
                      aria-pressed={checked}
                      aria-label={cap}
                      className={cn(
                        'inline-flex h-5 w-5 items-center justify-center rounded-md border transition-colors',
                        checked
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'border-slate-300 bg-white hover:border-emerald-400',
                      )}
                    >
                      {checked && <Check className="h-3.5 w-3.5" />}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Members section ───────────────────────────────────────────────────────────

function MembersSection({
  members,
  roles,
  rolesById,
  onChanged,
}: {
  members: MemberWithRoles[]
  roles: RoleWithCapabilities[]
  rolesById: Map<string, RoleWithCapabilities>
  onChanged: () => void
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">Members</h2>
      {members.length === 0 ? (
        <Card><CardContent><p className="py-8 text-center text-sm text-slate-500">No members yet.</p></CardContent></Card>
      ) : (
        <div className="space-y-2">
          {members.map(member => (
            <MemberRow
              key={member.user_id}
              member={member}
              roles={roles}
              rolesById={rolesById}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function MemberRow({
  member,
  roles,
  rolesById,
  onChanged,
}: {
  member: MemberWithRoles
  roles: RoleWithCapabilities[]
  rolesById: Map<string, RoleWithCapabilities>
  onChanged: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const assigned = member.role_ids
  const available = roles.filter(r => !assigned.includes(r.id))

  async function addRole(roleId: string) {
    if (!roleId) return
    setBusy(roleId)
    setAdding(false)
    try {
      const res = await fetch(`/api/admin/members/${member.user_id}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Could not assign role')
        return
      }
      onChanged()
    } finally {
      setBusy(null)
    }
  }

  async function removeRole(roleId: string) {
    setBusy(roleId)
    try {
      const res = await fetch(`/api/admin/members/${member.user_id}/roles?roleId=${encodeURIComponent(roleId)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? 'Could not remove role')
        return
      }
      onChanged()
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <CardContent>
        <div className="flex items-start justify-between gap-3 py-1">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              {member.name}
              {/* Only surface the legacy base role when it's meaningful (admin).
                  The generic recruiter/hiring_manager/interviewer base roles are
                  superseded by the RBAC role chips below and just confuse here. */}
              {member.org_role === 'admin' && (
                <span className="text-[10px] uppercase font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">
                  {member.org_role}
                </span>
              )}
            </div>
            {member.email && <div className="text-xs text-slate-500 mt-0.5">{member.email}</div>}

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {assigned.length === 0 && (
                <span className="text-xs text-slate-400">No roles assigned</span>
              )}
              {assigned.map(roleId => {
                const role = rolesById.get(roleId)
                return (
                  <span
                    key={roleId}
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
                  >
                    {role?.name ?? 'Unknown role'}
                    <button
                      type="button"
                      onClick={() => removeRole(roleId)}
                      disabled={busy === roleId}
                      className="text-emerald-500 hover:text-emerald-800 disabled:opacity-50"
                      aria-label={`Remove ${role?.name ?? 'role'}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )
              })}

              {member.overrides.length > 0 && (
                <span className="text-[10px] uppercase font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                  {member.overrides.length} override{member.overrides.length === 1 ? '' : 's'}
                </span>
              )}
            </div>
          </div>

          <div className="shrink-0">
            {adding ? (
              <select
                autoFocus
                defaultValue=""
                onChange={e => addRole(e.target.value)}
                onBlur={() => setAdding(false)}
                className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="" disabled>Select role…</option>
                {available.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAdding(true)}
                disabled={available.length === 0 || busy !== null}
              >
                <Plus className="h-4 w-4" /> Add role
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
