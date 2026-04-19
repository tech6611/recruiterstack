'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { submitOnboardingStep } from '@/lib/onboarding/client'
import type { InviteRow } from '@/lib/validations/onboarding-invites'

const MAX_INVITES = 10

export function InvitesForm() {
  const router = useRouter()
  const [rows, setRows] = useState<InviteRow[]>([{ email: '', role: 'recruiter' }])
  const [submitting, setSubmitting] = useState(false)

  function updateRow(i: number, patch: Partial<InviteRow>) {
    setRows(prev => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  }
  function addRow() {
    if (rows.length >= MAX_INVITES) return
    setRows(prev => [...prev, { email: '', role: 'recruiter' }])
  }
  function removeRow(i: number) {
    setRows(prev => prev.filter((_, j) => j !== i))
  }

  async function submit(skip: boolean) {
    setSubmitting(true)
    const invites = skip ? [] : rows.filter(r => r.email.trim())
    const res = await submitOnboardingStep('/api/onboarding/invites', { invites })
    setSubmitting(false)
    if (!res) return

    const payload = res as unknown as { ok: true; next: string; results?: Array<{ ok: boolean; email: string }> }
    const failed  = (payload.results ?? []).filter(r => !r.ok)
    if (failed.length > 0) {
      toast.warning(`${failed.length} invite(s) failed to send. You can try again from Settings.`)
    } else if (invites.length > 0) {
      toast.success(`Sent ${invites.length} invite${invites.length === 1 ? '' : 's'}.`)
    }
    router.push(payload.next)
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              type="email"
              placeholder="teammate@acme.com"
              value={row.email}
              onChange={e => updateRow(i, { email: e.target.value })}
              className="flex-1"
            />
            <Select
              value={row.role}
              onChange={e => updateRow(i, { role: e.target.value as InviteRow['role'] })}
              className="w-40"
            >
              <option value="recruiter">Recruiter</option>
              <option value="hiring_manager">Hiring manager</option>
              <option value="interviewer">Interviewer</option>
              <option value="admin">Admin</option>
            </Select>
            <Button type="button" variant="ghost" size="sm" onClick={() => removeRow(i)} disabled={rows.length === 1} aria-label="Remove row">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={rows.length >= MAX_INVITES}>
        <Plus className="h-4 w-4" /> Add another
      </Button>

      <p className="text-xs text-slate-500">
        Up to {MAX_INVITES} at a time. You can add more later from Settings → Team.
      </p>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => submit(true)} loading={submitting}>Skip</Button>
        <Button type="button" onClick={() => submit(false)} loading={submitting}>Send invites</Button>
      </div>
    </div>
  )
}
