'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

type ApproverType = 'user' | 'role' | 'hiring_team_member' | 'group'
type TargetType   = 'opening' | 'job' | 'offer'
type ConditionOp  = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'exists'

interface StepDraft {
  step_index:    number
  name:          string
  approver_type: ApproverType
  approver_user_id?: string
  approver_role?:    string
  approver_team_role?: string
  approver_group_id?: string
  min_approvals: number
  sla_hours?:    number
  parallel_with_previous: boolean
  condition_field?: string
  condition_op?:    ConditionOp
  condition_value?: string
}

interface MemberLite { id: string; users: { id: string; full_name: string | null; email: string } | null }
interface GroupLite  { id: string; name: string; member_count: number }

interface Props {
  mode:       'new' | 'edit'
  chainId?:   string
  initial?:   {
    name:         string
    description:  string
    target_type:  TargetType
    is_active:    boolean
    steps:        StepDraft[]
  }
}

const EMPTY_STEP = (i: number): StepDraft => ({
  step_index: i, name: '', approver_type: 'user', min_approvals: 1, parallel_with_previous: false,
})

export function ChainBuilder({ mode, chainId, initial }: Props) {
  const router = useRouter()
  const [name,    setName]    = useState(initial?.name ?? '')
  const [desc,    setDesc]    = useState(initial?.description ?? '')
  const [target,  setTarget]  = useState<TargetType>(initial?.target_type ?? 'opening')
  const [active,  setActive]  = useState(initial?.is_active ?? true)
  const [steps,   setSteps]   = useState<StepDraft[]>(initial?.steps ?? [EMPTY_STEP(0)])
  const [members, setMembers] = useState<MemberLite[]>([])
  const [groups,  setGroups]  = useState<GroupLite[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch('/api/team').then(r => r.json()).then(({ data }) => setMembers(data ?? []))
    fetch('/api/admin/approval-groups').then(r => r.json()).then(({ data }) => setGroups(data ?? []))
  }, [])

  function update(i: number, patch: Partial<StepDraft>) {
    setSteps(prev => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  }
  function addStep() {
    setSteps(prev => [...prev, EMPTY_STEP(prev.length)])
  }
  function removeStep(i: number) {
    setSteps(prev => prev.filter((_, j) => j !== i).map((s, k) => ({ ...s, step_index: k })))
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= steps.length) return
    const next = [...steps]
    ;[next[i], next[j]] = [next[j], next[i]]
    // Step 0 can never be parallel-with-previous
    next[0].parallel_with_previous = false
    setSteps(next.map((s, k) => ({ ...s, step_index: k })))
  }

  async function save() {
    if (!name.trim())  { toast.error('Name is required'); return }
    if (steps.length === 0) { toast.error('At least one step is required'); return }
    for (const s of steps) {
      if (!s.name.trim()) { toast.error(`Step ${s.step_index + 1} needs a name`); return }
      const value = s.approver_type === 'user'  ? s.approver_user_id
                  : s.approver_type === 'role'  ? s.approver_role
                  : s.approver_type === 'group' ? s.approver_group_id
                  : s.approver_team_role
      if (!value) { toast.error(`Step ${s.step_index + 1} needs an approver`); return }
      if (s.condition_field && !s.condition_op) { toast.error(`Step ${s.step_index + 1}'s condition needs an operator`); return }
    }

    // Compute parallel_group_id by walking the steps. Each "parallel-with-previous"
    // step inherits the previous step's group id. The first step in a parallel run
    // assigns a fresh UUID-ish id; we use a simple "g-<index>" string. The DB column
    // is UUID-typed — generate proper UUIDs client-side.
    const groupIds = new Map<number, string>()        // step index → group id
    for (let i = 1; i < steps.length; i++) {
      if (steps[i].parallel_with_previous) {
        const existing = groupIds.get(i - 1) ?? crypto.randomUUID()
        groupIds.set(i - 1, existing)
        groupIds.set(i,     existing)
      }
    }

    const payloadSteps = steps.map(s => {
      const condition = s.condition_field && s.condition_op
        ? buildCondition(s.condition_field, s.condition_op, s.condition_value)
        : null

      return {
        step_index:        s.step_index,
        name:              s.name.trim(),
        step_type:         (groupIds.has(s.step_index) ? 'parallel' : 'sequential') as 'sequential' | 'parallel',
        parallel_group_id: groupIds.get(s.step_index) ?? null,
        condition,
        approver_type:     s.approver_type,
        approver_value:
          s.approver_type === 'user'                ? { user_id: s.approver_user_id }
          : s.approver_type === 'role'              ? { role: s.approver_role }
          : s.approver_type === 'group'             ? { group_id: s.approver_group_id }
          : /* hiring_team_member */                  { role: s.approver_team_role },
        min_approvals: s.min_approvals,
        sla_hours:     s.sla_hours ?? null,
      }
    })

    setSubmitting(true)
    const url    = mode === 'new' ? '/api/admin/approval-chains' : `/api/admin/approval-chains/${chainId}`
    const method = mode === 'new' ? 'POST' : 'PATCH'
    const body   = mode === 'new'
      ? { name: name.trim(), description: desc.trim() || null, target_type: target, is_active: active, steps: payloadSteps }
      : { name: name.trim(), description: desc.trim() || null, is_active: active, steps: payloadSteps }
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setSubmitting(false)
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(json.error ?? 'Save failed'); return }
    toast.success(mode === 'new' ? 'Chain created' : 'Saved')
    router.push('/admin/approvals')
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Chain details</CardTitle>
          <CardDescription>Picked when a target matches its scope.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Engineering Opening Approval" />
            </div>
            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Textarea value={desc} onChange={e => setDesc(e.target.value)} className="min-h-[60px]" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Target type</Label>
                <Select disabled={mode === 'edit'} value={target} onChange={e => setTarget(e.target.value as TargetType)}>
                  <option value="opening">Opening</option>
                  <option value="job">Job</option>
                  <option value="offer">Offer</option>
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700 mt-7">
                <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
                Active
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Steps</CardTitle>
          <CardDescription>
            Sequential by default. Use &ldquo;Parallel with previous step&rdquo; to run concurrently.
            Optional conditions skip a step if the target doesn&rsquo;t match.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {steps.map((s, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">{i + 1}</span>
                    <Input
                      placeholder="Step name (e.g. Hiring Manager)"
                      value={s.name}
                      onChange={e => update(i, { name: e.target.value })}
                      className="w-72"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => move(i, -1)} disabled={i === 0}>↑</Button>
                    <Button variant="ghost" size="sm" onClick={() => move(i,  1)} disabled={i === steps.length - 1}>↓</Button>
                    <Button variant="ghost" size="sm" onClick={() => removeStep(i)} disabled={steps.length === 1} aria-label="Remove">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {i > 0 && (
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={s.parallel_with_previous}
                      onChange={e => update(i, { parallel_with_previous: e.target.checked })}
                    />
                    Parallel with step {i} (runs at the same time)
                  </label>
                )}

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Approver type</Label>
                    <Select value={s.approver_type} onChange={e => update(i, { approver_type: e.target.value as ApproverType })}>
                      <option value="user">User (specific person)</option>
                      <option value="role">Org role</option>
                      <option value="hiring_team_member">Hiring team role</option>
                      <option value="group">Approval group</option>
                    </Select>
                  </div>

                  {s.approver_type === 'user' && (
                    <div className="space-y-1 col-span-2">
                      <Label className="text-xs">User</Label>
                      <Select value={s.approver_user_id ?? ''} onChange={e => update(i, { approver_user_id: e.target.value })}>
                        <option value="">—</option>
                        {members.map(m => (
                          <option key={m.id} value={m.users?.id ?? ''}>{m.users?.full_name ?? m.users?.email}</option>
                        ))}
                      </Select>
                    </div>
                  )}

                  {s.approver_type === 'role' && (
                    <div className="space-y-1 col-span-2">
                      <Label className="text-xs">Role</Label>
                      <Select value={s.approver_role ?? ''} onChange={e => update(i, { approver_role: e.target.value })}>
                        <option value="">—</option>
                        <option value="admin">Admin</option>
                        <option value="recruiter">Recruiter</option>
                        <option value="hiring_manager">Hiring Manager</option>
                      </Select>
                    </div>
                  )}

                  {s.approver_type === 'hiring_team_member' && (
                    <div className="space-y-1 col-span-2">
                      <Label className="text-xs">Hiring-team role</Label>
                      <Select value={s.approver_team_role ?? ''} onChange={e => update(i, { approver_team_role: e.target.value })}>
                        <option value="">—</option>
                        <option value="hiring_manager">Hiring manager</option>
                        <option value="recruiter">Recruiter</option>
                        <option value="recruiting_coordinator">Recruiting coordinator</option>
                        <option value="interviewer">Interviewer</option>
                        <option value="sourcer">Sourcer</option>
                      </Select>
                    </div>
                  )}

                  {s.approver_type === 'group' && (
                    <div className="space-y-1 col-span-2">
                      <Label className="text-xs">Group</Label>
                      <Select value={s.approver_group_id ?? ''} onChange={e => update(i, { approver_group_id: e.target.value })}>
                        <option value="">—</option>
                        {groups.map(g => (
                          <option key={g.id} value={g.id}>{g.name} · {g.member_count} member{g.member_count === 1 ? '' : 's'}</option>
                        ))}
                      </Select>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Min approvals</Label>
                    <Input type="number" min={1} value={s.min_approvals} onChange={e => update(i, { min_approvals: Number(e.target.value) || 1 })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">SLA (hours, optional)</Label>
                    <Input type="number" min={1} value={s.sla_hours ?? ''} onChange={e => update(i, { sla_hours: e.target.value ? Number(e.target.value) : undefined })} />
                  </div>
                </div>

                {/* Condition (simple flat: field + op + value) */}
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Condition (optional)</Label>
                    {s.condition_field && (
                      <Button variant="ghost" size="sm" onClick={() => update(i, { condition_field: undefined, condition_op: undefined, condition_value: undefined })}>Clear</Button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">If set, this step is skipped (not_applicable) when the target doesn&rsquo;t match.</p>
                  <div className="grid grid-cols-3 gap-2">
                    <Input placeholder="Field (e.g. comp_max)" value={s.condition_field ?? ''} onChange={e => update(i, { condition_field: e.target.value || undefined })} />
                    <Select value={s.condition_op ?? ''} onChange={e => update(i, { condition_op: (e.target.value || undefined) as ConditionOp | undefined })}>
                      <option value="">Op…</option>
                      <option value="eq">=</option>
                      <option value="neq">!=</option>
                      <option value="gt">&gt;</option>
                      <option value="gte">≥</option>
                      <option value="lt">&lt;</option>
                      <option value="lte">≤</option>
                      <option value="contains">contains</option>
                      <option value="exists">exists</option>
                    </Select>
                    {s.condition_op !== 'exists' && (
                      <Input placeholder="Value" value={s.condition_value ?? ''} onChange={e => update(i, { condition_value: e.target.value || undefined })} />
                    )}
                  </div>
                </div>
              </div>
            ))}

            <Button variant="outline" size="sm" onClick={addStep}><Plus className="h-4 w-4" /> Add step</Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => router.push('/admin/approvals')}>Cancel</Button>
        <Button onClick={save} loading={submitting}>{mode === 'new' ? 'Create chain' : 'Save'}</Button>
      </div>
    </div>
  )
}

/** Convert simple builder inputs into the JSON DSL the engine expects. */
function buildCondition(field: string, op: ConditionOp, raw: string | undefined): Record<string, unknown> {
  const leaf: Record<string, unknown> = { field, op }
  if (op === 'exists') return leaf
  // Try numeric coercion for comparison ops; fall back to string.
  if (op === 'gt' || op === 'gte' || op === 'lt' || op === 'lte') {
    const n = Number(raw ?? '')
    leaf.value = Number.isFinite(n) ? n : (raw ?? '')
  } else if (raw === 'true' || raw === 'false') {
    leaf.value = raw === 'true'
  } else if (raw !== undefined && raw !== '' && !isNaN(Number(raw))) {
    leaf.value = Number(raw)
  } else {
    leaf.value = raw ?? ''
  }
  return leaf
}
