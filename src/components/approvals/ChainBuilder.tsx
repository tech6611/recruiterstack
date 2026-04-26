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

type ApproverType = 'user' | 'role' | 'hiring_team_member'
type TargetType   = 'opening' | 'job' | 'offer'

interface StepDraft {
  step_index:    number
  name:          string
  approver_type: ApproverType
  approver_user_id?: string
  approver_role?:    string
  approver_team_role?: string
  min_approvals: number
  sla_hours?:    number
}

interface MemberLite { id: string; users: { id: string; full_name: string | null; email: string } | null }

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
  step_index: i, name: '', approver_type: 'user', min_approvals: 1,
})

export function ChainBuilder({ mode, chainId, initial }: Props) {
  const router = useRouter()
  const [name,    setName]    = useState(initial?.name ?? '')
  const [desc,    setDesc]    = useState(initial?.description ?? '')
  const [target,  setTarget]  = useState<TargetType>(initial?.target_type ?? 'opening')
  const [active,  setActive]  = useState(initial?.is_active ?? true)
  const [steps,   setSteps]   = useState<StepDraft[]>(initial?.steps ?? [EMPTY_STEP(0)])
  const [members, setMembers] = useState<MemberLite[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch('/api/team').then(r => r.json()).then(({ data }) => setMembers(data ?? []))
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
    setSteps(next.map((s, k) => ({ ...s, step_index: k })))
  }

  async function save() {
    if (!name.trim())  { toast.error('Name is required'); return }
    if (steps.length === 0) { toast.error('At least one step is required'); return }
    for (const s of steps) {
      if (!s.name.trim()) { toast.error(`Step ${s.step_index + 1} needs a name`); return }
      const value = s.approver_type === 'user' ? s.approver_user_id
                  : s.approver_type === 'role' ? s.approver_role
                  : s.approver_team_role
      if (!value) { toast.error(`Step ${s.step_index + 1} needs an approver`); return }
    }

    const payloadSteps = steps.map(s => ({
      step_index:        s.step_index,
      name:              s.name.trim(),
      step_type:         'sequential' as const,
      approver_type:     s.approver_type,
      approver_value:
        s.approver_type === 'user'                ? { user_id: s.approver_user_id }
        : s.approver_type === 'role'              ? { role: s.approver_role }
        : /* hiring_team_member */                  { role: s.approver_team_role },
      min_approvals: s.min_approvals,
      sla_hours:     s.sla_hours ?? null,
    }))

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
          <CardDescription>Picked when a target matches its scope. Currently scope = simple target_type filter.</CardDescription>
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
          <CardDescription>Sequential. (Parallel + conditional are coming in a later phase.)</CardDescription>
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

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Approver type</Label>
                    <Select value={s.approver_type} onChange={e => update(i, { approver_type: e.target.value as ApproverType })}>
                      <option value="user">User (specific person)</option>
                      <option value="role">Org role</option>
                      <option value="hiring_team_member">Hiring team role</option>
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
