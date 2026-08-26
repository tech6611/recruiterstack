'use client'

import { Fragment } from 'react'
import { Users, ClipboardCheck, MessagesSquare, FileText, UserCheck, Archive, ChevronRight } from 'lucide-react'
import type { StageZone } from '@/lib/pipeline/zones'
import { ZONE_SEQUENCE } from '@/lib/pipeline/zones'

// The board's tab is a funnel zone plus a display-only "Archived" tab (rejected /
// withdrawn candidates). 'archived' is NOT a real StageZone — it lives only here.
export type BoardZone = StageZone | 'archived'
const TAB_SEQUENCE: readonly BoardZone[] = [...ZONE_SEQUENCE, 'archived']

// Ashby-style zone stepper used as a SELECTOR on the candidate board. Clicking a
// zone filters the board to that zone's interview-plan stages (or, for Archived,
// to rejected/withdrawn candidates). The funnel order comes from ZONE_SEQUENCE.
//
// Selected state uses the candidate-page tab treatment — a 3px green inset underline
// (#2f9e7b, matching CenterPanel's Summary/Activities tabs) rather than a gold ring.
// Boxes are compact so the bold gold chevrons between them carry the funnel flow.
const ZONE_META: Record<BoardZone, { label: string; Icon: typeof Users }> = {
  lead:               { label: 'Lead',               Icon: Users },
  application_review: { label: 'Application Review',  Icon: ClipboardCheck },
  active:             { label: 'Active',             Icon: MessagesSquare },
  offer:              { label: 'Offer',              Icon: FileText },
  completed:          { label: 'Hired',              Icon: UserCheck },
  archived:           { label: 'Archived',           Icon: Archive },
}

export function ZoneSelector({
  counts, selected, onSelect,
}: {
  counts: Record<BoardZone, number>
  selected: BoardZone
  onSelect: (z: BoardZone) => void
}) {
  return (
    <div className="mb-3 flex items-stretch rounded-2xl border border-[#e6e0d6] bg-slate-100/70 p-2">
      {TAB_SEQUENCE.map((z, i) => {
        const { label, Icon } = ZONE_META[z]
        const n = counts[z] ?? 0
        const sel = z === selected
        return (
          <Fragment key={z}>
            <button
              type="button"
              onClick={() => onSelect(z)}
              aria-pressed={sel}
              className={`flex min-w-0 flex-1 basis-0 flex-col gap-0.5 rounded-xl bg-[#221b14] px-3 py-2 text-left transition-transform hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2f9e7b] ${
                sel ? 'shadow-[inset_0_-3px_0_0_#2f9e7b]' : ''
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
            </button>
            {i < TAB_SEQUENCE.length - 1 && (
              <span className="hidden items-center px-2.5 text-[#ebb137] sm:flex">
                <ChevronRight className="h-5 w-5" strokeWidth={2.75} />
              </span>
            )}
          </Fragment>
        )
      })}
    </div>
  )
}
