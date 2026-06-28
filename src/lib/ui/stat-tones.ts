/**
 * Warm tinted treatment for the summary stat / filter cards on the list pages
 * (Jobs, Candidates, Requisitions). Each card gets a soft, on-brand tint matched
 * to its meaning; the selected filter carries an espresso ring.
 *
 * Tones: slate (neutral/total) · amber (waiting) · pine (ready/positive) ·
 * gold (live/milestone).
 */
export type StatTone = 'slate' | 'amber' | 'pine' | 'gold'

export const STAT_TONE: Record<StatTone, { fill: string; border: string; ink: string; sub: string }> = {
  slate: { fill: 'bg-slate-50',  border: 'border-slate-200', ink: 'text-slate-900', sub: 'text-slate-500' },
  amber: { fill: 'bg-amber-50',  border: 'border-amber-200', ink: 'text-amber-900', sub: 'text-amber-700' },
  pine:  { fill: 'bg-[#ecf3ef]', border: 'border-[#cfe0d6]', ink: 'text-[#0c362a]', sub: 'text-[#15604a]' },
  gold:  { fill: 'bg-[#fbf3df]', border: 'border-[#eedfb2]', ink: 'text-[#5c4a16]', sub: 'text-[#8a6d1f]' },
}

/** Full wrapper className for a tinted stat/filter card button. */
export function statTileClass(tone: StatTone, active: boolean): string {
  const t = STAT_TONE[tone]
  return `rounded-xl border p-3.5 text-left transition-all ${t.fill} ${t.border} ${active ? 'ring-1 ring-[#221b14]' : ''}`
}
