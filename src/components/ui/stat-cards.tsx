import type { ReactNode } from 'react'
import { STAT_TONE, type StatTone } from '@/lib/ui/stat-tones'

// One summary stage card. `value` is the count; `icon` is a lucide icon element
// (sized by the card); `tone` picks the warm tint from stat-tones.
export interface StatCardDef {
  key:   string
  label: string
  value: number
  tone:  StatTone
  icon:  ReactNode
}

// Static column classes so Tailwind keeps them (no dynamic string interpolation).
const COLS: Record<number, string> = {
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-4',
  5: 'sm:grid-cols-5',
  6: 'sm:grid-cols-6',
}

/**
 * Shared summary stat cards for the list pages (Jobs, Requisitions). Each stage is
 * a compact tile: the stage icon in a small tinted chip on the left, with the count
 * and label stacked beside it. Identical type, size, and alignment on every page.
 */
export function StatCards({ cards }: { cards: StatCardDef[] }) {
  return (
    <div className={`grid grid-cols-2 ${COLS[cards.length] ?? 'sm:grid-cols-5'} gap-3`}>
      {cards.map(c => {
        const t = STAT_TONE[c.tone]
        return (
          <div key={c.key} className={`flex items-center gap-3 rounded-xl border p-4 transition-all ${t.fill} ${t.border}`}>
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/55 ${t.ink} [&>svg]:h-[21px] [&>svg]:w-[21px]`}>
              {c.icon}
            </span>
            <div className="min-w-0">
              <p className={`text-2xl font-bold leading-none tabular-nums ${t.ink}`}>{c.value}</p>
              <p className={`mt-1 truncate text-xs font-medium ${t.sub}`}>{c.label}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
