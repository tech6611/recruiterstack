'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronDown, Loader2, Check } from 'lucide-react'
import { useCandidateProfile } from './CandidateProfileContext'

export default function ChangeStatusDropdown() {
  const { activeApps, reload } = useCandidateProfile()

  // Local state (not shared with rest of page)
  const [statusOpen, setStatusOpen] = useState(false)
  const [stages, setStages] = useState<{ id: string; name: string; color: string }[]>([])
  const [statusLoading, setStatusLoading] = useState(false)
  const statusRef = useRef<HTMLDivElement>(null)

  // Outside click handler
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const openStatusDropdown = async () => {
    setStatusOpen(true)
    if (stages.length > 0 || activeApps.length === 0) return
    const hrId = activeApps[0].hiring_request_id
    const res = await fetch(`/api/pipeline-stages?hiring_request_id=${hrId}`)
    if (res.ok) setStages((await res.json()).data ?? [])
  }

  const changeStatus = async (appId: string, type: 'stage' | 'status', value: string) => {
    setStatusLoading(true); setStatusOpen(false)
    await fetch(`/api/applications/${appId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(type === 'stage' ? { stage_id: value } : { status: value }),
    })
    setStatusLoading(false)
    await reload()
  }

  if (activeApps.length === 0) return null

  return (
    <div ref={statusRef} className="relative">
      <button
        onClick={() => openStatusDropdown()}
        disabled={statusLoading}
        aria-haspopup="true"
        aria-expanded={statusOpen}
        className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-sm disabled:opacity-60"
      >
        {statusLoading
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
        Change Status
      </button>

      {statusOpen && (
        <div role="menu" className="absolute top-full right-0 mt-1.5 z-30 w-56 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden">

          {/* Move to Stage */}
          <p className="px-3.5 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Move to Stage
          </p>
          {stages.length === 0 ? (
            <div className="px-3.5 pb-2 flex items-center gap-1.5 text-xs text-slate-400">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading stages…
            </div>
          ) : (
            stages.map(s => {
              const isCurrent = activeApps[0].stage_id === s.id
              return (
                <button
                  key={s.id}
                  onClick={() => changeStatus(activeApps[0].id, 'stage', s.id)}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-left hover:bg-slate-50 transition-colors ${isCurrent ? 'bg-slate-50' : ''}`}
                >
                  <span className={`h-2 w-2 rounded-full shrink-0 bg-${s.color}-400`} />
                  <span className="text-xs font-medium text-slate-700 flex-1">{s.name}</span>
                  {isCurrent && <Check className="h-3 w-3 text-violet-500 shrink-0" />}
                </button>
              )
            })
          )}

          {/* Mark As */}
          <div className="border-t border-slate-100 mt-1">
            <p className="px-3.5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Mark As</p>
            {([
              { value: 'hired',     label: '\u2705 Hired',     cls: 'text-emerald-700 hover:bg-emerald-50' },
              { value: 'rejected',  label: '\u274C Rejected',  cls: 'text-red-600    hover:bg-red-50'     },
              { value: 'withdrawn', label: '\uD83D\uDEB6 Withdrawn', cls: 'text-slate-600  hover:bg-slate-50'   },
            ] as const).map(opt => (
              <button
                key={opt.value}
                onClick={() => changeStatus(activeApps[0].id, 'status', opt.value)}
                className={`w-full flex items-center px-3.5 py-2 text-left transition-colors text-xs font-medium mb-0.5 ${opt.cls}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
