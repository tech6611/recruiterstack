'use client'

import { Fragment } from 'react'
import { Users, MessagesSquare, FileText, UserCheck, ChevronRight } from 'lucide-react'
import type { StageZone } from '@/lib/pipeline/zones'
import { ZONE_SEQUENCE } from '@/lib/pipeline/zones'

// Ashby-style zone stepper used as a SELECTOR on the candidate board. Clicking a
// zone filters the board to that zone's interview-plan stages. The four zones and
// their order come from ZONE_SEQUENCE (lead → active → offer → completed), so this
// stays in lock-step with the pipeline plan.
const ZONE_META: Record<StageZone, { label: string; Icon: typeof Users }> = {
  lead:      { label: 'Lead',   Icon: Users },
  active:    { label: 'Active', Icon: MessagesSquare },
  offer:     { label: 'Offer',  Icon: FileText },
  completed: { label: 'Hired',  Icon: UserCheck },
}

export function ZoneSelector({
  counts, selected, onSelect,
}: {
  counts: Record<StageZone, number>
  selected: StageZone
  onSelect: (z: StageZone) => void
}) {
  return (
    <div className="mb-3 flex items-stretch rounded-2xl border border-[#e6e0d6] bg-slate-100/70 p-2">
      {ZONE_SEQUENCE.map((z, i) => {
        const { label, Icon } = ZONE_META[z]
        const n = counts[z] ?? 0
        const sel = z === selected
        return (
          <Fragment key={z}>
            <button
              type="button"
              onClick={() => onSelect(z)}
              aria-pressed={sel}
              className={`flex min-w-0 flex-1 basis-0 flex-col gap-0.5 rounded-xl bg-[#221b14] px-3.5 py-3 text-left transition-transform hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ebb137] ${
                sel ? 'ring-2 ring-[#ebb137]' : 'ring-2 ring-transparent'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#ebb137]/15 text-[#ebb137]">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className={`truncate text-[13px] font-bold tracking-tight ${sel ? 'text-white' : 'text-[#f4ede2]'}`}>
                  {label}
                </span>
              </div>
              <span className="pl-8 text-[11.5px] text-[#c9bda9]">{n} candidate{n === 1 ? '' : 's'}</span>
              <span className={`ml-8 mt-1.5 h-[3px] rounded ${sel ? 'bg-[#ebb137]' : 'bg-transparent'}`} />
            </button>
            {i < ZONE_SEQUENCE.length - 1 && (
              <span className="hidden items-center px-1.5 text-slate-300 sm:flex">
                <ChevronRight className="h-4 w-4" />
              </span>
            )}
          </Fragment>
        )
      })}
    </div>
  )
}
