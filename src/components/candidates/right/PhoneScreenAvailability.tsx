'use client'

import { useState, useEffect, useMemo } from 'react'
import { CalendarClock } from 'lucide-react'

interface Slot { start: string; end: string }

interface Props {
  applicationId: string
}

// Recruiter-side view of the time windows a candidate submitted via their
// phone-screen scheduling link. Renders nothing until (and unless) the candidate
// has actually submitted, so applications without a pending screen stay clean.
export default function PhoneScreenAvailability({ applicationId }: Props) {
  const [slots, setSlots] = useState<Slot[]>([])
  const [tz, setTz] = useState<string | null>(null)
  const [submittedAt, setSubmittedAt] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch(`/api/applications/${applicationId}/phone-screen`)
      .then(r => r.json())
      .then(d => {
        if (!alive || !d?.submitted) return
        setSlots(Array.isArray(d.slots) ? d.slots : [])
        setTz(d.timezone ?? null)
        setSubmittedAt(d.submitted_at ?? null)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [applicationId])

  const groups = useMemo(() => {
    if (slots.length === 0) return []
    const zone = tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone
    const dayFmt  = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric' })
    const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' })
    const map = new Map<string, { label: string; times: string[] }>()
    for (const s of slots) {
      const d = new Date(s.start)
      const key = dayFmt.format(d)
      if (!map.has(key)) map.set(key, { label: key, times: [] })
      map.get(key)!.times.push(timeFmt.format(d))
    }
    return Array.from(map.values())
  }, [slots, tz])

  if (groups.length === 0) return null

  return (
    <div className="pt-3 border-t border-slate-100">
      <div className="flex items-center gap-1.5 mb-2">
        <CalendarClock className="h-3.5 w-3.5 text-emerald-600" />
        <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
          Preferred Call Times
          {tz ? <span className="font-normal normal-case text-emerald-600"> ({tz.replace(/_/g, ' ')})</span> : null}
        </p>
      </div>
      <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2.5 space-y-1.5">
        {groups.map(g => (
          <div key={g.label} className="flex gap-2 text-xs">
            <span className="font-medium text-emerald-900 shrink-0 w-24">{g.label}</span>
            <span className="text-emerald-700">{g.times.join(', ')}</span>
          </div>
        ))}
      </div>
      {submittedAt && (
        <p className="text-[10px] text-slate-400 mt-1.5">
          Submitted {new Date(submittedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </p>
      )}
    </div>
  )
}
