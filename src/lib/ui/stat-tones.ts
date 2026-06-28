/**
 * Warm tinted treatment for the summary stat / filter cards on the list pages
 * (Jobs, Candidates, Requisitions). Each card gets a soft, on-brand tint matched
 * to its meaning; the selected filter carries an espresso ring.
 *
 * Tones: slate (neutral/total) · amber (waiting) · pine (ready/positive) ·
 * gold (live/milestone).
 */
export type StatTone = 'slate' | 'amber' | 'pine' | 'gold'

// "Medium" warm tints (Variant B) — saturated enough to read against the cream
// page (#faf7f2); the neutral tone is a warm sand, NOT the page color.
export const STAT_TONE: Record<StatTone, { fill: string; border: string; ink: string; sub: string }> = {
  slate: { fill: 'bg-[#f0e7d7]', border: 'border-[#e0d4bd]', ink: 'text-[#2a2118]', sub: 'text-[#7a6f5d]' },
  amber: { fill: 'bg-[#fbdfa4]', border: 'border-[#eecb82]', ink: 'text-[#6f450f]', sub: 'text-[#8a5a14]' },
  pine:  { fill: 'bg-[#c8e2d3]', border: 'border-[#a9d0bd]', ink: 'text-[#0c4634]', sub: 'text-[#15604a]' },
  gold:  { fill: 'bg-[#f0da9d]', border: 'border-[#e2c87f]', ink: 'text-[#5c4413]', sub: 'text-[#7a5c18]' },
}

/** Full wrapper className for a tinted stat/filter card button. */
export function statTileClass(tone: StatTone, active: boolean): string {
  const t = STAT_TONE[tone]
  return `rounded-xl border p-3.5 text-left transition-all ${t.fill} ${t.border} ${active ? 'ring-1 ring-[#221b14]' : ''}`
}
