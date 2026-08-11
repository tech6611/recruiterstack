'use client'

import { useState, useEffect, useCallback } from 'react'
import { UserCog, Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { teamMemberName, type TeamMember } from '@/lib/team-members'

type ResolvedHM = { user_id: string | null; name: string | null; email: string | null; source: 'assigned' | 'intake' | 'none' }

/**
 * Assign a real team member as the job's hiring manager (Phase C1). Until one is
 * assigned, plan-change approvals fall back to an Owner/admin — hence the nudge.
 */
export function JobHiringManagerPicker({ jobId, onChange }: { jobId: string; onChange?: () => void }) {
  const [team, setTeam]       = useState<TeamMember[]>([])
  const [hm, setHm]           = useState<ResolvedHM | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [t, h] = await Promise.all([
      fetch('/api/team').then(r => r.json()).catch(() => null),
      fetch(`/api/jobs/${jobId}/hiring-manager`).then(r => r.json()).catch(() => null),
    ])
    setTeam((t?.data ?? []) as TeamMember[])
    setHm((h?.data ?? { user_id: null, name: null, email: null, source: 'none' }) as ResolvedHM)
    setLoading(false)
  }, [jobId])
  useEffect(() => { load() }, [load])

  const pick = async (userId: string) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/jobs/${jobId}/hiring-manager`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId || null }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || 'Failed to update') }
      toast.success('Hiring manager updated.')
      await load()
      onChange?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update')
    } finally { setSaving(false) }
  }

  const unassigned = !hm?.user_id
  const intakeLabel = hm?.name ? `Intake: ${hm.name} (not a user)` : '— none —'

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm"><UserCog className="h-4 w-4 text-slate-500" /> Hiring manager</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-slate-400" /></div>
        ) : (
          <div className="space-y-2">
            <Select value={hm?.user_id ?? ''} disabled={saving} onChange={e => pick(e.target.value)}>
              <option value="">{intakeLabel}</option>
              {team.map(m => <option key={m.user_id} value={m.user_id}>{teamMemberName(m)}</option>)}
            </Select>
            {unassigned && (
              <p className="flex items-start gap-1.5 text-xs text-amber-700">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Assign a real team member as hiring manager to route interview-plan approvals to them.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
